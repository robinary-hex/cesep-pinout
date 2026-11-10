import { z } from 'zod'
import { hexColorSchema } from './color'
import { isInsideBox, PNG_PX_PER_CELL, QUARTERS_PER_CELL, sizeSchema, type Size } from './grid'

export const COMPONENT_SCHEMA_VERSION = 12

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

/**
 * Style d'une forme. L'épaisseur est un multiplicateur du « trait des composants » du profil de
 * style (`componentStroke`, en cellules) : changer le profil change tous les composants d'un coup,
 * chaque forme gardant sa nuance (fin, normal, gras).
 */
export const shapeStyleSchema = z.object({
  stroke: z.union([hexColorSchema, z.literal('none')]),
  weight: z.number().nonnegative(),
  fill: z.union([hexColorSchema, z.literal('none')]),
  /** Opacité du remplissage, de 0 (invisible) à 1 (opaque) ; le trait reste opaque. */
  fillOpacity: z.number().min(0).max(1)
})
export type ShapeStyle = z.infer<typeof shapeStyleSchema>
export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  stroke: '#000000',
  weight: 1,
  fill: 'none',
  fillOpacity: 1
}
/** Nuances proposées par l'interface ; le schéma accepte tout multiplicateur positif. */
export const STROKE_WEIGHTS = [0.5, 1, 1.5, 2, 3] as const

export function strokeWidthCells(style: ShapeStyle, componentStroke: number): number {
  return style.weight * componentStroke
}

/** Pointes de flèche d'une ligne ou polyligne : au départ, au milieu (sens du tracé), à la fin. */
export const arrowsSchema = z.object({ start: z.boolean(), middle: z.boolean(), end: z.boolean() })
export type Arrows = z.infer<typeof arrowsSchema>
export const NO_ARROWS: Arrows = { start: false, middle: false, end: false }

/** Hauteur de référence des textes d'un composant (cellules) ; l'inspecteur propose des multiples. */
export const TEXT_BASE_SIZE_CELLS = 0.5
export const TEXT_SCALES = [1, 1.5, 2, 2.5, 3] as const

/** Alignement horizontal d'un texte dans sa boîte. */
export const textAnchorSchema = z.enum(['start', 'middle', 'end'])
export type TextAnchor = z.infer<typeof textAnchorSchema>

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
    arrows: arrowsSchema,
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('polyline'),
    points: z.array(quarterPointSchema).min(2),
    closed: z.boolean(),
    arrows: arrowsSchema,
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('text'),
    /** Boîte du texte (coin supérieur gauche, taille) : lignes centrées verticalement, alignées selon `anchor`. */
    x: quarterSchema,
    y: quarterSchema,
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    /** Texte affiché (retours à la ligne permis), ou nom du champ si le texte est variable. */
    text: z.string(),
    /** Hauteur du texte, en cellules. */
    size: z.number().positive(),
    anchor: textAnchorSchema,
    color: hexColorSchema,
    /** Texte variable : chaque composant posé donne sa propre valeur au champ nommé `text`. */
    variable: z.boolean(),
    defaultValue: z.string(),
    /** Unité affichée à droite de la valeur d'un texte variable (kΩ, V, mA…) ; vide sinon. */
    unit: z.string(),
    bold: z.boolean(),
    /** Sur le montage, le texte tourne avec le composant (jamais en miroir) ; sinon il reste horizontal. */
    followsRotation: z.boolean(),
    /** Styles : italique, souligné, barré. */
    italic: z.boolean(),
    underline: z.boolean(),
    strike: z.boolean()
  }),
  z.object({
    kind: z.literal('dot'),
    /** Centre du point. */
    x: quarterSchema,
    y: quarterSchema,
    /** Taille : le diamètre vaut deux traits de composant, multipliés par `scale`. */
    scale: z.number().positive(),
    color: hexColorSchema
  })
])
export type Primitive = z.infer<typeof primitiveSchema>
export type PrimitiveKind = Primitive['kind']
export type TextPrimitive = Extract<Primitive, { kind: 'text' }>
export type DotPrimitive = Extract<Primitive, { kind: 'dot' }>
export type StyledPrimitive = Exclude<Primitive, { kind: 'text' | 'dot' }>

/** Tailles de point proposées par l'interface ; le schéma accepte tout multiplicateur positif. */
export const DOT_SCALES = [1, 1.5, 2, 2.5, 3] as const

/**
 * Rayon d'un point, en cellules. Son diamètre vaut deux traits de composant (`componentStroke` du
 * profil) multipliés par sa taille : il s'épaissit avec les traits quand le profil change.
 */
export function dotRadiusCells(scale: number, componentStroke: number): number {
  return scale * componentStroke
}

/** Rayon d'un point pour sa boîte de sélection : estimé avec le trait par défaut (0,1 cellule). */
const DOT_BOUNDS_RADIUS_QUARTERS = 0.1 * QUARTERS_PER_CELL

/** Valeurs des champs variables d'un composant posé : nom du champ → valeur. */
export type FieldValues = Readonly<Record<string, string>>

/** Texte effectivement affiché : la valeur du champ, sinon la valeur par défaut, sinon {nom}. */
export function textContent(primitive: TextPrimitive, fields?: FieldValues): string {
  if (!primitive.variable) return primitive.text
  const value = fields?.[primitive.text]
  const shown =
    value !== undefined && value.length > 0
      ? value
      : primitive.defaultValue.length > 0
        ? primitive.defaultValue
        : `{${primitive.text}}`
  const NO_BREAK_SPACE = String.fromCharCode(0xa0)
  // L'unité suit la valeur, séparée par une espace insécable.
  return primitive.unit.length > 0 ? `${shown}${NO_BREAK_SPACE}${primitive.unit}` : shown
}

export const TEXT_FONT_FAMILY = "'Segoe UI', sans-serif"

/** Attributs SVG du style d'un texte : graisse, italique, décorations, famille ; à l'écran comme à l'export. */
export function textStyleAttrs(primitive: TextPrimitive): Record<string, string | undefined> {
  const decorations: string[] = []
  if (primitive.underline) decorations.push('underline')
  if (primitive.strike) decorations.push('line-through')
  return {
    'font-weight': primitive.bold ? 'bold' : undefined,
    'font-style': primitive.italic ? 'italic' : undefined,
    'text-decoration': decorations.length > 0 ? decorations.join(' ') : undefined,
    'font-family': TEXT_FONT_FAMILY
  }
}

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
    size: { widthCells: 4, heightCells: 2 },
    visual: { kind: 'drawing', primitives: [] },
    pins: []
  }
}

export interface ComponentField {
  name: string
  defaultValue: string
  unit: string
}

/** Champs variables d'un composant (textes variables), dans l'ordre du dessin, sans doublon. */
/** Interligne des textes, en multiple de leur hauteur. */
export const TEXT_LINE_HEIGHT = 1.2

export interface TextLine {
  text: string
  /** Ordonnée du milieu de la ligne, en quarts de cellule. */
  y: number
}

/** Demi-hauteur des capitales sous le milieu de la ligne : place la ligne de base pour centrer un texte. */
export const CAP_CENTER = 0.35

export interface TextBoxLayout {
  /** Abscisse des lignes (gauche, centre ou droite de la boîte selon l'alignement). */
  x: number
  lines: TextLine[]
}

/**
 * Lignes d'un bloc de texte dans une boîte, dans l'unité de la boîte : bloc centré verticalement,
 * capitales centrées sur chaque ligne (`y` = ligne de base), alignement selon `anchor`.
 */
export function layoutTextBox(
  box: { x: number; y: number; w: number; h: number },
  text: string,
  fontHeight: number,
  anchor: TextAnchor
): TextBoxLayout {
  const texts = text.split(String.fromCharCode(10))
  const lineHeight = fontHeight * TEXT_LINE_HEIGHT
  const centerY = box.y + box.h / 2
  const x = anchor === 'start' ? box.x : anchor === 'end' ? box.x + box.w : box.x + box.w / 2
  return {
    x,
    lines: texts.map((line, index) => ({
      text: line,
      y: centerY + (index - (texts.length - 1) / 2) * lineHeight + CAP_CENTER * fontHeight
    }))
  }
}

/** Lignes d'un texte de composant dans sa boîte, en quarts de cellule. */
export function layoutText(primitive: TextPrimitive, fields?: FieldValues): TextBoxLayout {
  return layoutTextBox(
    primitive,
    textContent(primitive, fields),
    primitive.size * QUARTERS_PER_CELL,
    primitive.anchor
  )
}

export function componentFields(def: ComponentDefinition): ComponentField[] {
  if (def.visual.kind !== 'drawing') return []
  const seen = new Set<string>()
  const fields: ComponentField[] = []
  for (const primitive of def.visual.primitives) {
    if (primitive.kind !== 'text' || !primitive.variable || seen.has(primitive.text)) continue
    seen.add(primitive.text)
    fields.push({
      name: primitive.text,
      defaultValue: primitive.defaultValue,
      unit: primitive.unit
    })
  }
  return fields
}

/** Broches encore dans une boîte donnée, bord compris (après redimensionnement). */
export function pinsInside(pins: readonly Pin[], size: Size): Pin[] {
  return pins.filter((pin) => isInsideBox(pin, size))
}

/** Les noms purement numériques suivent l'ordre des broches ; les autres ne bougent pas. */
export function renumberPins(pins: readonly Pin[]): Pin[] {
  return pins.map((pin, index) =>
    /^\d+$/.test(pin.name) ? { ...pin, name: String(index + 1) } : pin
  )
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
    case 'dot': {
      const radius = primitive.scale * DOT_BOUNDS_RADIUS_QUARTERS
      return {
        x1: primitive.x - radius,
        y1: primitive.y - radius,
        x2: primitive.x + radius,
        y2: primitive.y + radius
      }
    }
    case 'text':
      return {
        x1: primitive.x,
        y1: primitive.y,
        x2: primitive.x + primitive.w,
        y2: primitive.y + primitive.h
      }
  }
}

/** Déplacement d'un élément dans l'ordre d'empilement. */
export type StackMove = 'up' | 'down' | 'top' | 'bottom'

/** Même liste avec l'élément `index` avancé, reculé, au premier ou à l'arrière-plan ; nouvel index. */
export function reorderItem<T>(
  list: readonly T[],
  index: number,
  move: StackMove
): { list: T[]; index: number } {
  const item = list[index]
  if (item === undefined) return { list: [...list], index }
  const rest = list.filter((_, i) => i !== index)
  const target =
    move === 'top'
      ? rest.length
      : move === 'bottom'
        ? 0
        : move === 'up'
          ? Math.min(rest.length, index + 1)
          : Math.max(0, index - 1)
  rest.splice(target, 0, item)
  return { list: rest, index: target }
}

/** Même forme décalée de (dx, dy) quarts de cellule. */
export function translatePrimitive(primitive: Primitive, dx: number, dy: number): Primitive {
  switch (primitive.kind) {
    case 'rect':
    case 'text':
    case 'dot':
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
  // Un texte compte par son coin, un point par son centre (il peut être posé sur le bord).
  if (primitive.kind === 'text' || primitive.kind === 'dot') return inBox(primitive.x, primitive.y)
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

    if (!isInsideBox(pin, def.size)) {
      issues.push({
        level: 'error',
        pinId: pin.id,
        message: `Broche ${pin.name} en (${pin.x}, ${pin.y}) : les broches vont dans la boîte du composant`
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

  // Un dessin encore vide n'a rien à câbler : l'avertissement attend la première forme.
  const blankDrawing = def.visual.kind === 'drawing' && def.visual.primitives.length === 0
  if (def.pins.length === 0 && !blankDrawing) {
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
    const emptyField = def.visual.primitives.find(
      (primitive) => primitive.kind === 'text' && primitive.variable && primitive.text.trim() === ''
    )
    if (emptyField) {
      issues.push({ level: 'error', message: 'Un texte variable doit avoir un nom de champ' })
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
