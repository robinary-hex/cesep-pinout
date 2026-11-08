import { z } from 'zod'
import { hexColorSchema } from './color'
import { componentDefinitionSchema, type ComponentDefinition, type Pin } from './component'
import {
  gridCoordSchema,
  gridPointSchema,
  rotationSchema,
  transformLocalPoint,
  type GridPoint,
  type LocalPoint
} from './grid'
import { styleProfileSchema, type StyleProfile } from './profile'
import { isUTurn } from './wires'

export const PROJECT_SCHEMA_VERSION = 5

/** Composant posé sur le montage ; (x, y) = coin supérieur gauche de sa boîte, en grille. */
export const componentInstanceSchema = z.object({
  id: z.string().min(1),
  defId: z.string().min(1),
  x: gridCoordSchema,
  y: gridCoordSchema,
  rotation: rotationSchema,
  mirror: z.boolean(),
  /** Repère affiché : R1, U2… (libre, vide par défaut). */
  label: z.string(),
  /** Valeurs des textes variables de la définition : nom du champ → valeur. */
  fields: z.record(z.string(), z.string())
})
export type ComponentInstance = z.infer<typeof componentInstanceSchema>

/** Extrémités libres d'un fil, à l'écran comme à l'export : nettes, en flèche ou en pointillés. */
export const freeEndStyleSchema = z.enum(['flat', 'arrow', 'dotted'])
export type FreeEndStyle = z.infer<typeof freeEndStyleSchema>

/**
 * Un fil valide est une polyligne d'intersections à segments horizontaux ou verticaux, sans
 * sommet confondu ni demi-tour. Un sommet au milieu d'un segment droit est permis (il sert à
 * l'édition). Retourne la première anomalie, ou null.
 */
export function wireGeometryProblem(points: ReadonlyArray<GridPoint>): string | null {
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (previous === undefined || current === undefined) continue
    const [ax, ay] = previous
    const [bx, by] = current
    if (ax === bx && ay === by) return `Sommets ${i - 1} et ${i} confondus`
    if (ax !== bx && ay !== by) return `Segment ${i - 1} à ${i} ni horizontal ni vertical`
    const before = points[i - 2]
    if (before !== undefined && isUTurn(before, previous, current)) {
      return `Segment ${i - 1} à ${i} revient sur le précédent`
    }
  }
  return null
}

export const wireSchema = z
  .object({
    id: z.string().min(1),
    color: hexColorSchema,
    points: z.array(gridPointSchema).min(2),
    /** Rang d'empilement : un fil de rang supérieur passe au-dessus aux croisements. */
    stack: z.number().int(),
    freeEnds: freeEndStyleSchema,
    /** Étiquettes d'extrémité (nom de net, destination), affichées sur une extrémité libre. */
    endLabels: z.object({ start: z.string(), end: z.string() })
  })
  .superRefine((wire, ctx) => {
    const problem = wireGeometryProblem(wire.points)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem, path: ['points'] })
  })
export type Wire = z.infer<typeof wireSchema>

/** Exception locale à l'ordre d'empilement : à ce croisement, ce fil passe au-dessus. */
export const crossingOverrideSchema = z.object({
  x: gridCoordSchema,
  y: gridCoordSchema,
  topWireId: z.string().min(1)
})
export type CrossingOverride = z.infer<typeof crossingOverrideSchema>

export const textLabelSchema = z.object({
  id: z.string().min(1),
  x: gridCoordSchema,
  y: gridCoordSchema,
  text: z.string(),
  /** Taille de police en points ; par défaut celle du profil. */
  size: z.number().positive(),
  bold: z.boolean()
})
export type TextLabel = z.infer<typeof textLabelSchema>

const projectShape = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  name: z.string(),
  /** Copie du profil de style au moment de la création (ou du dernier changement de profil). */
  profile: styleProfileSchema,
  components: z.array(componentInstanceSchema),
  wires: z.array(wireSchema),
  crossingOverrides: z.array(crossingOverrideSchema),
  labels: z.array(textLabelSchema),
  /** Copie de chaque définition utilisée, une par type : le projet se suffit à lui-même. */
  embeddedDefs: z.record(z.string(), componentDefinitionSchema)
})
export type Project = z.infer<typeof projectShape>

export const projectSchema = projectShape.superRefine((project, ctx) => {
  const addIssue = (message: string, path: (string | number)[]): void => {
    ctx.addIssue({ code: 'custom', message, path })
  }

  const instanceIds = new Set<string>()
  project.components.forEach((instance, i) => {
    if (instanceIds.has(instance.id)) {
      addIssue(`Identifiant de composant en double : ${instance.id}`, ['components', i, 'id'])
    }
    instanceIds.add(instance.id)
    if (!Object.hasOwn(project.embeddedDefs, instance.defId)) {
      addIssue(`Composant ${instance.id} : définition ${instance.defId} absente de embeddedDefs`, [
        'components',
        i,
        'defId'
      ])
    }
  })

  const wireIds = new Set<string>()
  project.wires.forEach((wire, i) => {
    if (wireIds.has(wire.id))
      addIssue(`Identifiant de fil en double : ${wire.id}`, ['wires', i, 'id'])
    wireIds.add(wire.id)
  })

  project.crossingOverrides.forEach((override, i) => {
    if (!wireIds.has(override.topWireId)) {
      addIssue(
        `Exception de croisement en (${override.x}, ${override.y}) : fil ${override.topWireId} inconnu`,
        ['crossingOverrides', i, 'topWireId']
      )
    }
  })

  for (const [key, def] of Object.entries(project.embeddedDefs)) {
    if (def.id !== key) {
      addIssue(`embeddedDefs : la clé ${key} ne correspond pas à l'identifiant ${def.id}`, [
        'embeddedDefs',
        key
      ])
    }
  }
})

export function createEmptyProject(name: string, profile: StyleProfile): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    profile: structuredClone(profile),
    components: [],
    wires: [],
    crossingOverrides: [],
    labels: [],
    embeddedDefs: {}
  }
}

/** Position absolue, en grille, d'une broche d'une instance posée (rotation et miroir compris). */
export function absolutePinPosition(
  instance: ComponentInstance,
  def: ComponentDefinition,
  pin: Pin
): LocalPoint {
  const local = transformLocalPoint(
    { x: pin.x, y: pin.y },
    def.size,
    instance.rotation,
    instance.mirror
  )
  return { x: instance.x + local.x, y: instance.y + local.y }
}
