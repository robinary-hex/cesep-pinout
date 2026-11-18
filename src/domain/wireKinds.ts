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

/** Bombé d'un pont au milieu de sa corde, en cellules : il grandit avec elle, entre deux bornes. */
function jumperBulge(length: number): number {
  return Math.min(2, Math.max(0.5, length * 0.18))
}

/**
 * Point de contrôle de la courbe d'un pont (une courbe de Bézier quadratique de A à B). Le pont
 * se bombe à gauche de son sens de tracé : vers le haut quand on le trace de gauche à droite. Le
 * retourner (échanger ses bouts) le bombe de l'autre côté.
 */
export function jumperControl(from: GridPoint, to: GridPoint): LocalPoint {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  const middle = { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 }
  if (length === 0) return middle
  // Le sommet d'une quadratique est à mi-chemin de son point de contrôle : deux fois le bombé.
  const reach = 2 * jumperBulge(length)
  return {
    x: rounded(middle.x + (dy / length) * reach),
    y: rounded(middle.y - (dx / length) * reach)
  }
}

/** Tracé SVG d'un pont, de son premier à son dernier sommet. */
export function jumperPathData(points: readonly GridPoint[]): string {
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || points.length < 2) return ''
  const control = jumperControl(from, to)
  return `M ${from[0]} ${from[1]} Q ${control.x} ${control.y} ${to[0]} ${to[1]}`
}

/** Tracé SVG d'un fil selon sa sorte : la courbe d'un pont, sinon ses segments aux coins arrondis. */
export function wireShapeData(
  kind: WireKind | undefined,
  points: readonly GridPoint[],
  cornerRadius: number
): string {
  return kind === 'jumper' ? jumperPathData(points) : wirePathData(points, cornerRadius)
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
