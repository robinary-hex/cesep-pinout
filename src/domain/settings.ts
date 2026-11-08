import { z } from 'zod'
import { hexColorSchema } from './color'
import { DEFAULT_PROFILE, styleProfileSchema } from './profile'

export const SETTINGS_SCHEMA_VERSION = 4

export const paletteColorSchema = z.object({
  name: z.string().min(1),
  hex: hexColorSchema
})
export type PaletteColor = z.infer<typeof paletteColorSchema>

/** Thème de l'interface ; les surfaces de dessin restent claires dans les deux cas. */
export const themeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof themeSchema>

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

export const EXPORT_SCALES = [1, 2, 4] as const
export type ExportScale = (typeof EXPORT_SCALES)[number]
export const exportScaleSchema = z.union([z.literal(1), z.literal(2), z.literal(4)])

/** Réglages d'export d'image, mémorisés d'une fois sur l'autre. */
export const exportSettingsSchema = z.object({
  /** Multiplicateur de la taille de cellule du profil : 1×, 2× ou 4×. */
  scale: exportScaleSchema,
  background: z.union([z.literal('transparent'), z.literal('white'), hexColorSchema]),
  /** Marge autour du contenu, en cellules. */
  marginCells: z.number().int().nonnegative(),
  grid: z.boolean(),
  /** Repères des composants (R1, U2…). */
  labels: z.boolean()
})
export type ExportSettings = z.infer<typeof exportSettingsSchema>

export const DEFAULT_EXPORT: ExportSettings = {
  scale: 2,
  background: 'white',
  marginCells: 2,
  grid: false,
  labels: true
}

export const DEFAULT_AUTOSAVE_SECONDS = 120

export const settingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  /** Dossier de la bibliothèque de composants ; vide = dossier par défaut dans userData. */
  libraryDir: z.string(),
  palette: z.array(paletteColorSchema).min(1),
  /** Dernières couleurs personnalisées, les plus récentes d'abord. */
  customColors: z.array(hexColorSchema),
  defaultWireColor: hexColorSchema,
  defaultProfile: styleProfileSchema,
  /** Chemins des derniers projets ouverts, le plus récent d'abord. */
  recentFiles: z.array(z.string()),
  export: exportSettingsSchema,
  /** Intervalle de la copie de secours, en secondes. */
  autosaveSeconds: z.number().int().positive(),
  theme: themeSchema
})
export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  libraryDir: '',
  palette: [...DEFAULT_PALETTE],
  customColors: [],
  defaultWireColor: '#000000',
  defaultProfile: structuredClone(DEFAULT_PROFILE),
  recentFiles: [],
  export: { ...DEFAULT_EXPORT },
  autosaveSeconds: DEFAULT_AUTOSAVE_SECONDS,
  theme: 'light'
}
