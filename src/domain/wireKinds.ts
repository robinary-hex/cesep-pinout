import type { GridPoint, LocalPoint } from './grid'
import type { StyleProfile } from './profile'
import type { Wire, WireKind } from './project'
import { dragVertex, wirePathData } from './wires'

// Trois sortes de fils (décision du 17 novembre 2026, pour le montage sur plaque à trous) :
//
//   - le fil isolé, celui de toujours : des coudes sur la grille, relié par ses seuls bouts ;
//   - le fil nu (`bare`) : la même géométrie, mais soudé à toutes les broches posées sur son
//     trajet. C'est le fil dénudé qu'on couche sur une rangée de pattes pour les relier d'un
//     coup. Il se dessine en métal, sur un liseré sombre : en étain au départ, dans la couleur
//     qu'on lui donne ensuite (cuivre, ou une couleur par piste), comme tout fil ; une goutte
//     de soudure le renfle sur chaque broche ;
//   - le pont (`jumper`) : un fil isolé de A à B, dessiné en courbe. Il n'a que ses deux bouts,
//     ne suit pas la grille et ne touche rien en chemin.
//
// Tout ce qui tient à la sorte d'un fil est ici ; le reste du domaine traite un fil comme une
// suite de sommets.

/**
 * Couleur d'un fil nu tant qu'on ne lui en a pas choisi une autre : l'étain ; et le liseré plus
 * sombre qui donne son relief à un fil nu, quelle que soit sa couleur.
 */
export const BARE_WIRE_COLOR = '#dfe5ea'
/** Nom de cette couleur dans les palettes, où elle vient en tête pour les fils nus. */
export const BARE_WIRE_COLOR_NAME = 'Étain'
export const BARE_WIRE_EDGE = '#59616a'
/** Largeur du liseré d'un fil nu, en multiple de l'épaisseur du fil. */
export const BARE_WIRE_EDGE_SCALE = 1.6

const rounded = (value: number): number => Math.round(value * 1000) / 1000

/** Bordure d'un fil : ce dont elle dépasse de chaque côté, en cellules, et sa couleur. */
export interface WireBorder {
  width: number
  color: string
}

/**
 * Bordure avec laquelle un fil se dessine (décision du 18 novembre 2026) : celle de son style
 * (`wireBorder`, `wireBorderColor`) quand il en définit une, pour tous les fils, nus et ponts
 * compris. Sans elle, un fil n'a pas de bordure, sauf le fil nu, qui garde son liseré sombre :
 * en étain sur le papier, on ne le verrait pas. Elle se dessine juste sous son fil, dans l'ordre
 * des fils : un fil qui passe sur un autre, un pont par-dessus des fils, garde la sienne, et
 * l'on voit lequel est dessus.
 */
export function wireBorder(
  style: Pick<StyleProfile, 'wireWidth' | 'wireBorder' | 'wireBorderColor'>,
  wire: Pick<Wire, 'kind'>
): WireBorder | null {
  if (style.wireBorder > 0) return { width: style.wireBorder, color: style.wireBorderColor }
  if (wire.kind !== 'bare') return null
  return { width: (style.wireWidth * (BARE_WIRE_EDGE_SCALE - 1)) / 2, color: BARE_WIRE_EDGE }
}

/**
 * Rayon du disque où, à un raccord, les fils qui se touchent sont redessinés par-dessus leurs
 * bordures (décision du 18 novembre 2026). Chaque fil a sa bordure juste sous lui, pour la garder
 * quand il passe sur un autre ; là où deux fils se raccordent, la bordure de l'un couperait
 * l'autre : on y repeint les fils seuls, dans ce disque, et leurs bordures ne font plus qu'un
 * contour. `outers` : la largeur de chaque fil du raccord, bordure comprise ; `dotRadius` : le
 * rayon du point de jonction et de sa bordure, s'il y en a un, qui doit y tenir aussi.
 */
export function jointRadius(outers: readonly number[], dotRadius = 0): number {
  // La bordure d'un fil coupe l'autre jusqu'à une demi-diagonale de leur largeur.
  return rounded(Math.max(Math.max(0, ...outers) * 0.75, dotRadius) + 0.01)
}

/**
 * Point de soudure d'un fil nu sur une broche de son trajet (décision du 18 novembre 2026, qui
 * revient sur le point orange de la veille) : une goutte de la couleur du fil, qui le renfle et
 * que sa bordure cerne avec lui. Deux touches disent la goutte de métal plutôt qu'un gros
 * point : une ombre en croissant en bas à droite, un petit reflet en haut à gauche. Rayon de la
 * goutte : en épaisseurs de fil.
 */
export const SOLDER_SCALE = 1.5
export const SOLDER_SHADE = { color: '#000000', opacity: 0.16 }
export const SOLDER_GLINT = { color: '#ffffff', opacity: 0.7 }

/** Les deux touches d'une goutte de soudure de rayon `radius`, centrée en (x, y). */
export function solderMark(
  x: number,
  y: number,
  radius: number
): {
  /** L'ombre : un arc, et l'épaisseur de son trait. */
  shade: string
  shadeWidth: number
  /** Le reflet : un petit disque. */
  glint: { cx: number; cy: number; r: number }
} {
  const reach = radius * 0.64
  // De la droite jusqu'en bas à gauche, en passant par le bas : le côté à l'ombre.
  const at = (degrees: number): string => {
    const angle = (degrees * Math.PI) / 180
    return `${rounded(x + reach * Math.cos(angle))} ${rounded(y + reach * Math.sin(angle))}`
  }
  return {
    shade: `M ${at(-20)} A ${rounded(reach)} ${rounded(reach)} 0 0 1 ${at(115)}`,
    shadeWidth: rounded(radius * 0.3),
    glint: {
      cx: rounded(x - radius * 0.36),
      cy: rounded(y - radius * 0.36),
      r: rounded(radius * 0.22)
    }
  }
}

export function isJumper(wire: Pick<Wire, 'kind'>): boolean {
  return wire.kind === 'jumper'
}

export function isBare(wire: Pick<Wire, 'kind'>): boolean {
  return wire.kind === 'bare'
}

/** Nom d'une sorte de fil dans l'interface. */
export function wireKindLabel(kind: WireKind | undefined): string {
  return kind === 'bare' ? 'Fil nu' : kind === 'jumper' ? 'Pont' : 'Fil'
}

/**
 * Bombé d'un pont (décision du 18 novembre 2026) : la flèche de sa courbe, c'est-à-dire la
 * distance de son sommet à sa corde, en cellules. Positif, le pont se bombe à gauche de son sens
 * de tracé (vers le haut quand on le trace de gauche à droite) ; négatif, à droite. Un pont
 * tout juste posé n'en a pas d'enregistré : son bombé d'origine grandit avec sa corde, entre
 * deux bornes. Celui qu'on lui donne (`bulge` du fil) est en cellules et ne change plus avec
 * sa longueur ; il va par quarts de cellule, entre ces bornes, et jamais à zéro : un pont
 * reste une courbe.
 */
export const JUMPER_BULGE_STEP = 0.25
export const JUMPER_BULGE_LIMITS = { min: 0.25, max: 20 }

/** Bombé d'origine d'un pont dont la corde a cette longueur. */
function defaultBulge(length: number): number {
  return Math.min(2, Math.max(0.5, length * 0.18))
}

/** Bombé avec lequel un pont se dessine : celui qu'on lui a donné, sinon celui d'origine. */
export function jumperBulge(points: readonly GridPoint[], bulge?: number): number {
  if (bulge !== undefined) return bulge
  const from = points[0]
  const to = points.at(-1)
  return from && to ? defaultBulge(Math.hypot(to[0] - from[0], to[1] - from[1])) : 0
}

/**
 * Un bombé demandé, ramené au pas et entre les bornes. `side` dit de quel côté le mettre (son
 * signe) quand la valeur est nulle.
 */
export function normalizedBulge(value: number, side = 1): number {
  const { min, max } = JUMPER_BULGE_LIMITS
  const stepped = Math.round(Math.abs(value) / JUMPER_BULGE_STEP) * JUMPER_BULGE_STEP
  const size = Math.min(max, Math.max(min, stepped))
  const left = value === 0 ? side >= 0 : value > 0
  return left ? size : -size
}

/**
 * Le milieu de la corde d'un pont, écarté d'elle de `offset` cellules : à gauche de son sens de
 * tracé, à droite si négatif.
 */
function besideChord(from: GridPoint, to: GridPoint, offset: number): LocalPoint {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  const middle = { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 }
  if (length === 0) return middle
  return {
    x: rounded(middle.x + (dy / length) * offset),
    y: rounded(middle.y - (dx / length) * offset)
  }
}

/**
 * Point de contrôle de la courbe d'un pont (une courbe de Bézier quadratique de A à B). Sans
 * bombé donné, celui d'origine : à gauche du sens de tracé. Retourner un pont (échanger ses
 * bouts) le bombe de l'autre côté.
 */
export function jumperControl(from: GridPoint, to: GridPoint, bulge?: number): LocalPoint {
  // Le sommet d'une quadratique est à mi-chemin de son point de contrôle : deux fois le bombé.
  return besideChord(from, to, 2 * jumperBulge([from, to], bulge))
}

/** Sommet de la courbe d'un pont : son point le plus loin de sa corde, au milieu. */
export function jumperApex(points: readonly GridPoint[], bulge?: number): LocalPoint | null {
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || points.length < 2) return null
  return besideChord(from, to, jumperBulge(points, bulge))
}

/** Tracé SVG d'un pont, de son premier à son dernier sommet. */
export function jumperPathData(points: readonly GridPoint[], bulge?: number): string {
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || points.length < 2) return ''
  const control = jumperControl(from, to, bulge)
  return `M ${from[0]} ${from[1]} Q ${control.x} ${control.y} ${to[0]} ${to[1]}`
}

/**
 * Bombé qui fait passer la courbe d'un pont par un point : celui qu'on règle en glissant sa
 * courbe (Ctrl+glisser). La courbe suit le pointeur là où on la tient, pas seulement en son
 * sommet ; de l'autre côté de la corde, elle se retourne. `current` : le bombé du moment, qui
 * garde son côté quand le point est sur la corde même.
 */
export function bulgeToward(
  points: readonly GridPoint[],
  point: LocalPoint,
  current: number
): number {
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to) return current
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return current
  // Où l'on tient la courbe le long de sa corde (0 au départ, 1 à l'arrivée), et l'écart du
  // point à la corde, positif à gauche du sens de tracé.
  const along = ((point.x - from[0]) * dx + (point.y - from[1]) * dy) / (length * length)
  const across = ((point.x - from[0]) * dy - (point.y - from[1]) * dx) / length
  // À la fraction t de sa corde, la courbe s'en écarte de 4·t·(1 − t) fois son bombé. Près des
  // bouts ce facteur tend vers zéro : on ne le laisse pas emballer le bombé.
  const t = Math.min(0.8, Math.max(0.2, along))
  return normalizedBulge(across / (4 * t * (1 - t)), current)
}

/**
 * Points par où passe la courbe d'un pont, bouts compris : de quoi en tirer sa boîte, ou savoir
 * si un cadre de sélection la touche.
 */
export function jumperOutline(
  points: readonly GridPoint[],
  bulge?: number,
  steps = 16
): GridPoint[] {
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || points.length < 2) return [...points]
  const control = jumperControl(from, to, bulge)
  const outline: GridPoint[] = []
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    const a = (1 - t) * (1 - t)
    const b = 2 * t * (1 - t)
    const c = t * t
    outline.push([
      rounded(a * from[0] + b * control.x + c * to[0]),
      rounded(a * from[1] + b * control.y + c * to[1])
    ])
  }
  return outline
}

/**
 * Ce qu'un fil occupe sur le montage : ses sommets, ou, pour un pont, les points de sa courbe,
 * qui s'écarte de ses deux bouts. À prendre pour sa boîte et pour le cadre de sélection ; ses
 * sommets (`points`) restent ce à quoi on le relie.
 */
export function wireOutline(wire: {
  kind?: WireKind | undefined
  points: readonly GridPoint[]
  bulge?: number | undefined
}): readonly GridPoint[] {
  return wire.kind === 'jumper' ? jumperOutline(wire.points, wire.bulge) : wire.points
}

/** Tracé SVG d'un fil selon sa sorte : la courbe d'un pont, sinon ses segments aux coins arrondis. */
export function wireShapeData(
  kind: WireKind | undefined,
  points: readonly GridPoint[],
  cornerRadius: number,
  bulge?: number
): string {
  return kind === 'jumper' ? jumperPathData(points, bulge) : wirePathData(points, cornerRadius)
}

/**
 * Sommets d'un fil dont on déplace un bout (ou un sommet). Un pont n'a que ses deux bouts : le
 * bout va où on le pose. Un autre fil garde sa géométrie : le sommet emmène son segment, un coude
 * s'ajoutant au besoin (`dragVertex`).
 */
export function movedWireVertex(
  kind: WireKind | undefined,
  points: readonly GridPoint[],
  index: number,
  target: GridPoint
): GridPoint[] {
  if (kind === 'jumper') return points.map((point, i) => (i === index ? target : point))
  return dragVertex(points, index, target)
}
