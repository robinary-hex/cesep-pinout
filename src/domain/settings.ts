import { z } from 'zod'
import { hexColorSchema } from './color'
import { DEFAULT_PROFILE, styleProfileSchema } from './profile'

export const SETTINGS_SCHEMA_VERSION = 1

export const paletteColorSchema = z.object({
  name: z.string().min(1),
  hex: hexColorSchema
})
export type PaletteColor = z.infer<typeof paletteColorSchema>

/** Palette de départ : dix couleurs de fils, sans blanc. Modifiable dans les paramètres. */
export const DEFAULT_PALETTE: readonly PaletteColor[] = [
  { name: 'Noir', hex: '#000000' },
  { name: 'Rouge', hex: '#d62828' },
  { name: 'Bleu', hex: '#1d4ed8' },
  { name: 'Vert', hex: '#15803d' },
  { name: 'Jaune', hex: '#eab308' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Violet', hex: '#7e22ce' },
  { name: 'Marron', hex: '#7c4a1e' },
  { name: 'Gris foncé', hex: '#4b5563' },
  { name: 'Gris clair', hex: '#9ca3af' }
]

export const settingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  /** Dossier de la bibliothèque de composants ; vide = dossier par défaut dans userData. */
  libraryDir: z.string(),
  palette: z.array(paletteColorSchema).min(1),
  /** Dernières couleurs personnalisées, les plus récentes d'abord. */
  customColors: z.array(hexColorSchema),
  defaultWireColor: hexColorSchema,
  defaultProfile: styleProfileSchema,
  recentFiles: z.array(z.string())
})
export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  libraryDir: '',
  palette: [...DEFAULT_PALETTE],
  customColors: [],
  defaultWireColor: '#000000',
  defaultProfile: structuredClone(DEFAULT_PROFILE),
  recentFiles: []
}
