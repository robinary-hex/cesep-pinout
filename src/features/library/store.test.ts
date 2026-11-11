import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { useLibraryStore } from './store'

const SHARED = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout/settings.json'
let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  fs.oneDrive = 'D:/OneDrive'
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

describe('paramètres partagés entre machines', () => {
  it('crée le fichier partagé au premier lancement et y écrit les réglages', async () => {
    const library = useLibraryStore()
    await library.init()
    expect(library.sharedSettingsPath).toBe(SHARED)
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

  it('change le dossier des paramètres : y écrit les siens, ou reprend ceux qui s’y trouvent', async () => {
    const library = useLibraryStore()
    await library.init()
    await library.updateSettings({ theme: 'light' })
    // Dossier vide : les réglages courants y vont.
    fs.openDialogAnswers.push('F:/partage')
    expect(await library.chooseSettingsDir()).toBe('moved')
    expect(library.sharedSettingsPath).toBe('F:/partage/settings.json')
    expect(parseSettings(await fs.readTextFile('F:/partage/settings.json')).theme).toBe('light')
    // Un dossier de OneDrive se note relativement à sa racine ; ses paramètres sont repris.
    await fs.writeTextFile(
      'D:/OneDrive/Commun/settings.json',
      serializeSettings({ ...DEFAULT_SETTINGS, autosaveSeconds: 300 })
    )
    fs.openDialogAnswers.push('D:/OneDrive/Commun')
    expect(await library.chooseSettingsDir()).toBe('adopted')
    expect(library.settingsDir).toBe('${OneDrive}/Commun')
    expect(library.autosaveSeconds).toBe(300)
    // Les réglages suivants vont dans ce fichier, plus dans l'ancien.
    await library.updateSettings({ autosaveSeconds: 60 })
    expect(
      parseSettings(await fs.readTextFile('D:/OneDrive/Commun/settings.json')).autosaveSeconds
    ).toBe(60)
    expect(parseSettings(await fs.readTextFile('F:/partage/settings.json')).autosaveSeconds).toBe(
      DEFAULT_SETTINGS.autosaveSeconds
    )
    // Annuler le dialogue ne change rien.
    expect(await library.chooseSettingsDir()).toBeNull()
    expect(library.settingsDir).toBe('${OneDrive}/Commun')
  })

  it('refuse un dossier dont les paramètres sont illisibles et garde l’ancien', async () => {
    const library = useLibraryStore()
    await library.init()
    await fs.writeTextFile('F:/casse/settings.json', 'pas du JSON')
    expect(await library.setSettingsDir('F:/casse')).toBe('failed')
    expect(library.problem).toContain('illisible')
    expect(library.sharedSettingsPath).toBe(SHARED)
    expect(library.settingsDir).toBe('')
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
