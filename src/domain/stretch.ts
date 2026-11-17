import {
  renumberPins,
  translatePrimitive,
  type ComponentDefinition,
  type CountModel,
  type ImagePrimitive,
  type Pin,
  type Primitive,
  type QuarterPoint,
  type Stretch
} from './component'
import { QUARTERS_PER_CELL } from './grid'

// Composants extensibles (décision du 17 novembre 2026) : un bornier à deux points qu'on étire à
// trois, puis à quatre ; un connecteur d'un contact qui en prend huit. Le dessin se coupe en trois
// par deux traits verticaux : un début, un motif, une fin. Étirer, c'est répéter le motif.
//
//   - ce qui est à gauche du motif ne bouge pas, ce qui est à droite suit ;
//   - ce qui tient dans le motif est recopié dans chaque motif, broches comprises ;
//   - une forme à cheval sur un trait s'allonge (un contour, un texte centré) ;
//   - une image à cheval est coupée aux traits : seule sa tranche du milieu se répète.
//
// Le résultat est un composant comme un autre : tout ce qui dessine ou relie un exemplaire posé
// passe par `instanceDefinition`, qui rend ce composant étiré, et n'a rien d'autre à savoir.

/** Au-delà, un composant ne s'étire plus, quoi que dise sa définition. */
export const STRETCH_MAX_COUNT = 64

/** Réglages d'un composant qu'on rend extensible : tout son dessin est le motif, de 1 à 12. */
export function defaultStretch(widthCells: number): Stretch {
  return {
    from: 0,
    to: Math.max(1, widthCells) * QUARTERS_PER_CELL,
    initial: 1,
    min: 1,
    max: 12
  }
}

/** Largeur du motif, en cellules : ce dont le composant s'allonge à chaque motif de plus. */
export function motifCells(stretch: Stretch): number {
  return (stretch.to - stretch.from) / QUARTERS_PER_CELL
}

/**
 * Des réglages ramenés à ce qui est permis : un motif dans la boîte du composant, large d'un
 * nombre entier de cellules (les broches recopiées restent sur la grille) et d'une au moins ; un
 * minimum d'au moins 1, un maximum qui ne le dépasse pas vers le bas, un nombre de départ entre
 * les deux.
 */
export function normalizedStretch(stretch: Stretch, widthCells: number): Stretch {
  const width = Math.max(1, widthCells) * QUARTERS_PER_CELL
  const cells = Math.max(
    1,
    Math.min(Math.round((stretch.to - stretch.from) / QUARTERS_PER_CELL), Math.max(1, widthCells))
  )
  const span = cells * QUARTERS_PER_CELL
  const from = Math.max(0, Math.min(Math.round(stretch.from), width - span))
  const min = Math.max(1, Math.min(Math.round(stretch.min), STRETCH_MAX_COUNT))
  const max = Math.max(min, Math.min(Math.round(stretch.max), STRETCH_MAX_COUNT))
  const initial = Math.max(min, Math.min(Math.round(stretch.initial), max))
  return { ...stretch, from, to: from + span, initial, min, max }
}

/**
 * Nombre de motifs d'un composant : celui qu'on demande, ramené entre ses bornes ; sans demande,
 * son nombre de départ. Toujours 1 pour un composant qui n'est pas extensible.
 */
export function stretchCount(
  def: Pick<ComponentDefinition, 'stretch'>,
  count: number | null | undefined
): number {
  const stretch = def.stretch
  if (!stretch) return 1
  const wanted = count === null || count === undefined ? stretch.initial : Math.round(count)
  return Math.max(stretch.min, Math.min(wanted, stretch.max, STRETCH_MAX_COUNT))
}

/** Identifiant de la copie d'une broche du motif : la première garde le sien. */
export function stretchPinId(id: string, copy: number): string {
  return copy === 0 ? id : `${id}#${copy}`
}

/** D'où vient une broche d'un composant étiré : la broche du dessin, et le rang de son motif. */
export function stretchPinSource(id: string): { base: string; copy: number } {
  const match = /^(.*)#(\d+)$/.exec(id)
  return match?.[1] !== undefined && match[2] !== undefined
    ? { base: match[1], copy: Number(match[2]) }
    : { base: id, copy: 0 }
}

type Zone = 'before' | 'motif' | 'after' | 'across'

/**
 * Où tombe une étendue horizontale (quarts de cellule) par rapport au motif. Ce qui n'a pas de
 * largeur (une broche, un point, un trait vertical) appartient au motif depuis son trait de gauche
 * jusqu'avant celui de droite : posé pile sur le trait de droite, il est à la fin. Un trait de
 * séparation sur le trait de gauche se retrouve ainsi une fois à chaque motif, jamais en double.
 */
function zoneOf(x1: number, x2: number, stretch: Stretch): Zone {
  const { from, to } = stretch
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
function stretchedX(x: number, stretch: Stretch, count: number): number {
  const { from, to } = stretch
  if (x <= from) return x
  if (x >= to) return x + (count - 1) * (to - from)
  return from + (x - from) * count
}

/** Tranches d'une image à cheval sur un trait : avant le motif, dans le motif (répétée), après. */
function slicedImage(image: ImagePrimitive, stretch: Stretch, count: number): ImagePrimitive[] {
  const { from, to } = stretch
  const period = to - from
  const whole = image.crop ?? { x: 0, w: 1 }
  const end = image.x + image.w
  const slice = (x1: number, x2: number, shift: number): ImagePrimitive => ({
    ...image,
    x: x1 + shift,
    w: x2 - x1,
    crop: {
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

/** Ce qu'une forme devient dans un composant étiré à `count` motifs : elle-même, ou ses copies. */
function stretchedPrimitive(primitive: Primitive, stretch: Stretch, count: number): Primitive[] {
  const period = stretch.to - stretch.from
  const [x1, x2] = extent(primitive)
  const zone = zoneOf(x1, x2, stretch)
  if (zone === 'before') return [primitive]
  if (zone === 'after') return [translatePrimitive(primitive, (count - 1) * period, 0)]
  if (zone === 'motif') {
    return Array.from({ length: count }, (_, k) =>
      k === 0 ? primitive : translatePrimitive(primitive, k * period, 0)
    )
  }
  const at = (x: number): number => stretchedX(x, stretch, count)
  switch (primitive.kind) {
    case 'rect':
    case 'text': {
      const x = at(primitive.x)
      return [{ ...primitive, x, w: at(primitive.x + primitive.w) - x }]
    }
    case 'ellipse': {
      const left = at(primitive.cx - primitive.rx)
      const right = at(primitive.cx + primitive.rx)
      return [{ ...primitive, cx: (left + right) / 2, rx: (right - left) / 2 }]
    }
    case 'line':
      return [{ ...primitive, x1: at(primitive.x1), x2: at(primitive.x2) }]
    case 'polyline':
      return [{ ...primitive, points: primitive.points.map(([x, y]): QuarterPoint => [at(x), y]) }]
    case 'image':
      return slicedImage(primitive, stretch, count)
    case 'dot':
      return [primitive]
  }
}

/**
 * Broches d'un composant étiré : celles d'avant le motif, puis celles de chaque motif l'un après
 * l'autre, puis celles d'après. Les numéros suivent cet ordre, comme toujours.
 */
function stretchedPins(pins: readonly Pin[], stretch: Stretch, count: number): Pin[] {
  const period = motifCells(stretch)
  const zone = (pin: Pin): Zone => {
    const x = pin.x * QUARTERS_PER_CELL
    return zoneOf(x, x, stretch)
  }
  const before = pins.filter((pin) => zone(pin) === 'before')
  const motif = pins.filter((pin) => zone(pin) === 'motif')
  const after = pins.filter((pin) => zone(pin) === 'after')
  const copies = Array.from({ length: count }, (_, k) =>
    motif.map((pin) =>
      k === 0 ? pin : { ...pin, id: stretchPinId(pin.id, k), x: pin.x + k * period }
    )
  ).flat()
  return renumberPins([
    ...before,
    ...copies,
    ...after.map((pin) => ({ ...pin, x: pin.x + (count - 1) * period }))
  ])
}

/**
 * Dessin d'un composant dont le motif est répété `n` fois : sa taille, ses formes, ses broches.
 * Avec `wholeImages`, une image à cheval sur un trait n'est pas coupée : elle reste entière, à
 * sa place (le dessin de départ d'un modèle particulier).
 */
function repeatedDrawing(
  def: ComponentDefinition,
  stretch: Stretch,
  n: number,
  wholeImages = false
): Pick<ComponentDefinition, 'size' | 'visual' | 'pins'> {
  const kept = (primitive: Primitive): boolean =>
    wholeImages &&
    primitive.kind === 'image' &&
    zoneOf(primitive.x, primitive.x + primitive.w, stretch) === 'across'
  return {
    size: {
      widthCells: def.size.widthCells + (n - 1) * motifCells(stretch),
      heightCells: def.size.heightCells
    },
    visual: {
      kind: 'drawing',
      primitives: def.visual.primitives.flatMap((primitive) =>
        kept(primitive) ? [primitive] : stretchedPrimitive(primitive, stretch, n)
      )
    },
    // À un seul motif rien ne bouge : les broches gardent leur ordre, donc leurs numéros.
    pins: n === 1 ? def.pins : stretchedPins(def.pins, stretch, n)
  }
}

const stretched = new WeakMap<ComponentDefinition, Map<number, ComponentDefinition>>()

/**
 * Le composant tel qu'il se dessine avec `count` motifs (son nombre de départ si rien n'est
 * demandé) : même identité, mais la taille, les formes et les broches étirées. Un nombre qui a
 * son modèle particulier (`stretch.models`) prend ce dessin-là au lieu du motif répété. Pour un
 * composant qui n'est pas extensible, ou à un seul motif sans modèle, c'est le composant
 * lui-même. Le résultat est gardé : pour un même composant et un même nombre, le même objet.
 */
export function stretchedDefinition(
  def: ComponentDefinition,
  count?: number | null
): ComponentDefinition {
  const stretch = def.stretch
  if (!stretch) return def
  const n = stretchCount(def, count)
  const model = stretch.models?.find((candidate) => candidate.count === n)
  if (n === 1 && !model) return def
  let cache = stretched.get(def)
  if (!cache) {
    cache = new Map()
    stretched.set(def, cache)
  }
  let resolved = cache.get(n)
  if (!resolved) {
    if (model) {
      resolved = { ...def, size: model.size, visual: model.visual, pins: model.pins }
      if (model.pinGroups) resolved.pinGroups = model.pinGroups
      else delete resolved.pinGroups
    } else {
      resolved = { ...def, ...repeatedDrawing(def, stretch, n) }
    }
    cache.set(n, resolved)
  }
  return resolved
}

// Modèles par nombre (décision du 17 novembre 2026) : pour certains nombres de motifs, un dessin
// à part remplace le motif répété (une pièce à un seul point, moulée d'un bloc, n'a pas l'allure
// d'un bout de barrette). On ne le choisit pas en posant le composant : c'est le nombre qui le
// désigne, donc étirer le composant passe de l'un à l'autre.

/**
 * Dessin de départ du modèle particulier d'un nombre de motifs : le composant tel que son motif
 * répété le dessine à ce nombre, à retoucher ensuite. Une image que l'étirement couperait y
 * revient entière, à sa place : une tranche ne se retouche pas, et un modèle a le plus souvent
 * son image à lui. Les broches gardent les identifiants qu'elles ont dans le composant étiré.
 * Null pour un composant qui n'est pas extensible.
 */
export function modelDrawing(def: ComponentDefinition, count: number): CountModel | null {
  const stretch = def.stretch
  if (!stretch) return null
  const n = Math.max(1, Math.min(Math.round(count), STRETCH_MAX_COUNT))
  const model: CountModel = { count: n, ...repeatedDrawing(def, stretch, n, true) }
  if (def.pinGroups) model.pinGroups = def.pinGroups
  return model
}

/** Premier nombre de motifs permis qui n'a pas encore son modèle ; null s'ils l'ont tous. */
export function freeModelCount(stretch: Stretch): number | null {
  const taken = new Set((stretch.models ?? []).map((model) => model.count))
  const max = Math.min(stretch.max, STRETCH_MAX_COUNT)
  for (let n = stretch.min; n <= max; n++) if (!taken.has(n)) return n
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

/** Quel bout d'un composant étiré reste en place : son début (à gauche du dessin) ou sa fin. */
export type StretchEnd = 'start' | 'end'

/**
 * Correspondance des broches quand un composant passe de `before` à `after` motifs : identifiant
 * avant → identifiant après. Les broches du début et de la fin gardent le leur. Celles des motifs
 * aussi quand c'est le début qui reste en place : on ajoute ou on retire des motifs à la fin.
 * Quand c'est la fin qui reste, les motifs se comptent depuis elle : le dernier reste le dernier.
 * Une broche qui disparaît n'a pas de correspondante. Si l'un des deux nombres a son modèle
 * particulier, les identifiants ne se répondent plus : les broches se suivent alors par leur
 * rang, compté depuis le bout qui reste en place.
 */
export function stretchPinMap(
  def: ComponentDefinition,
  before: number,
  after: number,
  fixed: StretchEnd
): Map<string, string> {
  const map = new Map<string, string>()
  const stretch = def.stretch
  if (!stretch) return map
  const pinsBefore = stretchedDefinition(def, before).pins
  const pinsAfter = stretchedDefinition(def, after).pins
  const hasModel = (count: number): boolean =>
    stretch.models?.some((candidate) => candidate.count === count) ?? false
  if (hasModel(before) || hasModel(after)) {
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
        const x = pin.x * QUARTERS_PER_CELL
        return zoneOf(x, x, stretch) === 'motif'
      })
      .map((pin) => pin.id)
  )
  const shift = fixed === 'start' ? 0 : after - before
  for (const pin of pinsBefore) {
    const source = stretchPinSource(pin.id)
    const target = motif.has(source.base)
      ? source.copy + shift >= 0
        ? stretchPinId(source.base, source.copy + shift)
        : null
      : pin.id
    if (target !== null && known.has(target)) map.set(pin.id, target)
  }
  return map
}
