import {
  ownFieldNames,
  renumberPins,
  translatePrimitive,
  type ComponentDefinition,
  type CountModel,
  type FieldValues,
  type ImagePrimitive,
  type Pin,
  type Primitive,
  type QuarterPoint,
  type Stretch,
  type StretchSpan
} from './component'
import { QUARTERS_PER_CELL } from './grid'

// Composants extensibles (décision du 17 novembre 2026) : un bornier à deux points qu'on étire à
// trois, puis à quatre ; un connecteur d'un contact qui en prend huit ; une plaque à trous qu'on
// agrandit. Dans un sens, deux traits coupent le dessin en trois : un début, un motif, une fin.
// Étirer, c'est répéter le motif. Un dessin s'étire en largeur (`x` : deux traits verticaux), en
// hauteur (`y` : deux traits horizontaux), ou dans les deux sens à la fois (décision du 18
// novembre 2026) : chaque sens a alors son motif et son nombre, et les quatre traits coupent le
// dessin en neuf. Ses coins ne bougent pas, ses bords se répètent dans leur sens, son centre dans
// les deux.
//
// Toute la règle est écrite en largeur ; l'étirement en hauteur est le même, appliqué au dessin
// dont on a échangé abscisses et ordonnées (`turnedDrawing`), puis remis à l'endroit. Les deux
// sens s'enchaînent : la largeur d'abord, puis la hauteur du résultat.
//
//   - ce qui est à gauche du motif ne bouge pas, ce qui est à droite suit ;
//   - ce qui tient dans le motif est recopié dans chaque motif, broches comprises ;
//   - une forme à cheval sur un trait s'allonge (un contour, un texte centré) ;
//   - une image à cheval est coupée aux traits : seule sa tranche du milieu se répète ;
//   - chaque copie d'un texte variable a son champ à elle (`ownFieldNames`).
//
// Le résultat est un composant comme un autre : tout ce qui dessine ou relie un exemplaire posé
// passe par `instanceDefinition`, qui rend ce composant étiré, et n'a rien d'autre à savoir.

/** Au-delà, un composant ne s'étire plus, quoi que dise sa définition. */
export const STRETCH_MAX_COUNT = 64

/** Sens dans lequel un composant s'étire : en largeur ('x') ou en hauteur ('y'). */
export type StretchAxis = 'x' | 'y'
export const STRETCH_AXES: readonly StretchAxis[] = ['x', 'y']

/** Nombre de motifs dans chaque sens ; 1 dans un sens où le composant ne s'étire pas. */
export interface StretchCounts {
  x: number
  y: number
}

/**
 * Nombres de motifs qu'on demande : un par sens (absent ou null : le nombre de départ de ce
 * sens), ou un seul nombre, pour le premier sens où le composant s'étire.
 */
export type WantedCounts = number | { x?: number | null; y?: number | null } | null | undefined

/** Les sens où un dessin s'étire : en largeur, en hauteur, les deux, ou aucun. */
export function stretchAxes(stretch: Stretch | null | undefined): StretchAxis[] {
  return stretch ? STRETCH_AXES.filter((axis) => stretch[axis] !== undefined) : []
}

/** Le premier sens où un dessin s'étire : en largeur s'il le fait, sinon en hauteur. */
export function stretchAxis(stretch: Stretch | null | undefined): StretchAxis {
  return stretchAxes(stretch)[0] ?? 'x'
}

/**
 * Le sens d'un dessin qui ne s'étire que dans un sens ; null s'il s'étire dans les deux, ou pas
 * du tout. Les modèles par nombre ne valent que là : un dessin par nombre de motifs.
 */
export function singleAxis(stretch: Stretch | null | undefined): StretchAxis | null {
  const axes = stretchAxes(stretch)
  return axes.length === 1 ? (axes[0] ?? null) : null
}

/** Étendue d'une boîte dans un sens, en cellules : sa largeur, ou sa hauteur. */
export function stretchExtent(size: ComponentDefinition['size'], axis: StretchAxis): number {
  return axis === 'y' ? size.heightCells : size.widthCells
}

/** Réglages d'un sens qu'on vient d'activer : tout le dessin est le motif, de 1 à 12. */
export function defaultSpan(extentCells: number): StretchSpan {
  return {
    from: 0,
    to: Math.max(1, extentCells) * QUARTERS_PER_CELL,
    initial: 1,
    min: 1,
    max: 12
  }
}

/**
 * Réglages d'un composant qu'on rend extensible dans un sens : tout son dessin est le motif.
 * `extentCells` est son étendue dans ce sens (`stretchExtent`).
 */
export function defaultStretch(extentCells: number, axis: StretchAxis = 'x'): Stretch {
  return { [axis]: defaultSpan(extentCells) }
}

/** Taille du motif, en cellules : ce dont le composant s'allonge à chaque motif de plus. */
export function motifCells(span: StretchSpan): number {
  return (span.to - span.from) / QUARTERS_PER_CELL
}

/**
 * Les réglages d'un sens ramenés à ce qui est permis : un motif dans la boîte du composant,
 * large d'un nombre entier de cellules (les broches recopiées restent sur la grille) et d'une au
 * moins ; un minimum d'au moins 1, un maximum qui ne le dépasse pas vers le bas, un nombre de
 * départ entre les deux. `extentCells` est l'étendue de la boîte dans ce sens.
 */
export function normalizedSpan(span: StretchSpan, extentCells: number): StretchSpan {
  const extent = Math.max(1, extentCells) * QUARTERS_PER_CELL
  const cells = Math.max(
    1,
    Math.min(Math.round((span.to - span.from) / QUARTERS_PER_CELL), Math.max(1, extentCells))
  )
  const size = cells * QUARTERS_PER_CELL
  const from = Math.max(0, Math.min(Math.round(span.from), extent - size))
  const min = Math.max(1, Math.min(Math.round(span.min), STRETCH_MAX_COUNT))
  const max = Math.max(min, Math.min(Math.round(span.max), STRETCH_MAX_COUNT))
  const initial = Math.max(min, Math.min(Math.round(span.initial), max))
  return { from, to: from + size, initial, min, max }
}

/** Les réglages d'un composant extensible, chaque sens ramené à ce que sa boîte permet. */
export function normalizedStretch(stretch: Stretch, size: ComponentDefinition['size']): Stretch {
  const next: Stretch = { ...stretch }
  for (const axis of STRETCH_AXES) {
    const span = stretch[axis]
    if (span) next[axis] = normalizedSpan(span, stretchExtent(size, axis))
  }
  return next
}

/**
 * Nombre de motifs dans un sens : celui qu'on demande, ramené entre ses bornes ; sans demande,
 * son nombre de départ. Toujours 1 dans un sens où le composant ne s'étire pas.
 */
export function spanCount(span: StretchSpan | undefined, count: number | null | undefined): number {
  if (!span) return 1
  const wanted = count === null || count === undefined ? span.initial : Math.round(count)
  return Math.max(span.min, Math.min(wanted, span.max, STRETCH_MAX_COUNT))
}

/** Nombres de motifs d'un composant dans chaque sens, ramenés entre ses bornes. */
export function stretchCounts(
  def: Pick<ComponentDefinition, 'stretch'>,
  wanted?: WantedCounts
): StretchCounts {
  const stretch = def.stretch
  const asked = typeof wanted === 'number' ? { [stretchAxis(stretch)]: wanted } : (wanted ?? {})
  return { x: spanCount(stretch?.x, asked.x), y: spanCount(stretch?.y, asked.y) }
}

/**
 * Nombre de motifs d'un composant dans son premier sens, ramené entre ses bornes ; sans demande,
 * son nombre de départ. Toujours 1 pour un composant qui n'est pas extensible.
 */
export function stretchCount(
  def: Pick<ComponentDefinition, 'stretch'>,
  count?: number | null
): number {
  return stretchCounts(def, count)[stretchAxis(def.stretch)]
}

/**
 * Identifiant de la copie d'une broche du motif : la première garde le sien. `x` est le rang
 * de sa copie en largeur, `y` en hauteur : « p1#2 » en largeur seule, « p1#2.1 » dès qu'elle
 * est aussi recopiée en hauteur.
 */
export function stretchPinId(id: string, x: number, y = 0): string {
  if (y > 0) return `${id}#${x}.${y}`
  return x === 0 ? id : `${id}#${x}`
}

/** D'où vient une broche d'un composant étiré : la broche du dessin, et le rang de sa copie. */
export function stretchPinSource(id: string): { base: string; x: number; y: number } {
  const match = /^(.*)#(\d+)(?:\.(\d+))?$/.exec(id)
  return match?.[1] !== undefined && match[2] !== undefined
    ? { base: match[1], x: Number(match[2]), y: match[3] === undefined ? 0 : Number(match[3]) }
    : { base: id, x: 0, y: 0 }
}

type Zone = 'before' | 'motif' | 'after' | 'across'

/**
 * Où tombe une étendue horizontale (quarts de cellule) par rapport au motif. Ce qui n'a pas de
 * largeur (une broche, un point, un trait vertical) appartient au motif depuis son trait de gauche
 * jusqu'avant celui de droite : posé pile sur le trait de droite, il est à la fin. Un trait de
 * séparation sur le trait de gauche se retrouve ainsi une fois à chaque motif, jamais en double.
 */
function zoneOf(x1: number, x2: number, span: StretchSpan): Zone {
  const { from, to } = span
  if (x1 === x2) return x1 < from ? 'before' : x1 < to ? 'motif' : 'after'
  if (x1 >= from && x2 <= to) return 'motif'
  if (x2 <= from) return 'before'
  if (x1 >= to) return 'after'
  return 'across'
}

/** Étendue horizontale d'une forme, par sa géométrie (un point compte par son centre). */
function extent(primitive: Primitive): [number, number] {
  switch (primitive.kind) {
    case 'rect':
    case 'text':
    case 'image':
    case 'holes':
      return [primitive.x, primitive.x + primitive.w]
    case 'ellipse':
      return [primitive.cx - primitive.rx, primitive.cx + primitive.rx]
    case 'line':
      return [Math.min(primitive.x1, primitive.x2), Math.max(primitive.x1, primitive.x2)]
    case 'polyline': {
      const xs = primitive.points.map(([x]) => x)
      return [Math.min(...xs), Math.max(...xs)]
    }
    case 'dot':
      return [primitive.x, primitive.x]
  }
}

/**
 * Où va une abscisse d'une forme qui s'allonge : inchangée avant le motif, décalée de tout
 * l'allongement après lui, et en proportion à l'intérieur.
 */
function stretchedX(x: number, span: StretchSpan, count: number): number {
  const { from, to } = span
  if (x <= from) return x
  if (x >= to) return x + (count - 1) * (to - from)
  return from + (x - from) * count
}

/** Tranches d'une image à cheval sur un trait : avant le motif, dans le motif (répétée), après. */
function slicedImage(image: ImagePrimitive, span: StretchSpan, count: number): ImagePrimitive[] {
  const { from, to } = span
  const period = to - from
  const whole = image.crop ?? { x: 0, w: 1 }
  const end = image.x + image.w
  const slice = (x1: number, x2: number, shift: number): ImagePrimitive => ({
    ...image,
    x: x1 + shift,
    w: x2 - x1,
    crop: {
      // Une tranche déjà coupée dans l'autre sens garde cette coupe-là.
      ...whole,
      x: whole.x + ((x1 - image.x) / image.w) * whole.w,
      w: ((x2 - x1) / image.w) * whole.w
    }
  })
  const parts: ImagePrimitive[] = []
  if (image.x < from) parts.push(slice(image.x, Math.min(end, from), 0))
  const inside: [number, number] = [Math.max(image.x, from), Math.min(end, to)]
  if (inside[1] > inside[0]) {
    for (let k = 0; k < count; k++) parts.push(slice(inside[0], inside[1], k * period))
  }
  if (end > to) parts.push(slice(Math.max(image.x, to), end, (count - 1) * period))
  return parts
}

/**
 * Un morceau d'un dessin étiré : la forme, et le rang de sa copie dans le motif (null pour ce
 * que le motif ne recopie pas : avant lui, après lui, ou à cheval sur un trait).
 */
interface Piece {
  primitive: Primitive
  copy: number | null
}

/** Ce qu'une forme devient dans un dessin étiré à `count` motifs : elle-même, ou ses copies. */
function stretchedPrimitive(primitive: Primitive, span: StretchSpan, count: number): Piece[] {
  const period = span.to - span.from
  const [x1, x2] = extent(primitive)
  const zone = zoneOf(x1, x2, span)
  if (zone === 'motif') {
    return Array.from({ length: count }, (_, k) => ({
      primitive: k === 0 ? primitive : translatePrimitive(primitive, k * period, 0),
      copy: k
    }))
  }
  const one = (shape: Primitive): Piece[] => [{ primitive: shape, copy: null }]
  // À un seul motif rien ne bouge, et une image n'est pas coupée.
  if (count === 1 || zone === 'before') return one(primitive)
  if (zone === 'after') return one(translatePrimitive(primitive, (count - 1) * period, 0))
  const at = (x: number): number => stretchedX(x, span, count)
  switch (primitive.kind) {
    // Une grille de trous à cheval s'élargit comme un contour : elle a plus de trous.
    case 'rect':
    case 'text':
    case 'holes': {
      const x = at(primitive.x)
      return one({ ...primitive, x, w: at(primitive.x + primitive.w) - x })
    }
    case 'ellipse': {
      const left = at(primitive.cx - primitive.rx)
      const right = at(primitive.cx + primitive.rx)
      return one({ ...primitive, cx: (left + right) / 2, rx: (right - left) / 2 })
    }
    case 'line':
      return one({ ...primitive, x1: at(primitive.x1), x2: at(primitive.x2) })
    case 'polyline':
      return one({
        ...primitive,
        points: primitive.points.map(([x, y]): QuarterPoint => [at(x), y])
      })
    case 'image':
      return slicedImage(primitive, span, count).map((slice) => ({ primitive: slice, copy: null }))
    case 'dot':
      return one(primitive)
  }
}

/**
 * Broches d'un dessin étiré : celles d'avant le motif, puis celles de chaque motif l'un après
 * l'autre, puis celles d'après. Les numéros suivent cet ordre, comme toujours. `copyId` nomme la
 * copie d'une broche du motif d'après son rang.
 */
function stretchedPins(
  pins: readonly Pin[],
  span: StretchSpan,
  count: number,
  copyId: (id: string, copy: number) => string
): Pin[] {
  const period = motifCells(span)
  const zone = (pin: Pin): Zone => {
    const x = pin.x * QUARTERS_PER_CELL
    return zoneOf(x, x, span)
  }
  const before = pins.filter((pin) => zone(pin) === 'before')
  const motif = pins.filter((pin) => zone(pin) === 'motif')
  const after = pins.filter((pin) => zone(pin) === 'after')
  const copies = Array.from({ length: count }, (_, k) =>
    motif.map((pin) => (k === 0 ? pin : { ...pin, id: copyId(pin.id, k), x: pin.x + k * period }))
  ).flat()
  return renumberPins([
    ...before,
    ...copies,
    ...after.map((pin) => ({ ...pin, x: pin.x + (count - 1) * period }))
  ])
}

/** Un dessin : sa taille, ses formes, ses broches. */
type Drawing = Pick<ComponentDefinition, 'size' | 'visual' | 'pins'>

/** La même forme, abscisses et ordonnées échangées. */
function turnedPrimitive(primitive: Primitive): Primitive {
  switch (primitive.kind) {
    case 'rect':
    case 'text':
    case 'holes':
      return { ...primitive, x: primitive.y, y: primitive.x, w: primitive.h, h: primitive.w }
    case 'image': {
      const turned: ImagePrimitive = {
        ...primitive,
        x: primitive.y,
        y: primitive.x,
        w: primitive.h,
        h: primitive.w
      }
      const crop = primitive.crop
      if (crop) {
        const x = crop.y ?? 0
        const w = crop.h ?? 1
        // Une coupe sur toute la hauteur ne se note pas.
        turned.crop = crop.x === 0 && crop.w === 1 ? { x, w } : { x, w, y: crop.x, h: crop.w }
      }
      return turned
    }
    case 'ellipse':
      return {
        ...primitive,
        cx: primitive.cy,
        cy: primitive.cx,
        rx: primitive.ry,
        ry: primitive.rx
      }
    case 'line':
      return {
        ...primitive,
        x1: primitive.y1,
        y1: primitive.x1,
        x2: primitive.y2,
        y2: primitive.x2
      }
    case 'polyline':
      return { ...primitive, points: primitive.points.map(([x, y]): QuarterPoint => [y, x]) }
    case 'dot':
      return { ...primitive, x: primitive.y, y: primitive.x }
  }
}

/**
 * Le même dessin, abscisses et ordonnées échangées. L'étirement en hauteur est celui en largeur
 * appliqué au dessin ainsi retourné, puis retourné de nouveau : une seule règle pour les deux
 * sens.
 */
function turnedDrawing(drawing: Drawing): Drawing {
  return {
    size: { widthCells: drawing.size.heightCells, heightCells: drawing.size.widthCells },
    visual: { kind: 'drawing', primitives: drawing.visual.primitives.map(turnedPrimitive) },
    pins: drawing.pins.map((pin) => ({ ...pin, x: pin.y, y: pin.x }))
  }
}

/**
 * D'où vient une forme d'un dessin étiré : son rang dans le dessin d'origine, et le rang de sa
 * copie dans chaque sens (null là où le motif ne la recopie pas). C'est ce qui permet de suivre
 * un texte variable d'un étirement à l'autre, quel que soit le nom que porte son champ.
 */
interface Origin {
  source: number
  x: number | null
  y: number | null
}

/** Un dessin étiré, et l'origine de chacune de ses formes. */
interface Parts {
  drawing: Drawing
  origins: Origin[]
}

/** Le dessin dont le motif est répété `n` fois en largeur ; `axis` : le sens que cela représente. */
function repeatedAcross(
  parts: Parts,
  span: StretchSpan,
  n: number,
  wholeImages: boolean,
  axis: StretchAxis
): Parts {
  const def = parts.drawing
  const kept = (primitive: Primitive): boolean =>
    wholeImages &&
    primitive.kind === 'image' &&
    zoneOf(primitive.x, primitive.x + primitive.w, span) === 'across'
  // Une broche recopiée en hauteur l'a peut-être déjà été en largeur : son nom garde ce rang-là.
  const copyId = (id: string, copy: number): string => {
    if (axis === 'x') return stretchPinId(id, copy)
    const source = stretchPinSource(id)
    return stretchPinId(source.base, source.x, copy)
  }
  const primitives: Primitive[] = []
  const origins: Origin[] = []
  def.visual.primitives.forEach((primitive, index) => {
    const origin = parts.origins[index] ?? { source: index, x: null, y: null }
    const pieces: Piece[] = kept(primitive)
      ? [{ primitive, copy: null }]
      : stretchedPrimitive(primitive, span, n)
    for (const piece of pieces) {
      primitives.push(piece.primitive)
      origins.push({ ...origin, [axis]: piece.copy })
    }
  })
  return {
    drawing: {
      size: {
        widthCells: def.size.widthCells + (n - 1) * motifCells(span),
        heightCells: def.size.heightCells
      },
      visual: { kind: 'drawing', primitives },
      // À un seul motif rien ne bouge : les broches gardent leur ordre, donc leurs numéros.
      pins: n === 1 ? def.pins : stretchedPins(def.pins, span, n, copyId)
    },
    origins
  }
}

/**
 * Dessin d'un composant dont le motif est répété dans chaque sens où il s'étire : la largeur
 * d'abord, puis la hauteur du résultat. Avec `wholeImages`, une image à cheval sur un trait
 * n'est pas coupée : elle reste entière, à sa place (le dessin de départ d'un modèle
 * particulier).
 */
function repeatedDrawing(
  def: Drawing,
  stretch: Stretch,
  counts: StretchCounts,
  wholeImages = false
): Parts {
  let parts: Parts = {
    drawing: { size: def.size, visual: def.visual, pins: def.pins },
    origins: def.visual.primitives.map((_, source) => ({ source, x: null, y: null }))
  }
  if (stretch.x) parts = repeatedAcross(parts, stretch.x, counts.x, wholeImages, 'x')
  if (stretch.y) {
    const turned = repeatedAcross(
      { drawing: turnedDrawing(parts.drawing), origins: parts.origins },
      stretch.y,
      counts.y,
      wholeImages,
      'y'
    )
    parts = { drawing: turnedDrawing(turned.drawing), origins: turned.origins }
  }
  return parts
}

/** Le modèle particulier qui vaut à ces nombres : il n'y en a que pour un seul sens. */
function modelFor(stretch: Stretch, counts: StretchCounts): CountModel | undefined {
  const axis = singleAxis(stretch)
  return axis ? stretch.models?.find((candidate) => candidate.count === counts[axis]) : undefined
}

const posed = new WeakMap<ComponentDefinition, Map<string, ComponentDefinition>>()

/**
 * Le composant tel qu'on le pose : étiré à ses nombres de motifs (ceux de départ si rien n'est
 * demandé), et chaque texte variable avec son champ à lui (`ownFieldNames`). Même identité, mais
 * la taille, les formes et les broches étirées. Un nombre qui a son modèle particulier
 * (`stretch.models`, pour un composant qui ne s'étire que dans un sens) prend ce dessin-là au
 * lieu du motif répété. Quand rien ne change (pas extensible, ou un seul motif, et pas deux
 * textes variables du même nom), c'est le composant lui-même. Le résultat est gardé : pour un
 * même composant et les mêmes nombres, le même objet.
 */
export function stretchedDefinition(
  def: ComponentDefinition,
  wanted?: WantedCounts
): ComponentDefinition {
  const counts = stretchCounts(def, wanted)
  const key = `${counts.x}:${counts.y}`
  let cache = posed.get(def)
  if (!cache) {
    cache = new Map()
    posed.set(def, cache)
  }
  let resolved = cache.get(key)
  if (!resolved) {
    const stretch = def.stretch
    const model = stretch ? modelFor(stretch, counts) : undefined
    let drawn = def
    if (model) {
      drawn = { ...def, size: model.size, visual: model.visual, pins: model.pins }
      if (model.pinGroups) drawn.pinGroups = model.pinGroups
      else delete drawn.pinGroups
    } else if (stretch && (counts.x > 1 || counts.y > 1)) {
      drawn = { ...def, ...repeatedDrawing(def, stretch, counts).drawing }
    }
    const named = ownFieldNames(drawn.visual.primitives)
    resolved =
      named === drawn.visual.primitives
        ? drawn
        : { ...drawn, visual: { kind: 'drawing', primitives: [...named] } }
    cache.set(key, resolved)
  }
  return resolved
}

// Modèles par nombre (décision du 17 novembre 2026) : pour certains nombres de motifs, un dessin
// à part remplace le motif répété (une pièce à un seul point, moulée d'un bloc, n'a pas l'allure
// d'un bout de barrette). On ne le choisit pas en posant le composant : c'est le nombre qui le
// désigne, donc étirer le composant passe de l'un à l'autre. Ils ne valent que pour un composant
// qui s'étire dans un seul sens : dans les deux, il faudrait un dessin par couple de nombres.

/**
 * Dessin de départ du modèle particulier d'un nombre de motifs : le composant tel que son motif
 * répété le dessine à ce nombre, à retoucher ensuite. Une image que l'étirement couperait y
 * revient entière, à sa place : une tranche ne se retouche pas, et un modèle a le plus souvent
 * son image à lui. Les broches gardent les identifiants qu'elles ont dans le composant étiré.
 * Null pour un composant qui ne s'étire pas dans un seul sens.
 */
export function modelDrawing(def: ComponentDefinition, count: number): CountModel | null {
  const stretch = def.stretch
  const axis = singleAxis(stretch)
  if (!stretch || !axis) return null
  const n = Math.max(1, Math.min(Math.round(count), STRETCH_MAX_COUNT))
  const counts: StretchCounts = { x: 1, y: 1, [axis]: n }
  const model: CountModel = { count: n, ...repeatedDrawing(def, stretch, counts, true).drawing }
  if (def.pinGroups) model.pinGroups = def.pinGroups
  return model
}

/**
 * Premier nombre de motifs permis qui n'a pas encore son modèle ; null s'ils l'ont tous, ou si le
 * composant ne s'étire pas dans un seul sens.
 */
export function freeModelCount(stretch: Stretch): number | null {
  const axis = singleAxis(stretch)
  const span = axis ? stretch[axis] : undefined
  if (!span) return null
  const taken = new Set((stretch.models ?? []).map((model) => model.count))
  const max = Math.min(span.max, STRETCH_MAX_COUNT)
  for (let n = span.min; n <= max; n++) if (!taken.has(n)) return n
  return null
}

const modelDefinitions = new WeakMap<ComponentDefinition, Map<number, ComponentDefinition>>()

/**
 * Le composant tel que le dessine le modèle particulier d'un nombre, pour le retoucher dans
 * l'éditeur : son dessin seul, sans motif ni traits de coupe. Le composant lui-même quand ce
 * nombre n'a pas de modèle. Pour un même composant et un même nombre, toujours le même objet.
 */
export function modelDefinition(
  def: ComponentDefinition,
  count: number | null | undefined
): ComponentDefinition {
  const model = def.stretch?.models?.find((candidate) => candidate.count === count)
  if (!model) return def
  let cache = modelDefinitions.get(def)
  if (!cache) {
    cache = new Map()
    modelDefinitions.set(def, cache)
  }
  let resolved = cache.get(model.count)
  if (!resolved) {
    resolved = { ...def, size: model.size, visual: model.visual, pins: model.pins }
    if (model.pinGroups) resolved.pinGroups = model.pinGroups
    else delete resolved.pinGroups
    delete resolved.stretch
    cache.set(model.count, resolved)
  }
  return resolved
}

/** Quel bout d'un composant étiré reste en place : son début (à gauche, ou en haut) ou sa fin. */
export type StretchEnd = 'start' | 'end'

/**
 * Correspondance des broches quand un composant passe de `before` à `after` motifs dans un sens
 * (`axis` ; sans lui, son premier sens) : identifiant avant → identifiant après. Les broches du
 * début et de la fin gardent le leur. Celles des motifs aussi quand c'est le début qui reste en
 * place : on ajoute ou on retire des motifs à la fin. Quand c'est la fin qui reste, les motifs se
 * comptent depuis elle : le dernier reste le dernier. Une broche qui disparaît n'a pas de
 * correspondante. Si l'un des deux nombres a son modèle particulier, les identifiants ne se
 * répondent plus : les broches se suivent alors par leur rang, compté depuis le bout qui reste
 * en place.
 */
export function stretchPinMap(
  def: ComponentDefinition,
  before: WantedCounts,
  after: WantedCounts,
  fixed: StretchEnd,
  axis: StretchAxis = stretchAxis(def.stretch)
): Map<string, string> {
  const map = new Map<string, string>()
  const stretch = def.stretch
  const span = stretch?.[axis]
  if (!stretch || !span) return map
  const from = stretchCounts(def, before)
  const to = stretchCounts(def, after)
  const pinsBefore = stretchedDefinition(def, from).pins
  const pinsAfter = stretchedDefinition(def, to).pins
  if (modelFor(stretch, from) || modelFor(stretch, to)) {
    const shift = fixed === 'start' ? 0 : pinsAfter.length - pinsBefore.length
    pinsBefore.forEach((pin, index) => {
      const target = pinsAfter[index + shift]
      if (target) map.set(pin.id, target.id)
    })
    return map
  }
  const known = new Set(pinsAfter.map((pin) => pin.id))
  const motif = new Set(
    def.pins
      .filter((pin) => {
        const along = (axis === 'y' ? pin.y : pin.x) * QUARTERS_PER_CELL
        return zoneOf(along, along, span) === 'motif'
      })
      .map((pin) => pin.id)
  )
  const shift = fixed === 'start' ? 0 : to[axis] - from[axis]
  for (const pin of pinsBefore) {
    const source = stretchPinSource(pin.id)
    let target: string | null = pin.id
    if (motif.has(source.base)) {
      const rank = source[axis] + shift
      target =
        rank >= 0
          ? stretchPinId(
              source.base,
              axis === 'x' ? rank : source.x,
              axis === 'y' ? rank : source.y
            )
          : null
    }
    if (target !== null && known.has(target)) map.set(pin.id, target)
  }
  return map
}

/** Les textes variables d'un composant étiré : d'où vient chacun, et le nom de son champ. */
function posedFields(
  def: ComponentDefinition,
  stretch: Stretch,
  counts: StretchCounts
): { origin: Origin; name: string }[] {
  const parts = repeatedDrawing(def, stretch, counts)
  return ownFieldNames(parts.drawing.visual.primitives).flatMap((primitive, index) => {
    const origin = parts.origins[index]
    return primitive.kind === 'text' && primitive.variable && origin
      ? [{ origin, name: primitive.text }]
      : []
  })
}

/**
 * Valeurs des champs d'un composant posé qui passe de `before` à `after` motifs dans un sens
 * (`axis` ; sans lui, son premier sens). Chaque valeur suit son texte, quel que soit le nom que
 * prend son champ : les textes de même nom sont numérotés dans l'ordre de lecture, et ce rang
 * change quand des motifs s'ajoutent ou se retirent avant eux. Quand c'est le début qui reste en
 * place, les motifs s'ajoutent ou se retirent à la fin ; quand c'est la fin, ils se comptent
 * depuis elle. La valeur d'un motif retiré est perdue. Rend les mêmes valeurs (le même objet) si
 * rien ne bouge, et quand l'un des deux nombres a son modèle particulier : ses champs sont les
 * siens.
 */
export function restretchedFields(
  def: ComponentDefinition,
  fields: FieldValues,
  before: WantedCounts,
  after: WantedCounts,
  fixed: StretchEnd,
  axis: StretchAxis = stretchAxis(def.stretch)
): FieldValues {
  const stretch = def.stretch
  if (!stretch?.[axis]) return fields
  const from = stretchCounts(def, before)
  const to = stretchCounts(def, after)
  if (from[axis] === to[axis]) return fields
  if (modelFor(stretch, from) || modelFor(stretch, to)) return fields
  const key = (origin: Origin): string => `${origin.source}:${origin.x}:${origin.y}`
  const old = posedFields(def, stretch, from)
  const oldNames = new Map(old.map((entry) => [key(entry.origin), entry.name]))
  const shift = fixed === 'start' ? 0 : to[axis] - from[axis]
  const next: Record<string, string> = { ...fields }
  for (const { name } of old) Reflect.deleteProperty(next, name)
  for (const { origin, name } of posedFields(def, stretch, to)) {
    const rank = origin[axis]
    const source = oldNames.get(key({ ...origin, [axis]: rank === null ? null : rank - shift }))
    const value = source === undefined ? undefined : fields[source]
    if (value !== undefined) next[name] = value
  }
  const names = Object.keys(next)
  const same =
    names.length === Object.keys(fields).length &&
    names.every((name) => fields[name] === next[name])
  return same ? fields : next
}
