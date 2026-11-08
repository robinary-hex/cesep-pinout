import { z } from 'zod'
import { hexColorSchema } from './color'
import { isOnBorder, PNG_PX_PER_CELL, QUARTERS_PER_CELL, sizeSchema } from './grid'

export const COMPONENT_SCHEMA_VERSION = 1

export const pinKindSchema = z.enum(['in', 'out', 'io', 'power'])
export type PinKind = z.infer<typeof pinKindSchema>
export const PIN_KINDS: readonly PinKind[] = ['in', 'out', 'io', 'power']
export const PIN_KIND_LABELS: Readonly<Record<PinKind, string>> = {
  in: 'Entrée',
  out: 'Sortie',
  io: 'Bidirectionnelle',
  power: 'Alimentation'
}

/** Broche : intersection de grille sur le bord du composant, repère local non tourné. */
export const pinSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: pinKindSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative()
})
export type Pin = z.infer<typeof pinSchema>

/** Coordonnée en quarts de cellule (entier), repère local du composant. */
const quarterSchema = z.number().int()
const quarterPointSchema = z.tuple([quarterSchema, quarterSchema])
export type QuarterPoint = z.infer<typeof quarterPointSchema>

export const shapeStyleSchema = z.object({
  stroke: z.union([hexColorSchema, z.literal('none')]),
  /** Épaisseur du trait, en cellules. */
  strokeWidth: z.number().nonnegative(),
  fill: z.union([hexColorSchema, z.literal('none')])
})
export type ShapeStyle = z.infer<typeof shapeStyleSchema>
export const DEFAULT_SHAPE_STYLE: ShapeStyle = { stroke: '#000000', strokeWidth: 0.1, fill: 'none' }

/** Formes du mini-éditeur de composants, rendues en SVG natif. */
export const primitiveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rect'),
    x: quarterSchema,
    y: quarterSchema,
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    rx: z.number().int().nonnegative(),
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('ellipse'),
    cx: quarterSchema,
    cy: quarterSchema,
    rx: z.number().int().positive(),
    ry: z.number().int().positive(),
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('line'),
    x1: quarterSchema,
    y1: quarterSchema,
    x2: quarterSchema,
    y2: quarterSchema,
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('polyline'),
    points: z.array(quarterPointSchema).min(2),
    closed: z.boolean(),
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('text'),
    x: quarterSchema,
    y: quarterSchema,
    text: z.string(),
    /** Hauteur du texte, en cellules. */
    size: z.number().positive(),
    anchor: z.enum(['start', 'middle', 'end']),
    color: hexColorSchema
  })
])
export type Primitive = z.infer<typeof primitiveSchema>
export type PrimitiveKind = Primitive['kind']
export type StyledPrimitive = Exclude<Primitive, { kind: 'text' }>

export const visualSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('png'),
    /** Nom du fichier à côté de component.json dans la bibliothèque. */
    file: z.string().min(1),
    pxPerCell: z.number().int().positive(),
    /** Copie embarquée de l'image (dans un projet ou en mémoire) ; absent dans la bibliothèque. */
    dataUrl: z.string().startsWith('data:image/png;base64,').optional()
  }),
  z.object({
    kind: z.literal('drawing'),
    primitives: z.array(primitiveSchema)
  })
])
export type Visual = z.infer<typeof visualSchema>

const componentShape = z.object({
  schemaVersion: z.literal(COMPONENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  description: z.string(),
  /** Préfixe de repère proposé au montage : R, C, U… */
  labelPrefix: z.string(),
  size: sizeSchema,
  visual: visualSchema,
  pins: z.array(pinSchema)
})
export type ComponentDefinition = z.infer<typeof componentShape>

export const DEFAULT_CATEGORY = 'Divers'

export function createEmptyComponent(id: string, name: string): ComponentDefinition {
  return {
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    id,
    name,
    category: DEFAULT_CATEGORY,
    description: '',
    labelPrefix: '',
    size: { widthCells: 4, heightCells: 2 },
    visual: { kind: 'drawing', primitives: [] },
    pins: []
  }
}

export interface ComponentIssue {
  level: 'error' | 'warning'
  message: string
  pinId?: string
}

/** Boîte englobante d'une forme, en quarts de cellule (approchée pour un texte). */
export interface Bounds {
  x1: number
  y1: number
  x2: number
  y2: number
}

export function primitiveBounds(primitive: Primitive): Bounds {
  switch (primitive.kind) {
    case 'rect':
      return {
        x1: primitive.x,
        y1: primitive.y,
        x2: primitive.x + primitive.w,
        y2: primitive.y + primitive.h
      }
    case 'ellipse':
      return {
        x1: primitive.cx - primitive.rx,
        y1: primitive.cy - primitive.ry,
        x2: primitive.cx + primitive.rx,
        y2: primitive.cy + primitive.ry
      }
    case 'line':
      return {
        x1: Math.min(primitive.x1, primitive.x2),
        y1: Math.min(primitive.y1, primitive.y2),
        x2: Math.max(primitive.x1, primitive.x2),
        y2: Math.max(primitive.y1, primitive.y2)
      }
    case 'polyline': {
      const xs = primitive.points.map(([x]) => x)
      const ys = primitive.points.map(([, y]) => y)
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
    }
    case 'text': {
      // Largeur estimée : 0,6 × hauteur par caractère.
      const width = Math.ceil(primitive.text.length * primitive.size * QUARTERS_PER_CELL * 0.6)
      const half = Math.ceil((primitive.size * QUARTERS_PER_CELL) / 2)
      const x1 =
        primitive.anchor === 'start'
          ? primitive.x
          : primitive.anchor === 'end'
            ? primitive.x - width
            : primitive.x - Math.ceil(width / 2)
      return { x1, y1: primitive.y - half, x2: x1 + width, y2: primitive.y + half }
    }
  }
}

/** Même forme décalée de (dx, dy) quarts de cellule. */
export function translatePrimitive(primitive: Primitive, dx: number, dy: number): Primitive {
  switch (primitive.kind) {
    case 'rect':
    case 'text':
      return { ...primitive, x: primitive.x + dx, y: primitive.y + dy }
    case 'ellipse':
      return { ...primitive, cx: primitive.cx + dx, cy: primitive.cy + dy }
    case 'line':
      return {
        ...primitive,
        x1: primitive.x1 + dx,
        y1: primitive.y1 + dy,
        x2: primitive.x2 + dx,
        y2: primitive.y2 + dy
      }
    case 'polyline':
      return {
        ...primitive,
        points: primitive.points.map(([x, y]): QuarterPoint => [x + dx, y + dy])
      }
  }
}

function primitiveWithin(primitive: Primitive, maxX: number, maxY: number): boolean {
  const inBox = (x: number, y: number): boolean => x >= 0 && x <= maxX && y >= 0 && y <= maxY
  if (primitive.kind === 'text') return inBox(primitive.x, primitive.y)
  const bounds = primitiveBounds(primitive)
  return inBox(bounds.x1, bounds.y1) && inBox(bounds.x2, bounds.y2)
}

/**
 * Contrôles de cohérence d'un composant. Les erreurs rendent le fichier invalide ;
 * les avertissements sont affichés par l'éditeur sans bloquer.
 */
export function componentIssues(def: ComponentDefinition): ComponentIssue[] {
  const issues: ComponentIssue[] = []
  const seenIds = new Set<string>()
  const seenPositions = new Map<string, string>()
  const seenNames = new Set<string>()

  for (const pin of def.pins) {
    if (seenIds.has(pin.id)) {
      issues.push({
        level: 'error',
        pinId: pin.id,
        message: `Identifiant de broche en double : ${pin.id}`
      })
    }
    seenIds.add(pin.id)

    if (!isOnBorder(pin, def.size)) {
      issues.push({
        level: 'error',
        pinId: pin.id,
        message: `Broche ${pin.name} en (${pin.x}, ${pin.y}) : les broches vont sur le bord du composant`
      })
    }

    const positionKey = `${pin.x},${pin.y}`
    const other = seenPositions.get(positionKey)
    if (other !== undefined) {
      issues.push({
        level: 'error',
        pinId: pin.id,
        message: `Broches ${other} et ${pin.name} sur la même intersection (${positionKey})`
      })
    } else {
      seenPositions.set(positionKey, pin.name)
    }

    if (seenNames.has(pin.name)) {
      issues.push({
        level: 'warning',
        pinId: pin.id,
        message: `Nom de broche répété : ${pin.name}`
      })
    }
    seenNames.add(pin.name)
  }

  if (def.pins.length === 0) {
    issues.push({
      level: 'warning',
      message: 'Aucune broche : le composant ne pourra pas être câblé'
    })
  }

  if (def.visual.kind === 'png' && def.visual.pxPerCell !== PNG_PX_PER_CELL) {
    issues.push({
      level: 'warning',
      message: `PNG à ${def.visual.pxPerCell} px par cellule au lieu de ${PNG_PX_PER_CELL}`
    })
  }

  if (def.visual.kind === 'drawing') {
    const maxX = def.size.widthCells * QUARTERS_PER_CELL
    const maxY = def.size.heightCells * QUARTERS_PER_CELL
    if (def.visual.primitives.some((primitive) => !primitiveWithin(primitive, maxX, maxY))) {
      issues.push({ level: 'warning', message: 'Une forme dépasse la boîte du composant' })
    }
  }

  return issues
}

export const componentDefinitionSchema = componentShape.superRefine((def, ctx) => {
  for (const issue of componentIssues(def)) {
    if (issue.level === 'error') {
      ctx.addIssue({ code: 'custom', message: issue.message, path: ['pins'] })
    }
  }
})
