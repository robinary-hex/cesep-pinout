import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyComponent,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  parseSettings,
  serializeComponentDefinition,
  serializeSettings
} from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { useLibraryStore } from './store'

// Le dossier de Pinout est imposé dans les tests (voir FakeFs) : pas de question à l'ouverture.
const ROOT = 'C:/fake/Donnees'
const SHARED = `${ROOT}/Applications/parametres.json`
const LOCAL = 'C:/fake/Pinout/settings.json'
let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

describe('paramètres partagés entre machines', () => {
  it('crée le fichier partagé dans le dossier de Pinout et y écrit les réglages', async () => {
    const library = useLibraryStore()
    await library.init()
    expect(library.firstRun).toBeNull()
    expect(library.dataRoot).toBe(ROOT)
    expect(library.sharedSettingsPath).toBe(SHARED)
    // La bibliothèque est son dossier Composants ; les quatre sous-dossiers sont créés.
    expect(library.libraryDir).toBe(`${ROOT}/Composants`)
    expect((await fs.readDir(ROOT)).map((entry) => entry.name).sort()).toEqual([
      'Applications',
      'Composants',
      'Diagrammes',
      'Montages'
    ])
    await library.updateSettings({ theme: 'light' })
    expect(parseSettings(await fs.readTextFile(SHARED)).theme).toBe('light')
  })

  it('reprend ce qu’une autre machine a changé, en gardant ses fichiers récents', async () => {
    const library = useLibraryStore()
    await library.init()
    await library.addRecentFile('C:/Docs/a.pinout')
    expect(await library.reloadSharedSettings()).toBe(false)

    // Une autre machine change le profil général et le thème.
    const elsewhere = {
      ...DEFAULT_SETTINGS,
      theme: 'light' as const,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile, name: 'Cours', wireWidth: 0.2 }
    }
    await fs.writeTextFile(SHARED, serializeSettings(elsewhere))
    expect(await library.reloadSharedSettings()).toBe(true)
    expect(library.theme).toBe('light')
    expect(library.defaultProfile.name).toBe('Cours')
    expect(library.recentFiles).toEqual(['C:/Docs/a.pinout'])
  })

  it('n’écrase pas un réglage changé ailleurs quand il en enregistre un autre', async () => {
    const library = useLibraryStore()
    await library.init()
    const elsewhere = { ...DEFAULT_SETTINGS, autosaveSeconds: 300 }
    await fs.writeTextFile(SHARED, serializeSettings(elsewhere))
    await library.updateSettings({ theme: 'light' })
    const shared = parseSettings(await fs.readTextFile(SHARED))
    expect(shared.autosaveSeconds).toBe(300)
    expect(shared.theme).toBe('light')
  })
})

describe('cases d’affichage des barres d’outils', () => {
  it('les garde d’un lancement à l’autre, sans écraser un réglage changé ailleurs', async () => {
    const library = useLibraryStore()
    await library.init()
    expect([library.showPins, library.showUnconnected, library.showGroups]).toEqual([
      true,
      true,
      true
    ])
    // Une autre machine change un réglage entre-temps.
    await fs.writeTextFile(SHARED, serializeSettings({ ...DEFAULT_SETTINGS, autosaveSeconds: 300 }))
    library.setViewOption('showPins', false)
    library.setViewOption('showGroups', false)
    // À l'écran tout de suite, sans attendre le fichier.
    expect([library.showPins, library.showGroups]).toEqual([false, false])
    await vi.waitFor(async () => {
      expect(parseSettings(await fs.readTextFile(SHARED))).toMatchObject({
        showPins: false,
        showUnconnected: true,
        showGroups: false,
        autosaveSeconds: 300
      })
    })

    // Au lancement suivant, les cases reviennent comme on les a laissées.
    setActivePinia(createPinia())
    const next = useLibraryStore()
    await next.init()
    expect([next.showPins, next.showUnconnected, next.showGroups]).toEqual([false, true, false])
  })
})

describe('dossier de Pinout', () => {
  const component = (id: string): string =>
    serializeComponentDefinition({ ...createEmptyComponent(id, id.toUpperCase()), id })
  const profile = (name: string, cellPx: number): string =>
    JSON.stringify({ ...DEFAULT_PROFILE, name, cellPx })
  /** Un fichier de paramètres d'avant : version 14, avec ses deux dossiers. */
  const old = (patch: object): string =>
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      schemaVersion: 14,
      dataDir: undefined,
      libraryDir: '',
      settingsDir: '',
      ...patch
    })

  it('au premier lancement, reste à choisir : un dossier est proposé, rien n’est écrit', async () => {
    fs.presetDataDir = null
    const library = useLibraryStore()
    await library.init()
    expect(library.firstRun).toEqual({ proposal: 'C:/fake/Documents/Pinout' })
    expect(library.dataRoot).toBeNull()
    expect(library.libraryDir).toBe('')
    expect(library.sharedSettingsPath).toBeNull()
    expect(fs.texts.size).toBe(0)
    expect(fs.dirs.size).toBe(0)
    expect(await library.documentDir('montage')).toBeNull()
  })

  it('accepté, il est préparé et retenu pour les lancements suivants', async () => {
    fs.presetDataDir = null
    fs.oneDrive = 'D:/OneDrive'
    const library = useLibraryStore()
    await library.init()
    expect(library.firstRun?.proposal).toBe('D:/OneDrive/Pinout')
    expect(await library.setDataDir('D:/OneDrive/Pinout')).toBe('moved')
    expect(library.firstRun).toBeNull()
    expect(library.dataRoot).toBe('D:/OneDrive/Pinout')
    expect(library.libraryDir).toBe('D:/OneDrive/Pinout/Composants')
    expect(library.sharedSettingsPath).toBe('D:/OneDrive/Pinout/Applications/parametres.json')
    expect((await fs.readDir('D:/OneDrive/Pinout')).map((entry) => entry.name).sort()).toEqual([
      'Applications',
      'Composants',
      'Diagrammes',
      'Montages'
    ])
    // Dans OneDrive, il se note relativement à sa racine : valable quel que soit le disque.
    expect(parseSettings(await fs.readTextFile(LOCAL)).dataDir).toBe('${OneDrive}/Pinout')
    // Le fichier partagé ne dit pas où il est rangé.
    const shared = parseSettings(await fs.readTextFile(library.sharedSettingsPath ?? ''))
    expect(shared.dataDir).toBe('')

    // Lancement suivant : plus de question.
    setActivePinia(createPinia())
    const next = useLibraryStore()
    await next.init()
    expect(next.firstRun).toBeNull()
    expect(next.dataRoot).toBe('D:/OneDrive/Pinout')
  })

  it('reprend ce que l’ancienne organisation avait : réglages, composants, profils', async () => {
    fs.presetDataDir = null
    fs.oneDrive = 'D:/OneDrive'
    const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
    await fs.writeTextFile(LOCAL, old({ recentFiles: ['C:/Docs/a.pinout'], theme: 'dark' }))
    await fs.writeTextFile(`${course}/settings.json`, old({ theme: 'light', autosaveSeconds: 90 }))
    await fs.writeTextFile(`${course}/library/led/component.json`, component('led'))
    await fs.writeBinaryFile(`${course}/library/led/boitier.png`, 'QUJD')
    await fs.writeTextFile('C:/fake/Pinout/profiles/compact.json', profile('Compact', 16))
    const before = new Map(fs.texts)

    const library = useLibraryStore()
    await library.init()
    // Le dossier qui servait déjà est proposé : les nouvelles données s'y rangent à côté.
    expect(library.firstRun).toEqual({ proposal: course })
    expect(await library.setDataDir(course)).toBe('moved')
    // Les réglages partagés d'avant, avec ce qui est propre à cette machine.
    expect(library.theme).toBe('light')
    expect(library.autosaveSeconds).toBe(90)
    expect(library.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect(
      parseSettings(await fs.readTextFile(`${course}/Applications/parametres.json`))
    ).toMatchObject({ theme: 'light', autosaveSeconds: 90, recentFiles: [] })
    // Les composants, images comprises.
    expect(library.entries.map((entry) => entry.def?.id)).toEqual(['led'])
    expect(await fs.readBinaryFile(`${course}/Composants/led/boitier.png`)).toBe('QUJD')
    // Les profils enregistrés, réunis dans un fichier.
    const profiles = JSON.parse(await fs.readTextFile(`${course}/Applications/profils.json`)) as {
      profiles: { name: string }[]
    }
    expect(profiles.profiles.map((saved) => saved.name)).toEqual(['Compact'])
    // Rien n'est retiré ni modifié là où c'était : une version antérieure s'en sert encore.
    for (const [file, text] of before) {
      if (file !== LOCAL) expect(fs.texts.get(file), file).toBe(text)
    }
    expect(await fs.pathExists(`${course}/library/led/boitier.png`)).toBe(true)
  })

  it('sur une autre machine, prend ce que le dossier contient déjà', async () => {
    fs.presetDataDir = null
    // Le dossier, déjà rempli par une autre machine ; ici, d'anciennes données locales.
    await fs.writeTextFile(
      'F:/Pinout/Applications/parametres.json',
      serializeSettings({ ...DEFAULT_SETTINGS, autosaveSeconds: 300 })
    )
    await fs.writeTextFile('F:/Pinout/Composants/moteur/component.json', component('moteur'))
    await fs.writeTextFile(
      'F:/Pinout/Applications/profils.json',
      JSON.stringify({ schemaVersion: 1, profiles: [{ ...DEFAULT_PROFILE, name: 'Compact' }] })
    )
    await fs.writeTextFile(LOCAL, old({ autosaveSeconds: 45 }))
    await fs.writeTextFile('C:/fake/Pinout/library/led/component.json', component('led'))
    await fs.writeTextFile('C:/fake/Pinout/profiles/compact.json', profile('Compact', 16))
    await fs.writeTextFile('C:/fake/Pinout/profiles/aere.json', profile('Aéré', 28))

    const library = useLibraryStore()
    await library.init()
    expect(await library.setDataDir('F:/Pinout')).toBe('adopted')
    expect(library.autosaveSeconds).toBe(300)
    // Sa bibliothèque a déjà ses composants : ceux de la machine n'y sont pas ajoutés.
    expect(library.entries.map((entry) => entry.def?.id)).toEqual(['moteur'])
    // Les profils de la machine dont le nom manque s'ajoutent ; celui du dossier est gardé.
    const profiles = JSON.parse(await fs.readTextFile('F:/Pinout/Applications/profils.json')) as {
      profiles: { name: string; cellPx: number }[]
    }
    expect(profiles.profiles.map((saved) => saved.name)).toEqual(['Aéré', 'Compact'])
    expect(profiles.profiles[1]?.cellPx).toBe(DEFAULT_PROFILE.cellPx)
  })

  it('changé ensuite pour un dossier neuf, il y emporte réglages, profils et composants', async () => {
    const library = useLibraryStore()
    await library.init()
    await library.updateSettings({ theme: 'light' })
    await fs.writeTextFile(`${ROOT}/Composants/led/component.json`, component('led'))
    await fs.writeTextFile(
      `${ROOT}/Applications/profils.json`,
      JSON.stringify({ schemaVersion: 1, profiles: [{ ...DEFAULT_PROFILE, name: 'Compact' }] })
    )
    await library.refresh()
    // Le dossier imposé ne l'est plus : on choisit le sien.
    fs.presetDataDir = null
    fs.openDialogAnswers.push('E:/Atelier')
    expect(await library.chooseDataDir()).toBe('moved')
    expect(fs.openDialogCalls.at(-1)).toMatchObject({ directory: true, defaultPath: ROOT })
    expect(library.dataRoot).toBe('E:/Atelier')
    expect(
      parseSettings(await fs.readTextFile('E:/Atelier/Applications/parametres.json')).theme
    ).toBe('light')
    expect(library.entries.map((entry) => entry.def?.id)).toEqual(['led'])
    expect(await fs.pathExists('E:/Atelier/Applications/profils.json')).toBe(true)
    // L'ancien dossier garde tout.
    expect(await fs.pathExists(`${ROOT}/Composants/led/component.json`)).toBe(true)
    // Les réglages suivants vont dans le nouveau, plus dans l'ancien.
    await library.updateSettings({ autosaveSeconds: 60 })
    expect(
      parseSettings(await fs.readTextFile('E:/Atelier/Applications/parametres.json'))
        .autosaveSeconds
    ).toBe(60)
    expect(parseSettings(await fs.readTextFile(SHARED)).autosaveSeconds).toBe(
      DEFAULT_SETTINGS.autosaveSeconds
    )
    // Annuler le dialogue ne change rien.
    expect(await library.chooseDataDir()).toBeNull()
    expect(library.dataRoot).toBe('E:/Atelier')
  })

  it('refuse un dossier dont les paramètres sont illisibles et garde l’ancien', async () => {
    const library = useLibraryStore()
    await library.init()
    fs.presetDataDir = null
    await fs.writeTextFile('F:/casse/Applications/parametres.json', 'pas du JSON')
    expect(await library.setDataDir('F:/casse')).toBe('failed')
    expect(library.problem).toContain('illisible')
    expect(library.dataRoot).toBe(ROOT)
    expect(library.sharedSettingsPath).toBe(SHARED)
  })
})

describe('dossier proposé pour enregistrer et ouvrir', () => {
  it('est celui du dossier de Pinout tant qu’on n’a rien enregistré ailleurs', async () => {
    const library = useLibraryStore()
    await library.init()
    expect(await library.documentDir('montage')).toBe(`${ROOT}/Montages`)
    expect(await library.documentDir('diagram')).toBe(`${ROOT}/Diagrammes`)
  })

  it('devient le dernier dossier qui a servi, pour chaque genre de document', async () => {
    const library = useLibraryStore()
    await library.init()
    await fs.writeTextFile('E:/Cours/tp1/alim.pinout', '{}')
    await fs.writeTextFile('E:/Cours/schemas/flux.pinuml', '{}')
    await library.addRecentFile('E:/Cours/tp1/alim.pinout')
    expect(await library.documentDir('montage')).toBe('E:/Cours/tp1')
    // Un montage enregistré ailleurs ne déplace pas les diagrammes.
    expect(await library.documentDir('diagram')).toBe(`${ROOT}/Diagrammes`)
    await library.addRecentFile('E:/Cours/schemas/flux.pinuml')
    expect(await library.documentDir('diagram')).toBe('E:/Cours/schemas')
    expect(await library.documentDir('montage')).toBe('E:/Cours/tp1')
  })

  it('revient au dossier de Pinout si le dernier dossier a disparu', async () => {
    const library = useLibraryStore()
    await library.init()
    await library.addRecentFile('G:/cle-usb/alim.pinout')
    expect(await library.documentDir('montage')).toBe(`${ROOT}/Montages`)
    // Illisible, c'est pareil.
    fs.pathExists = () => Promise.reject(new Error('lecteur non prêt'))
    expect(await library.documentDir('montage')).toBe(`${ROOT}/Montages`)
  })
})
