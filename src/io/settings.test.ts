import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from '@/domain'
import { setBridge } from './bridge'
import {
  loadSettings,
  readLegacySettings,
  readSharedSettings,
  relocateSharedSettings,
  saveSettings,
  sharedSettingsPath
} from './settings'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  fs.presetDataDir = null
  setBridge(fs)
})

const LOCAL = 'C:/fake/Pinout/settings.json'
const SHARED = 'D:/Pinout/Applications/parametres.json'
const mine = {
  ...DEFAULT_SETTINGS,
  theme: 'light' as const,
  recentFiles: ['C:/Docs/a.pinout']
}
const settled = { ...mine, dataDir: 'D:/Pinout' }

describe('paramètres locaux et partagés', () => {
  it('tant que le dossier de Pinout n’est pas choisi, tout reste dans le fichier local', async () => {
    expect(await sharedSettingsPath('')).toBeNull()
    await saveSettings(mine)
    expect([...fs.texts.keys()]).toEqual([LOCAL])
    const loaded = await loadSettings()
    expect(loaded.sharedPath).toBeNull()
    expect(loaded.settings).toEqual(mine)
  })

  it('range le fichier partagé dans le dossier Applications du dossier de Pinout', async () => {
    expect(await sharedSettingsPath('D:/Pinout')).toBe(SHARED)
    fs.oneDrive = 'E:/OneDrive'
    expect(await sharedSettingsPath('${OneDrive}/Pinout')).toBe(
      'E:/OneDrive/Pinout/Applications/parametres.json'
    )
  })

  it('initialise le fichier partagé avec les réglages de la machine, sans ce qui lui est propre', async () => {
    await fs.writeTextFile(LOCAL, serializeSettings(settled))
    const loaded = await loadSettings()
    expect(loaded.sharedPath).toBe(SHARED)
    expect(loaded.settings).toEqual(settled)
    // Le fichier partagé ne dit ni où il est rangé ni quels fichiers la machine a ouverts.
    const shared = parseSettings(await fs.readTextFile(SHARED))
    expect(shared.theme).toBe('light')
    expect(shared.recentFiles).toEqual([])
    expect(shared.dataDir).toBe('')
  })

  it('prend les réglages partagés et garde ce qui est propre à la machine', async () => {
    await fs.writeTextFile(LOCAL, serializeSettings(settled))
    const elsewhere = {
      ...DEFAULT_SETTINGS,
      theme: 'dark' as const,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile, name: 'Cours', wireWidth: 0.2 }
    }
    await fs.writeTextFile(SHARED, serializeSettings(elsewhere))
    const loaded = await loadSettings()
    expect(loaded.settings.theme).toBe('dark')
    expect(loaded.settings.defaultProfile.name).toBe('Cours')
    expect(loaded.settings.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect(loaded.settings.dataDir).toBe('D:/Pinout')
    expect((await readSharedSettings('D:/Pinout'))?.defaultProfile.wireWidth).toBe(0.2)
  })

  it('ne réécrit pas le fichier partagé quand seuls les fichiers récents changent', async () => {
    await saveSettings(settled)
    const write = vi.spyOn(fs, 'writeTextFile')
    await saveSettings({ ...settled, recentFiles: ['C:/Docs/b.pinout', 'C:/Docs/a.pinout'] })
    expect(write.mock.calls.map(([path]) => path)).toEqual([LOCAL])
    await saveSettings({ ...settled, theme: 'dark' })
    expect(write.mock.calls.map(([path]) => path)).toEqual([LOCAL, LOCAL, SHARED])
  })

  it('garde les réglages de la machine quand le fichier partagé est illisible', async () => {
    await fs.writeTextFile(LOCAL, serializeSettings(settled))
    await fs.writeTextFile(SHARED, '{ "schemaVersion": ')
    const loaded = await loadSettings()
    expect(loaded.settings).toEqual(settled)
    expect(loaded.problem).toContain('partagés illisibles')
    expect(await readSharedSettings('D:/Pinout')).toBeNull()
  })

  it('n’écrit rien au lancement tant que le dossier reste à choisir', async () => {
    const loaded = await loadSettings()
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS)
    expect(loaded.sharedPath).toBeNull()
    expect(fs.texts.size).toBe(0)
  })
})

describe('changement de dossier de Pinout', () => {
  it('dans un dossier neuf, y écrit les réglages courants', async () => {
    const moved = await relocateSharedSettings(mine, 'D:/Pinout')
    expect(moved.adopted).toBe(false)
    expect(moved.sharedPath).toBe(SHARED)
    expect(moved.settings).toEqual(settled)
    expect(parseSettings(await fs.readTextFile(SHARED)).theme).toBe('light')
    expect(parseSettings(await fs.readTextFile(LOCAL)).dataDir).toBe('D:/Pinout')
  })

  it('dans un dossier qui a déjà ses paramètres, les reprend', async () => {
    await fs.writeTextFile(SHARED, serializeSettings({ ...DEFAULT_SETTINGS, autosaveSeconds: 300 }))
    const brought = { ...DEFAULT_SETTINGS, autosaveSeconds: 45 }
    const moved = await relocateSharedSettings(mine, 'D:/Pinout', brought)
    expect(moved.adopted).toBe(true)
    // Ceux du dossier l'emportent, même sur ce qu'on apportait.
    expect(moved.settings.autosaveSeconds).toBe(300)
    expect(moved.settings.theme).toBe(DEFAULT_SETTINGS.theme)
    // Ce qui est propre à la machine reste.
    expect(moved.settings.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect(moved.settings.dataDir).toBe('D:/Pinout')
  })

  it('dans un dossier neuf, y met les paramètres apportés de l’ancienne organisation', async () => {
    const brought = { ...DEFAULT_SETTINGS, autosaveSeconds: 45, theme: 'dark' as const }
    const moved = await relocateSharedSettings(mine, 'D:/Pinout', brought)
    expect(moved.adopted).toBe(false)
    expect(moved.settings.autosaveSeconds).toBe(45)
    expect(moved.settings.theme).toBe('dark')
    expect(moved.settings.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect(parseSettings(await fs.readTextFile(SHARED)).autosaveSeconds).toBe(45)
  })

  it('refuse un dossier dont le fichier est illisible, sans l’écraser', async () => {
    await fs.writeTextFile(SHARED, '{ "schemaVersion": ')
    await expect(relocateSharedSettings(mine, 'D:/Pinout')).rejects.toThrow(/illisible/)
    expect(await fs.readTextFile(SHARED)).toBe('{ "schemaVersion": ')
    expect(fs.texts.has(LOCAL)).toBe(false)
  })
})

describe('paramètres de l’ancienne organisation', () => {
  const OLD_SHARED = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout/settings.json'
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

  it('au lancement, sont lus sans que rien ne soit écrit ; leurs dossiers sont retenus', async () => {
    await fs.writeTextFile(LOCAL, old({ libraryDir: 'F:/lib', theme: 'light' }))
    const loaded = await loadSettings()
    // Migrés : le dossier de Pinout reste à choisir.
    expect(loaded.settings.dataDir).toBe('')
    expect(loaded.settings.theme).toBe('light')
    expect(loaded.sharedPath).toBeNull()
    expect(loaded.legacy).toEqual({ libraryDir: 'F:/lib', settingsDir: '' })
    // Le fichier d'origine n'a pas bougé : tant qu'on n'a pas choisi, on peut tout reprendre.
    expect(JSON.parse(await fs.readTextFile(LOCAL))).toMatchObject({ schemaVersion: 14 })
    expect(fs.texts.size).toBe(1)
  })

  it('se retrouvent dans l’ancien fichier partagé, s’il y en a un de lisible', async () => {
    const defaults = { libraryDir: '', settingsDir: '' }
    expect(await readLegacySettings(defaults)).toBeNull()
    fs.oneDrive = 'D:/OneDrive'
    expect(await readLegacySettings(defaults)).toBeNull()
    await fs.writeTextFile(OLD_SHARED, old({ autosaveSeconds: 90 }))
    const settings = await readLegacySettings(defaults)
    expect(settings?.autosaveSeconds).toBe(90)
    expect(settings?.dataDir).toBe('')
    await fs.writeTextFile(OLD_SHARED, '{ "schemaVersion": ')
    expect(await readLegacySettings(defaults)).toBeNull()
  })
})
