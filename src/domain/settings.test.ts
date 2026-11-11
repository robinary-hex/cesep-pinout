import { describe, expect, it } from 'vitest'
import settingsV1 from './fixtures/v1/settings.json?raw'
import { parseSettings, serializeSettings } from './serialize'
import { isDarkColor } from './diagramShapes'
import {
  DEFAULT_AUTOSAVE_SECONDS,
  DEFAULT_DIAGRAM_PALETTE,
  DEFAULT_EXPORT,
  DEFAULT_PALETTE,
  DEFAULT_SETTINGS,
  settingsSchema
} from './settings'

describe('paramètres', () => {
  it('migre un fichier de version 1 en ajoutant export et copie de secours', () => {
    const settings = parseSettings(settingsV1)
    expect(settings.schemaVersion).toBe(15)
    expect(settings.export).toEqual(DEFAULT_EXPORT)
    expect(settings.autosaveSeconds).toBe(DEFAULT_AUTOSAVE_SECONDS)
    // Les anciens dossiers ne sont plus des réglages : le dossier de Pinout reste à choisir.
    expect(settings.dataDir).toBe('')
    expect('libraryDir' in settings).toBe(false)
    expect(settings.recentFiles).toEqual(['D:/Documents/alim.pinout.json'])
  })

  it('donne aux diagrammes leur palette : le noir, puis des tons doux', () => {
    expect(DEFAULT_SETTINGS.diagramPalette).toEqual(DEFAULT_DIAGRAM_PALETTE)
    expect(DEFAULT_DIAGRAM_PALETTE).toHaveLength(10)
    // Le noir d'abord : c'est la couleur d'un nouveau nœud et d'un nouveau lien.
    expect(DEFAULT_DIAGRAM_PALETTE[0]).toEqual({ name: 'Noir', hex: '#000000' })
    // Les autres sont des couleurs claires, et aucune n'est une couleur vive des fils.
    const wires = new Set(DEFAULT_PALETTE.map((color) => color.hex))
    for (const color of DEFAULT_DIAGRAM_PALETTE.slice(1)) {
      expect(isDarkColor(color.hex), color.name).toBe(false)
      expect(wires.has(color.hex), color.name).toBe(false)
    }
    expect(new Set(DEFAULT_DIAGRAM_PALETTE.map((color) => color.hex)).size).toBe(10)
    // Une palette garde au moins une couleur.
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, diagramPalette: [] }).success).toBe(
      false
    )
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
