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

const fontSchema = z.object({
  family: z.string().min(1),
  size: z.number().positive()
})
export type FontSpec = z.infer<typeof fontSchema>

/** Taille par défaut des étiquettes d'extrémité (points), plus lisible que les repères. */
export const DEFAULT_END_LABEL_SIZE = 14

/**
 * Profil de style : l'échelle et le trait. L'application en a un, général (paramètres) ; chaque
 * montage en garde une copie dans son fichier, celle avec laquelle il se dessine. Changer de
 * profil redimensionne un montage sans le casser, puisque les composants gardent leur taille en
 * cellules.
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
  /** Repères des composants (R1, U2…) et étiquettes texte, en points. */
  labelFont: fontSchema,
  /** Étiquettes d'extrémité des fils (nom de net, destination), en points. */
  endLabelFont: fontSchema
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
  labelFont: { family: 'Segoe UI', size: 11 },
  endLabelFont: { family: 'Segoe UI', size: DEFAULT_END_LABEL_SIZE }
}

/** Réglages d'un profil, regroupés comme le panneau de propriétés les présente. */
export type ProfileFact =
  'name' | 'cell' | 'wires' | 'componentStroke' | 'junction' | 'labels' | 'endLabels'

function sameFont(a: FontSpec, b: FontSpec): boolean {
  return a.family === b.family && a.size === b.size
}

/** Groupes de réglages où `profile` s'écarte de `reference` (le profil général), dans l'ordre. */
export function profileDifferences(profile: StyleProfile, reference: StyleProfile): ProfileFact[] {
  const facts: ProfileFact[] = []
  if (profile.name !== reference.name) facts.push('name')
  if (profile.cellPx !== reference.cellPx) facts.push('cell')
  if (
    profile.wireWidth !== reference.wireWidth ||
    profile.cornerRadius !== reference.cornerRadius
  ) {
    facts.push('wires')
  }
  if (profile.componentStroke !== reference.componentStroke) facts.push('componentStroke')
  if (
    profile.junctionScale !== reference.junctionScale ||
    profile.junctionColor.toLowerCase() !== reference.junctionColor.toLowerCase()
  ) {
    facts.push('junction')
  }
  if (!sameFont(profile.labelFont, reference.labelFont)) facts.push('labels')
  if (!sameFont(profile.endLabelFont, reference.endLabelFont)) facts.push('endLabels')
  return facts
}

export function sameProfile(a: StyleProfile, b: StyleProfile): boolean {
  return profileDifferences(a, b).length === 0
}

/** Version du fichier des profils enregistrés (profils.json). */
export const PROFILES_SCHEMA_VERSION = 1

/**
 * Fichier des profils de style enregistrés : tous dans un seul fichier, à côté des paramètres
 * (décision du 11 novembre 2026 ; ils étaient un par fichier). Dans l'ordre alphabétique.
 */
export function serializeProfiles(profiles: readonly StyleProfile[]): string {
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return (
    JSON.stringify({ schemaVersion: PROFILES_SCHEMA_VERSION, profiles: sorted }, null, 2) + '\n'
  )
}
