import { beforeEach, describe, expect, it } from 'vitest'
import { setBridge } from './bridge'
import {
  copyComponents,
  dataFolder,
  defaultDirSuccessor,
  legacyFoldersOf,
  legacyLibraryDir,
  legacySettingsFile,
  portableDir,
  prepareDataFolder,
  proposedDataDir,
  relocatedPath,
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

  it('propose (Pinout) à la racine de OneDrive, sinon un dossier Pinout dans Documents', async () => {
    const defaults = { libraryDir: '', settingsDir: '' }
    expect(await proposedDataDir(defaults)).toBe('C:/fake/Documents/Pinout')
    // Sans OneDrive, un dossier choisi pour les anciens paramètres reste proposé.
    expect(await proposedDataDir({ libraryDir: '', settingsDir: 'F:/partage' })).toBe('F:/partage')
    fs.oneDrive = 'D:/OneDrive'
    expect(await proposedDataDir(defaults)).toBe('D:/OneDrive/(Pinout)')
    // L'ancienne organisation, dans le dossier du cours, ne retient plus la proposition : ce
    // qu'elle contient sera copié dans le nouveau dossier.
    const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
    await fs.writeTextFile(`${course}/settings.json`, '{}')
    expect(await proposedDataDir(defaults)).toBe('D:/OneDrive/(Pinout)')
    expect(await proposedDataDir({ libraryDir: '', settingsDir: 'F:/partage' })).toBe(
      'D:/OneDrive/(Pinout)'
    )
    // L'ancien dossier par défaut a déjà ses données et le nouveau pas encore : c'est lui qui est
    // proposé, pour ne rien laisser derrière.
    await fs.writeTextFile(`${course}/Applications/parametres.json`, '{}')
    expect(await proposedDataDir(defaults)).toBe(course)
    // Dès que le nouveau a les siennes, c'est lui.
    await fs.writeTextFile('D:/OneDrive/(Pinout)/Applications/parametres.json', '{}')
    expect(await proposedDataDir(defaults)).toBe('D:/OneDrive/(Pinout)')
  })
})

describe('le dossier par défaut a changé de place', () => {
  const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
  const next = 'D:/OneDrive/(Pinout)'

  it('passe de l’ancien dossier par défaut au nouveau, s’il est là avec ses réglages', async () => {
    fs.oneDrive = 'D:/OneDrive'
    // Le nouveau dossier n'existe pas encore sur cette machine : on reste où l'on est.
    expect(await defaultDirSuccessor(course)).toBeNull()
    // Un dossier vide ne suffit pas : il lui faut ses réglages.
    await fs.ensureDir(`${next}/Composants`)
    expect(await defaultDirSuccessor(course)).toBeNull()
    await fs.writeTextFile(`${next}/Applications/parametres.json`, '{}')
    expect(await defaultDirSuccessor(course)).toBe(next)
    // Windows ne distingue ni la casse ni le sens des séparateurs.
    expect(
      await defaultDirSuccessor('d:\\onedrive\\(cours)\\robotique\\(ressources)\\pinout\\')
    ).toBe(next)
    // Un dossier qu'on a choisi soi-même ne bouge pas, ni le nouveau lui-même.
    expect(await defaultDirSuccessor('F:/Pinout')).toBeNull()
    expect(await defaultDirSuccessor('D:/OneDrive/Pinout')).toBeNull()
    expect(await defaultDirSuccessor(next)).toBeNull()
  })

  it('ne change rien sans OneDrive, ni quand le dossier est imposé', async () => {
    await fs.writeTextFile(`${next}/Applications/parametres.json`, '{}')
    expect(await defaultDirSuccessor(course)).toBeNull()
    fs.oneDrive = 'D:/OneDrive'
    fs.presetDataDir = 'C:/fake/Donnees'
    expect(await defaultDirSuccessor(course)).toBeNull()
  })

  it('cherche dans le nouveau dossier ce qui était dans l’ancien, et rien d’autre', () => {
    expect(relocatedPath(`${course}/Montages/feu.pinout`, course, next)).toBe(
      `${next}/Montages/feu.pinout`
    )
    expect(relocatedPath(`${course}/Composants/led`, `${course}/`, next)).toBe(
      `${next}/Composants/led`
    )
    expect(relocatedPath(course, course, next)).toBe(next)
    // Chemins de Windows, casse et séparateurs mêlés.
    expect(
      relocatedPath(
        'D:\\OneDrive\\(Cours)\\Robotique\\(Ressources)\\Pinout\\Diagrammes\\tri.pinuml',
        'd:\\onedrive\\(cours)\\robotique\\(ressources)\\pinout',
        'D:\\OneDrive\\(Pinout)'
      )
    ).toBe('D:\\OneDrive\\(Pinout)\\Diagrammes\\tri.pinuml')
    // Ailleurs : inchangé, même pour un dossier dont le nom commence pareil.
    expect(relocatedPath('C:/Docs/a.pinout', course, next)).toBe('C:/Docs/a.pinout')
    expect(relocatedPath(`${course} (copie)/a.pinout`, course, next)).toBe(
      `${course} (copie)/a.pinout`
    )
  })
})
