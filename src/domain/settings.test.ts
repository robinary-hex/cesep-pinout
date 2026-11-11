import { describe, expect, it } from 'vitest'
import settingsV1 from './fixtures/v1/settings.json?raw'
import { parseSettings, serializeSettings } from './serialize'
import {
  DEFAULT_AUTOSAVE_SECONDS,
  DEFAULT_EXPORT,
  DEFAULT_SETTINGS,
  settingsSchema
} from './settings'

describe('paramètres', () => {
  it('migre un fichier de version 1 en ajoutant export et copie de secours', () => {
    const settings = parseSettings(settingsV1)
    expect(settings.schemaVersion).toBe(12)
    expect(settings.export).toEqual(DEFAULT_EXPORT)
    expect(settings.autosaveSeconds).toBe(DEFAULT_AUTOSAVE_SECONDS)
    expect(settings.libraryDir).toBe('D:/OneDrive/Pinout/library')
    expect(settings.recentFiles).toEqual(['D:/Documents/alim.pinout.json'])
  })

  it('se réenregistre à l’identique une fois migré', () => {
    const settings = parseSettings(settingsV1)
    const saved = serializeSettings(settings)
    expect(parseSettings(saved)).toEqual(settings)
    expect(serializeSettings(parseSettings(saved))).toBe(saved)
  })

  it('les valeurs par défaut sont valides', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
  })

  it('refuse une échelle d’export inconnue', () => {
    const broken = { ...DEFAULT_SETTINGS, export: { ...DEFAULT_EXPORT, scale: 3 } }
    expect(settingsSchema.safeParse(broken).success).toBe(false)
  })
})
