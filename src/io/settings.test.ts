import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from '@/domain'
import { setBridge } from './bridge'
import {
  loadSettings,
  portableDir,
  readSharedSettings,
  relocateSharedSettings,
  resolveLibraryDir,
  resolveSettingsDir,
  saveSettings
} from './settings'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

describe('dossier de la bibliothèque', () => {
  it('va par défaut dans OneDrive quand la machine en a un, sinon dans userData', async () => {
    expect(await resolveLibraryDir(DEFAULT_SETTINGS)).toBe('C:/fake/Pinout/library')
    fs.oneDrive = 'D:/Cesep/OneDrive - CESEP'
    expect(await resolveLibraryDir(DEFAULT_SETTINGS)).toBe(
      'D:/Cesep/OneDrive - CESEP/(Cours)/Robotique/(Ressources)/Pinout/library'
    )
  })

  it('résout un dossier enregistré relativement à OneDrive sur la racine de la machine', async () => {
    fs.oneDrive = 'E:/Autre/OneDrive - CESEP'
    const settings = { ...DEFAULT_SETTINGS, libraryDir: '${OneDrive}/Pinout/lib' }
    expect(await resolveLibraryDir(settings)).toBe('E:/Autre/OneDrive - CESEP/Pinout/lib')
    expect(await resolveLibraryDir({ ...DEFAULT_SETTINGS, libraryDir: 'F:/ailleurs' })).toBe(
      'F:/ailleurs'
    )
  })

  it('enregistre un dossier choisi dans OneDrive sous forme relative', () => {
    expect(portableDir('D:/Cesep/OneDrive - CESEP/Pinout/lib', 'D:/Cesep/OneDrive - CESEP')).toBe(
      '${OneDrive}/Pinout/lib'
    )
    expect(portableDir('D:/Cesep/OneDrive - CESEP', 'D:/Cesep/OneDrive - CESEP/')).toBe(
      '${OneDrive}'
    )
    expect(portableDir('F:/ailleurs', 'D:/Cesep/OneDrive - CESEP')).toBe('F:/ailleurs')
    expect(portableDir('F:/ailleurs', null)).toBe('F:/ailleurs')
  })
})

describe('paramètres locaux et partagés', () => {
  const LOCAL = 'C:/fake/Pinout/settings.json'
  const SHARED = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout/settings.json'
  const mine = {
    ...DEFAULT_SETTINGS,
    theme: 'light' as const,
    recentFiles: ['C:/Docs/a.pinout']
  }

  it('sans OneDrive, tout reste dans le fichier local', async () => {
    await saveSettings(mine)
    expect([...fs.texts.keys()]).toEqual([LOCAL])
    const loaded = await loadSettings()
    expect(loaded.sharedPath).toBeNull()
    expect(loaded.settings).toEqual(mine)
  })

  it('initialise le fichier partagé avec les réglages de la machine, sans ses fichiers récents', async () => {
    await saveSettings(mine)
    fs.oneDrive = 'D:/OneDrive'
    const loaded = await loadSettings()
    expect(loaded.sharedPath).toBe(SHARED)
    expect(loaded.settings).toEqual(mine)
    const shared = parseSettings(await fs.readTextFile(SHARED))
    expect(shared.theme).toBe('light')
    expect(shared.recentFiles).toEqual([])
  })

  it('prend les réglages partagés et garde les fichiers récents de la machine', async () => {
    await saveSettings(mine)
    fs.oneDrive = 'D:/OneDrive'
    const elsewhere = {
      ...DEFAULT_SETTINGS,
      theme: 'dark' as const,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile, name: 'Cours', wireWidth: 0.2 },
      recentFiles: []
    }
    await fs.writeTextFile(SHARED, serializeSettings(elsewhere))
    const loaded = await loadSettings()
    expect(loaded.settings.theme).toBe('dark')
    expect(loaded.settings.defaultProfile.name).toBe('Cours')
    expect(loaded.settings.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect((await readSharedSettings(''))?.defaultProfile.wireWidth).toBe(0.2)
  })

  it('ne réécrit pas le fichier partagé quand seuls les fichiers récents changent', async () => {
    fs.oneDrive = 'D:/OneDrive'
    await saveSettings(mine)
    const write = vi.spyOn(fs, 'writeTextFile')
    await saveSettings({ ...mine, recentFiles: ['C:/Docs/b.pinout', 'C:/Docs/a.pinout'] })
    expect(write.mock.calls.map(([path]) => path)).toEqual([LOCAL])
    await saveSettings({ ...mine, theme: 'dark' })
    expect(write.mock.calls.map(([path]) => path)).toEqual([LOCAL, LOCAL, SHARED])
  })

  it('garde les réglages de la machine quand le fichier partagé est illisible', async () => {
    await saveSettings(mine)
    fs.oneDrive = 'D:/OneDrive'
    await fs.writeTextFile(SHARED, '{ "schemaVersion": ')
    const loaded = await loadSettings()
    expect(loaded.settings).toEqual(mine)
    expect(loaded.problem).toContain('partagés illisibles')
    expect(await readSharedSettings('')).toBeNull()
  })
})

describe('dossier du fichier de paramètres partagé', () => {
  const LOCAL = 'C:/fake/Pinout/settings.json'
  const ELSEWHERE = 'F:/partage/settings.json'
  const mine = {
    ...DEFAULT_SETTINGS,
    theme: 'light' as const,
    recentFiles: ['C:/Docs/a.pinout']
  }

  it('est celui de OneDrive par défaut, ou un dossier noté relativement à OneDrive', async () => {
    expect(await resolveSettingsDir('')).toBeNull()
    expect(await resolveSettingsDir('${OneDrive}/Commun')).toBeNull()
    expect(await resolveSettingsDir('F:/partage')).toBe('F:/partage')
    fs.oneDrive = 'D:/OneDrive'
    expect(await resolveSettingsDir('')).toBe('D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout')
    expect(await resolveSettingsDir('${OneDrive}/Commun')).toBe('D:/OneDrive/Commun')
  })

  it('suit le dossier choisi sur cette machine, même sans OneDrive', async () => {
    await saveSettings({ ...mine, settingsDir: 'F:/partage' })
    // Le fichier partagé ne dit ni où il est rangé ni quels fichiers la machine a ouverts.
    const shared = parseSettings(await fs.readTextFile(ELSEWHERE))
    expect(shared.theme).toBe('light')
    expect(shared.settingsDir).toBe('')
    expect(shared.recentFiles).toEqual([])
    const loaded = await loadSettings()
    expect(loaded.sharedPath).toBe(ELSEWHERE)
    expect(loaded.settings).toEqual({ ...mine, settingsDir: 'F:/partage' })
  })

  it('déplacé dans un dossier vide, y écrit les réglages courants', async () => {
    const moved = await relocateSharedSettings(mine, 'F:/partage')
    expect(moved.adopted).toBe(false)
    expect(moved.sharedPath).toBe(ELSEWHERE)
    expect(moved.settings).toEqual({ ...mine, settingsDir: 'F:/partage' })
    expect(parseSettings(await fs.readTextFile(ELSEWHERE)).theme).toBe('light')
    expect(parseSettings(await fs.readTextFile(LOCAL)).settingsDir).toBe('F:/partage')
  })

  it('déplacé dans un dossier qui a déjà des paramètres, les reprend', async () => {
    await fs.writeTextFile(
      ELSEWHERE,
      serializeSettings({ ...DEFAULT_SETTINGS, autosaveSeconds: 300 })
    )
    const moved = await relocateSharedSettings(mine, 'F:/partage')
    expect(moved.adopted).toBe(true)
    expect(moved.settings.autosaveSeconds).toBe(300)
    expect(moved.settings.theme).toBe(DEFAULT_SETTINGS.theme)
    // Ce qui est propre à la machine reste.
    expect(moved.settings.recentFiles).toEqual(['C:/Docs/a.pinout'])
    expect(moved.settings.settingsDir).toBe('F:/partage')
  })

  it('refuse un dossier dont le fichier est illisible, sans l’écraser', async () => {
    await fs.writeTextFile(ELSEWHERE, '{ "schemaVersion": ')
    await expect(relocateSharedSettings(mine, 'F:/partage')).rejects.toThrow(/illisible/)
    expect(await fs.readTextFile(ELSEWHERE)).toBe('{ "schemaVersion": ')
    expect(fs.texts.has(LOCAL)).toBe(false)
  })
})
