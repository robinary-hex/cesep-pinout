import { z } from 'zod'
import { hexColorSchema } from './color'
import { isInsideBox, PNG_PX_PER_CELL, QUARTERS_PER_CELL, sizeSchema, type Size } from './grid'
import { pngDataUrlDimensions } from './png'

export const COMPONENT_SCHEMA_VERSION = 15

export const pinKindSchema = z.enum(['in', 'out', 'io', 'power'])
export type PinKind = z.infer<typeof pinKindSchema>
export const PIN_KINDS: readonly PinKind[] = ['in', 'out', 'io', 'power']
export const PIN_KIND_LABELS: Readonly<Record<PinKind, string>> = {
  in: 'Entrée',
  out: 'Sortie',
  io: 'Bidirectionnelle',
  power: 'Alimentation'
}

/** Identifiant du groupe d'un élément (voir groups.ts) ; absent tant qu'il n'est pas groupé. */
export const groupSchema = z.string().min(1).optional()

/** Broche : intersection de grille sur le bord du composant, repère local non tourné. */
export const pinSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: pinKindSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  group: groupSchema,
  /** Groupe de broches où elle est rangée dans le panneau (voir pinGroups.ts) ; absent : aucun. */
  pinGroup: z.string().min(1).optional()
})
export type Pin = z.infer<typeof pinSchema>

/**
 * Groupe de broches nommé (« Alimentation », « Port B »…) : un rangement du panneau de propriétés,
 * rien de dessiné. À ne pas confondre avec `group`, le groupe de sélection d'une forme ou d'une
 * broche sur le dessin.
 */
export const pinGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
})
export type PinGroup = z.infer<typeof pinGroupSchema>

/** Nom d'un fichier d'image d'un composant : lettres, chiffres, tirets, points, et `.png` au bout. */
export const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.png$/

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
    group: groupSchema,
    x: quarterSchema,
    y: quarterSchema,
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    rx: z.number().int().nonnegative(),
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('ellipse'),
    group: groupSchema,
    cx: quarterSchema,
    cy: quarterSchema,
    rx: z.number().int().positive(),
    ry: z.number().int().positive(),
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('line'),
    group: groupSchema,
    x1: quarterSchema,
    y1: quarterSchema,
    x2: quarterSchema,
    y2: quarterSchema,
    arrows: arrowsSchema,
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('polyline'),
    group: groupSchema,
    points: z.array(quarterPointSchema).min(2),
    closed: z.boolean(),
    /** Rayon d'arrondi des angles, en quarts de cellule ; 0 = angles vifs. */
    radius: z.number().int().nonnegative(),
    arrows: arrowsSchema,
    style: shapeStyleSchema
  }),
  z.object({
    kind: z.literal('text'),
    group: groupSchema,
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
    strike: z.boolean(),
    /** Texte tourné de 90° (sens horaire) autour du centre de sa boîte : il se lit de haut en bas. */
    vertical: z.boolean()
  }),
  z.object({
    kind: z.literal('image'),
    group: groupSchema,
    /** Boîte de l'image (coin supérieur gauche, taille) : l'image la remplit en entier. */
    x: quarterSchema,
    y: quarterSchema,
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    /** Nom du fichier PNG rangé à côté de component.json dans la bibliothèque : un nom seul, sans dossier. */
    file: z.string().regex(IMAGE_FILE_PATTERN),
    /** Copie embarquée de l'image (dans un projet ou en mémoire) ; absente du fichier de la bibliothèque. */
    dataUrl: z.string().startsWith('data:image/png;base64,').optional()
  }),
  z.object({
    kind: z.literal('dot'),
    group: groupSchema,
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
/** Nom de chaque forme dans l'interface (panneau, menu contextuel). */
export const PRIMITIVE_KIND_LABELS: Readonly<Record<PrimitiveKind, string>> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Ligne',
  polyline: 'Polyligne',
  dot: 'Point',
  text: 'Texte',
  image: 'Image'
}
export type TextPrimitive = Extract<Primitive, { kind: 'text' }>
export type DotPrimitive = Extract<Primitive, { kind: 'dot' }>
export type ImagePrimitive = Extract<Primitive, { kind: 'image' }>
export type StyledPrimitive = Exclude<Primitive, { kind: 'text' | 'dot' | 'image' }>

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

/** Styles d'un texte, communs aux textes des composants et aux étiquettes du montage. */
export interface TextEmphasis {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

/** Attributs SVG de graisse, d'italique et de décorations d'un texte, sans la famille. */
export function textEmphasisAttrs(text: TextEmphasis): Record<string, string | undefined> {
  const decorations: string[] = []
  if (text.underline) decorations.push('underline')
  if (text.strike) decorations.push('line-through')
  return {
    'font-weight': text.bold ? 'bold' : undefined,
    'font-style': text.italic ? 'italic' : undefined,
    'text-decoration': decorations.length > 0 ? decorations.join(' ') : undefined
  }
}

/** Attributs SVG du style d'un texte de composant : graisse, italique, décorations, famille ; à l'écran comme à l'export. */
export function textStyleAttrs(primitive: TextEmphasis): Record<string, string | undefined> {
  return { ...textEmphasisAttrs(primitive), 'font-family': TEXT_FONT_FAMILY }
}

/**
 * Visuel d'un composant : un dessin, c'est-à-dire des formes dans l'ordre d'empilement. Une image
 * importée est une forme parmi les autres (`image`), pas un type de visuel à part.
 */
export const visualSchema = z.object({
  kind: z.literal('drawing'),
  primitives: z.array(primitiveSchema)
})
export type Visual = z.infer<typeof visualSchema>

/**
 * Ce qu'une variante d'un composant dessine : sa taille, ses formes, ses broches. Un composant en
 * porte un directement (sa première variante) ; chaque variante de plus a le sien, complet.
 */
const componentBodyShape = {
  size: sizeSchema,
  visual: visualSchema,
  pins: z.array(pinSchema),
  /** Groupes de broches, dans l'ordre du panneau ; absent tant qu'il n'y en a pas. */
  pinGroups: z.array(pinGroupSchema).optional()
}
export const componentBodySchema = z.object(componentBodyShape)
export type ComponentBody = z.infer<typeof componentBodySchema>

/**
 * Variante supplémentaire d'un composant (décision du 11 novembre 2026) : le même composant
 * dessiné autrement (LED rouge ou verte, pattes longues ou courtes). Un dessin complet, né d'une
 * copie puis retouché : rien n'est hérité, ce qui permet de tout changer, taille et broches
 * comprises. Deux variantes nées l'une de l'autre gardent les mêmes identifiants de broche : un
 * composant posé qui change de variante garde ses fils.
 */
export const componentVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ...componentBodyShape
})
export type ComponentVariant = z.infer<typeof componentVariantSchema>

const componentShape = z.object({
  schemaVersion: z.literal(COMPONENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  description: z.string(),
  // Le dessin que le composant porte lui-même : celui de sa première variante.
  ...componentBodyShape,
  /** Nom de la variante d'origine (celle que le composant porte), quand il en a d'autres. */
  variantName: z.string().min(1).optional(),
  /** Les autres variantes, dans l'ordre ; absent pour un composant sans variantes. */
  variants: z.array(componentVariantSchema).optional(),
  /**
   * Rang de la variante d'origine dans la liste des variantes ; absent : en tête. L'ordre de la
   * liste ne change l'identité d'aucune variante : on peut les ranger sans toucher aux composants
   * déjà posés.
   */
  baseVariantRank: z.number().int().nonnegative().optional(),
  /**
   * Variante que montre l'aperçu du composant dans la bibliothèque : celle qu'on regardait en
   * l'enregistrant ; absent : la variante d'origine. Une simple indication de présentation, qui
   * ne compte pas quand on compare deux versions d'un composant (`sameComponentContent`).
   */
  previewVariant: z.string().min(1).optional()
})
export type ComponentDefinition = z.infer<typeof componentShape>

/** Identifiant de la variante d'origine d'un composant : celle qu'il porte lui-même. */
export const BASE_VARIANT = 'base'
/** Nom de la variante d'origine tant qu'on ne lui en a pas donné. */
export const DEFAULT_VARIANT_NAME = 'Standard'

/** Une variante dans une liste : son identifiant (`BASE_VARIANT` pour celle d'origine) et son nom. */
export interface VariantInfo {
  id: string
  name: string
}

/**
 * Variantes d'un composant, dans l'ordre de la liste : les autres variantes, et celle d'origine à
 * son rang (`baseVariantRank`, en tête par défaut). Jamais vide.
 */
export function componentVariants(def: ComponentDefinition): VariantInfo[] {
  const list = (def.variants ?? []).map((variant) => ({ id: variant.id, name: variant.name }))
  const rank = Math.min(def.baseVariantRank ?? 0, list.length)
  list.splice(rank, 0, { id: BASE_VARIANT, name: def.variantName ?? DEFAULT_VARIANT_NAME })
  return list
}

/**
 * Ordre des variantes après en avoir glissé une devant une autre (`beforeId`), ou à la fin de la
 * liste (null). Les identifiants, celui de la variante d'origine compris.
 */
export function movedVariantOrder(
  def: ComponentDefinition,
  id: string,
  beforeId: string | null
): string[] {
  const order = componentVariants(def).map((variant) => variant.id)
  if (!order.includes(id) || beforeId === id) return order
  const rest = order.filter((entry) => entry !== id)
  const at = beforeId === null ? -1 : rest.indexOf(beforeId)
  return at === -1 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Le composant a-t-il plus d'une variante ? */
export function hasVariants(def: ComponentDefinition): boolean {
  return (def.variants?.length ?? 0) > 0
}

const resolvedVariants = new WeakMap<ComponentDefinition, Map<string, ComponentDefinition>>()

/**
 * Le composant tel que le dessine une de ses variantes : même identité, mais la taille, les formes
 * et les broches de la variante. Pour la variante d'origine, un identifiant absent ou inconnu,
 * c'est le composant lui-même. Le résultat est gardé : pour un même composant et une même
 * variante, toujours le même objet.
 */
export function variantDefinition(
  def: ComponentDefinition,
  variantId: string | null | undefined
): ComponentDefinition {
  const variant = def.variants?.find((candidate) => candidate.id === variantId)
  if (!variant) return def
  let cache = resolvedVariants.get(def)
  if (!cache) {
    cache = new Map()
    resolvedVariants.set(def, cache)
  }
  let resolved = cache.get(variant.id)
  if (!resolved) {
    resolved = { ...def, size: variant.size, visual: variant.visual, pins: variant.pins }
    if (variant.pinGroups) resolved.pinGroups = variant.pinGroups
    else delete resolved.pinGroups
    cache.set(variant.id, resolved)
  }
  return resolved
}

/** Le composant tel que le montre son aperçu dans la bibliothèque. */
export function previewDefinition(def: ComponentDefinition): ComponentDefinition {
  return variantDefinition(def, def.previewVariant)
}

/** Le même composant, avec cette variante pour aperçu (celle d'origine : la propriété disparaît). */
export function withPreviewVariant(
  def: ComponentDefinition,
  variantId: string | null
): ComponentDefinition {
  const copy = { ...def }
  if (def.variants?.some((variant) => variant.id === variantId) && variantId !== null) {
    copy.previewVariant = variantId
  } else {
    delete copy.previewVariant
  }
  return copy
}

/**
 * Deux versions d'un composant disent-elles la même chose ? La variante de l'aperçu ne compte
 * pas : la changer ne fait pas d'un composant posé un composant « à mettre à jour ».
 */
export function sameComponentContent(a: ComponentDefinition, b: ComponentDefinition): boolean {
  return JSON.stringify(withPreviewVariant(a, null)) === JSON.stringify(withPreviewVariant(b, null))
}

/** Formes de toutes les variantes d'un composant, la première d'abord. */
export function componentPrimitives(def: ComponentDefinition): Primitive[] {
  return [
    ...def.visual.primitives,
    ...(def.variants ?? []).flatMap((variant) => variant.visual.primitives)
  ]
}

/** Le même composant, chaque forme de chaque variante passée par `change`. */
export function mapComponentPrimitives(
  def: ComponentDefinition,
  change: (primitive: Primitive) => Primitive
): ComponentDefinition {
  const next: ComponentDefinition = {
    ...def,
    visual: { ...def.visual, primitives: def.visual.primitives.map(change) }
  }
  if (def.variants) {
    next.variants = def.variants.map((variant) => ({
      ...variant,
      visual: { ...variant.visual, primitives: variant.visual.primitives.map(change) }
    }))
  }
  return next
}

/** Identifiant libre pour une nouvelle variante : v1, v2… */
export function nextVariantId(def: ComponentDefinition): string {
  const taken = new Set((def.variants ?? []).map((variant) => variant.id))
  for (let n = 1; ; n++) {
    const candidate = `v${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Nom proposé pour une nouvelle variante : « Variante 2 », « Variante 3 »…, le premier libre. */
export function nextVariantName(def: ComponentDefinition): string {
  const taken = new Set(componentVariants(def).map((variant) => variant.name))
  for (let n = taken.size + 1; ; n++) {
    const candidate = `Variante ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

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

/** Boîte d'un texte qui peut être vertical : texte de composant (quarts) ou étiquette du montage (cellules). */
export interface TurnableTextBox {
  x: number
  y: number
  w: number
  h: number
  vertical: boolean
}

/**
 * Boîte dans laquelle un texte se met en page : la sienne, ou la même tournée d'un quart de tour
 * (largeur et hauteur échangées, même centre) quand il est vertical.
 */
export function textLayoutBox(text: TurnableTextBox): {
  x: number
  y: number
  w: number
  h: number
} {
  const { x, y, w, h } = text
  if (!text.vertical) return { x, y, w, h }
  return { x: x + w / 2 - h / 2, y: y + h / 2 - w / 2, w: h, h: w }
}

/**
 * Boîte d'un texte qu'on met à la verticale ou à l'horizontale : couchée dans l'autre sens, elle
 * tourne avec lui autour de son centre (à l'unité près, sans dérive d'un aller-retour) ; déjà
 * dans le bon sens, ou carrée, elle ne bouge pas.
 */
export function turnedTextBox(
  box: { x: number; y: number; w: number; h: number },
  vertical: boolean
): { x: number; y: number; w: number; h: number } {
  const { x, y, w, h } = box
  if (vertical ? w <= h : h <= w) return { x, y, w, h }
  const shift = Math.trunc((w - h) / 2)
  return { x: x + shift, y: y - shift, w: h, h: w }
}

/**
 * Attribut `transform` SVG d'un texte vertical : un quart de tour horaire autour du centre de sa
 * boîte, dans l'unité voulue (`scale` par unité de la boîte) ; indéfini pour un texte horizontal.
 */
export function textTransform(text: TurnableTextBox, scale = 1): string | undefined {
  if (!text.vertical) return undefined
  const cx = (text.x + text.w / 2) * scale
  const cy = (text.y + text.h / 2) * scale
  return `rotate(90 ${cx} ${cy})`
}

/** Lignes d'un texte de composant dans sa boîte de mise en page, en quarts de cellule. */
export function layoutText(primitive: TextPrimitive, fields?: FieldValues): TextBoxLayout {
  return layoutTextBox(
    textLayoutBox(primitive),
    textContent(primitive, fields),
    primitive.size * QUARTERS_PER_CELL,
    primitive.anchor
  )
}

export function componentFields(def: ComponentDefinition): ComponentField[] {
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
    case 'image':
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
    case 'image':
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
/**
 * Ce qui cloche dans un composant. Chaque variante est contrôlée comme un composant à part ; dès
 * qu'il y en a plusieurs, le message dit de laquelle il s'agit.
 */
export function componentIssues(def: ComponentDefinition): ComponentIssue[] {
  const variants = def.variants ?? []
  if (variants.length === 0) return bodyIssues(def)
  const issues: ComponentIssue[] = []
  const seen = new Set<string>([BASE_VARIANT])
  for (const variant of componentVariants(def)) {
    if (variant.id !== BASE_VARIANT && seen.has(variant.id)) {
      issues.push({ level: 'error', message: `Identifiant de variante en double : ${variant.id}` })
    }
    seen.add(variant.id)
    for (const issue of bodyIssues(variantDefinition(def, variant.id))) {
      issues.push({ ...issue, message: `Variante « ${variant.name} » : ${issue.message}` })
    }
  }
  return issues
}

/** Contrôles du dessin et des broches que porte un composant (ou une de ses variantes). */
function bodyIssues(def: ComponentDefinition): ComponentIssue[] {
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
  const blankDrawing = def.visual.primitives.length === 0
  if (def.pins.length === 0 && !blankDrawing) {
    issues.push({
      level: 'warning',
      message: 'Aucune broche : le composant ne pourra pas être câblé'
    })
  }

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
  if (
    def.visual.primitives.some(
      (primitive) => primitive.kind === 'image' && primitive.dataUrl === undefined
    )
  ) {
    issues.push({ level: 'warning', message: 'Une image a perdu son fichier' })
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

/** Images d'un composant, toutes variantes comprises, dans l'ordre du dessin. */
export function componentImages(def: ComponentDefinition): ImagePrimitive[] {
  return componentPrimitives(def).filter(
    (primitive): primitive is ImagePrimitive => primitive.kind === 'image'
  )
}

/**
 * Taille d'une image qu'on importe, en quarts de cellule : sa taille naturelle à 80 px par
 * cellule (20 px par quart), au quart le plus proche et jamais nulle.
 */
export function importedImageSize(widthPx: number, heightPx: number): { w: number; h: number } {
  const pxPerQuarter = PNG_PX_PER_CELL / QUARTERS_PER_CELL
  return {
    w: Math.max(1, Math.round(widthPx / pxPerQuarter)),
    h: Math.max(1, Math.round(heightPx / pxPerQuarter))
  }
}

/** Taille naturelle d'une image posée (quarts de cellule), ou null quand son fichier manque. */
export function naturalImageSize(image: ImagePrimitive): { w: number; h: number } | null {
  const pixels = image.dataUrl === undefined ? null : pngDataUrlDimensions(image.dataUrl)
  return pixels ? importedImageSize(pixels.width, pixels.height) : null
}

/** Largeur sur hauteur d'une image : celle de son fichier, sinon celle de sa boîte. */
export function imageRatio(image: ImagePrimitive): number {
  const pixels = image.dataUrl === undefined ? null : pngDataUrlDimensions(image.dataUrl)
  return pixels && pixels.height > 0 && pixels.width > 0
    ? pixels.width / pixels.height
    : image.w / image.h
}

/**
 * Formes qu'on ajoute à un dessin (importées, collées, dupliquées) : leurs images sont nommées
 * pour que, dans le composant, un fichier ne porte qu'une image. Une image déjà là sous un autre
 * nom reprend ce nom (un seul fichier pour deux formes de la même image) ; une image dont le nom
 * est pris par une autre en reçoit un libre (image.png, image-2.png…).
 */
export function withFreeImageFiles(
  existing: readonly Primitive[],
  incoming: readonly Primitive[]
): Primitive[] {
  const contents = new Map<string, string | undefined>()
  for (const primitive of existing) {
    if (primitive.kind === 'image') contents.set(primitive.file, primitive.dataUrl)
  }
  const freeName = (): string => {
    if (!contents.has('image.png')) return 'image.png'
    for (let n = 2; ; n++) {
      const candidate = `image-${n}.png`
      if (!contents.has(candidate)) return candidate
    }
  }
  return incoming.map((primitive) => {
    if (primitive.kind !== 'image') return primitive
    const { dataUrl } = primitive
    if (dataUrl !== undefined) {
      for (const [file, content] of contents) {
        if (content === dataUrl) return file === primitive.file ? primitive : { ...primitive, file }
      }
    }
    const taken = contents.has(primitive.file) && contents.get(primitive.file) !== dataUrl
    const file = taken ? freeName() : primitive.file
    contents.set(file, dataUrl)
    return file === primitive.file ? primitive : { ...primitive, file }
  })
}
