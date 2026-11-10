import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
