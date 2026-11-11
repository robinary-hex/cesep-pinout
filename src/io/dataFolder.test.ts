import { beforeEach, describe, expect, it } from 'vitest'
import { setBridge } from './bridge'
import {
  copyComponents,
  dataFolder,
  legacyFoldersOf,
  legacyLibraryDir,
  legacySettingsFile,
  portableDir,
  prepareDataFolder,
  proposedDataDir,
  resolveDataRoot
} from './dataFolder'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  fs.presetDataDir = null
  setBridge(fs)
})

describe('dossier de Pinout', () => {
  it('range tout dans quatre sous-dossiers', () => {
    expect(dataFolder('D:/Pinout')).toEqual({
      root: 'D:/Pinout',
      components: 'D:/Pinout/Composants',
      montages: 'D:/Pinout/Montages',
      diagrams: 'D:/Pinout/Diagrammes',
      application: 'D:/Pinout/Applications',
      settingsFile: 'D:/Pinout/Applications/parametres.json',
      profilesFile: 'D:/Pinout/Applications/profils.json'
    })
  })

  it('se résout sur chaque machine, ou reste à choisir', async () => {
    expect(await resolveDataRoot('')).toBeNull()
    expect(await resolveDataRoot('F:/Pinout')).toBe('F:/Pinout')
    // Noté relativement à OneDrive : introuvable sans OneDrive, sinon sous sa racine.
    expect(await resolveDataRoot('${OneDrive}/Pinout')).toBeNull()
    fs.oneDrive = 'E:/OneDrive - CESEP'
    expect(await resolveDataRoot('${OneDrive}/Pinout')).toBe('E:/OneDrive - CESEP/Pinout')
    // Un dossier imposé (essais automatisés) passe avant tout.
    fs.presetDataDir = 'C:/essai'
    expect(await resolveDataRoot('F:/Pinout')).toBe('C:/essai')
    expect(await resolveDataRoot('')).toBe('C:/essai')
  })

  it('enregistre un dossier choisi dans OneDrive sous forme relative', () => {
    expect(portableDir('D:/Cesep/OneDrive - CESEP/Pinout', 'D:/Cesep/OneDrive - CESEP')).toBe(
      '${OneDrive}/Pinout'
    )
    expect(portableDir('D:/Cesep/OneDrive - CESEP', 'D:/Cesep/OneDrive - CESEP/')).toBe(
      '${OneDrive}'
    )
    expect(portableDir('F:/ailleurs', 'D:/Cesep/OneDrive - CESEP')).toBe('F:/ailleurs')
    expect(portableDir('F:/ailleurs', null)).toBe('F:/ailleurs')
  })

  it('crée ses sous-dossiers, sans toucher à ce qui s’y trouve', async () => {
    await fs.writeTextFile('D:/Pinout/Montages/alim.pinout', '{}')
    await prepareDataFolder('D:/Pinout')
    const names = (await fs.readDir('D:/Pinout')).map((entry) => entry.name).sort()
    expect(names).toEqual(['Applications', 'Composants', 'Diagrammes', 'Montages'])
    expect(await fs.readTextFile('D:/Pinout/Montages/alim.pinout')).toBe('{}')
  })
})

describe('copie d’une bibliothèque de composants', () => {
  beforeEach(async () => {
    await fs.writeTextFile('C:/avant/library/led/component.json', '{"id":"led"}')
    await fs.writeBinaryFile('C:/avant/library/led/boitier.png', 'QUJD')
    await fs.writeTextFile('C:/avant/library/resistance/component.json', '{"id":"resistance"}')
    // Ni un dossier sans composant, ni un fichier isolé ne sont des composants.
    await fs.writeTextFile('C:/avant/library/brouillons/notes.txt', 'rien')
    await fs.writeTextFile('C:/avant/library/lisezmoi.txt', 'rien')
  })

  it('copie chaque composant, images comprises, sans rien retirer à l’origine', async () => {
    expect(await copyComponents('C:/avant/library', 'D:/Pinout/Composants')).toBe(2)
    expect(await fs.readTextFile('D:/Pinout/Composants/led/component.json')).toBe('{"id":"led"}')
    expect(await fs.readBinaryFile('D:/Pinout/Composants/led/boitier.png')).toBe('QUJD')
    expect(await fs.pathExists('D:/Pinout/Composants/resistance/component.json')).toBe(true)
    expect(await fs.pathExists('D:/Pinout/Composants/brouillons')).toBe(false)
    expect(await fs.pathExists('C:/avant/library/led/component.json')).toBe(true)
  })

  it('ne touche pas à une bibliothèque qui a déjà ses composants', async () => {
    await fs.writeTextFile('D:/Pinout/Composants/moteur/component.json', '{"id":"moteur"}')
    expect(await copyComponents('C:/avant/library', 'D:/Pinout/Composants')).toBe(0)
    expect((await fs.readDir('D:/Pinout/Composants')).map((entry) => entry.name)).toEqual([
      'moteur'
    ])
  })

  it('ne fait rien d’un dossier vers lui-même, ni d’un dossier absent', async () => {
    expect(await copyComponents('C:/avant/library', 'C:\\avant\\library\\')).toBe(0)
    expect(await copyComponents('C:/nulle-part', 'D:/Pinout/Composants')).toBe(0)
  })
})

describe('ancienne organisation : deux dossiers au lieu d’un', () => {
  it('relit les deux anciens dossiers dans le fichier de paramètres d’origine', () => {
    const old = JSON.stringify({
      schemaVersion: 14,
      libraryDir: '${OneDrive}/Pinout/lib',
      settingsDir: 'F:/partage'
    })
    expect(legacyFoldersOf(old)).toEqual({
      libraryDir: '${OneDrive}/Pinout/lib',
      settingsDir: 'F:/partage'
    })
    // Sans fichier, déjà à la nouvelle organisation, ou illisible : les dossiers par défaut d'alors.
    const defaults = { libraryDir: '', settingsDir: '' }
    expect(legacyFoldersOf(null)).toEqual(defaults)
    expect(legacyFoldersOf(JSON.stringify({ schemaVersion: 15, dataDir: '' }))).toEqual(defaults)
    expect(legacyFoldersOf('{ "schemaVersion": ')).toEqual(defaults)
  })

  it('retrouve l’ancien fichier de paramètres et l’ancienne bibliothèque', async () => {
    const defaults = { libraryDir: '', settingsDir: '' }
    // Sans OneDrive : pas de fichier partagé, la bibliothèque était dans userData.
    expect(await legacySettingsFile(defaults)).toBeNull()
    expect(await legacyLibraryDir(defaults)).toBe('C:/fake/Pinout/library')
    fs.oneDrive = 'D:/OneDrive'
    const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
    expect(await legacyLibraryDir(defaults)).toBe(`${course}/library`)
    // Le fichier ne compte que s'il existe.
    expect(await legacySettingsFile(defaults)).toBeNull()
    await fs.writeTextFile(`${course}/settings.json`, '{}')
    expect(await legacySettingsFile(defaults)).toBe(`${course}/settings.json`)
    // Des dossiers choisis, dont un noté relativement à OneDrive.
    const chosen = { libraryDir: '${OneDrive}/Pinout/lib', settingsDir: 'F:/partage' }
    expect(await legacyLibraryDir(chosen)).toBe('D:/OneDrive/Pinout/lib')
    await fs.writeTextFile('F:/partage/settings.json', '{}')
    expect(await legacySettingsFile(chosen)).toBe('F:/partage/settings.json')
  })

  it('propose le dossier qui servait déjà, sinon un dossier Pinout dans OneDrive ou Documents', async () => {
    const defaults = { libraryDir: '', settingsDir: '' }
    expect(await proposedDataDir(defaults)).toBe('C:/fake/Documents/Pinout')
    fs.oneDrive = 'D:/OneDrive'
    expect(await proposedDataDir(defaults)).toBe('D:/OneDrive/Pinout')
    // Le dossier par défaut d'avant n'est proposé que s'il existe sur cette machine.
    const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
    await fs.writeTextFile(`${course}/settings.json`, '{}')
    expect(await proposedDataDir(defaults)).toBe(course)
    // Un dossier choisi pour les paramètres l'emporte, existant ou non.
    expect(await proposedDataDir({ libraryDir: '', settingsDir: 'F:/partage' })).toBe('F:/partage')
  })
})
