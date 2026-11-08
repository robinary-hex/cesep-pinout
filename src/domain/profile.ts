import { z } from 'zod'
import { hexColorSchema } from './color'

/** Facteurs possibles pour le point de jonction ; ×1 = même diamètre que le fil, donc invisible. */
export const JUNCTION_SCALES = [1, 1.5, 2, 2.5] as const
export type JunctionScale = (typeof JUNCTION_SCALES)[number]
export const junctionScaleSchema = z.union([
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
  z.literal(2.5)
])

/** Trait de base des composants dessinés, en cellules ; les formes le multiplient. */
export const DEFAULT_COMPONENT_STROKE = 0.1

/**
 * Profil de style : l'échelle et le trait, partagés entre projets.
 * Un projet en garde une copie. Changer de profil redimensionne un montage sans le casser,
 * puisque les composants gardent leur taille en cellules.
 */
export const styleProfileSchema = z.object({
  name: z.string().min(1),
  /** Pixels par cellule à l'écran, à zoom 100 %. */
  cellPx: z.number().int().positive(),
  /** Épaisseur des fils, en cellules. */
  wireWidth: z.number().positive(),
  /** Rayon des coins arrondis, en cellules (borné au rendu à la moitié du plus court segment). */
  cornerRadius: z.number().nonnegative(),
  /** Trait de base des composants dessinés, en cellules (multiplié par le poids de chaque forme). */
  componentStroke: z.number().positive(),
  /** Diamètre du point de jonction = wireWidth × junctionScale. */
  junctionScale: junctionScaleSchema,
  /** 'wire' = couleur du fil porteur ; sinon une couleur fixe. */
  junctionColor: z.union([z.literal('wire'), hexColorSchema]),
  labelFont: z.object({
    family: z.string().min(1),
    size: z.number().positive()
  })
})
export type StyleProfile = z.infer<typeof styleProfileSchema>

export const DEFAULT_PROFILE: StyleProfile = {
  name: 'Standard',
  cellPx: 20,
  wireWidth: 0.15,
  cornerRadius: 0.4,
  componentStroke: DEFAULT_COMPONENT_STROKE,
  junctionScale: 2,
  junctionColor: 'wire',
  labelFont: { family: 'Segoe UI', size: 11 }
}
