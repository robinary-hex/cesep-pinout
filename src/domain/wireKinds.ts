import type { GridPoint, LocalPoint } from './grid'
import type { Wire, WireKind } from './project'
import { dragVertex, wirePathData } from './wires'

// Trois sortes de fils (décision du 17 novembre 2026, pour le montage sur plaque à trous) :
//
//   - le fil isolé, celui de toujours : des coudes sur la grille, relié par ses seuls bouts ;
//   - le fil nu (`bare`) : la même géométrie, mais soudé à toutes les broches posées sur son
//     trajet. C'est le fil dénudé qu'on couche sur une rangée de pattes pour les relier d'un
//     coup. Il n'a pas de gaine, donc pas de couleur à lui : il se dessine en métal ;
//   - le pont (`jumper`) : un fil isolé de A à B, dessiné en courbe. Il n'a que ses deux bouts,
//     ne suit pas la grille et ne touche rien en chemin.
//
// Tout ce qui tient à la sorte d'un fil est ici ; le reste du domaine traite un fil comme une
// suite de sommets.

/** Couleur d'un fil nu : l'étain, et le liseré plus sombre qui lui donne son relief. */
export const BARE_WIRE_COLOR = '#dfe5ea'
export const BARE_WIRE_EDGE = '#59616a'
/** Largeur du liseré d'un fil nu, en multiple de l'épaisseur du fil. */
export const BARE_WIRE_EDGE_SCALE = 1.6
/** Point de soudure d'un fil nu sur une broche : sa couleur, et son rayon en épaisseurs de fil. */
export const SOLDER_COLOR = '#c3ccd3'
export const SOLDER_EDGE = '#5d6770'
export const SOLDER_SCALE = 1.5

export function isJumper(wire: Pick<Wire, 'kind'>): boolean {
  return wire.kind === 'jumper'
}

export function isBare(wire: Pick<Wire, 'kind'>): boolean {
  return wire.kind === 'bare'
}

/** Couleur dans laquelle un fil se dessine : la sienne, ou l'étain pour un fil nu. */
export function wireInk(wire: Pick<Wire, 'kind' | 'color'>): string {
  return wire.kind === 'bare' ? BARE_WIRE_COLOR : wire.color
}

/** Nom d'une sorte de fil dans l'interface. */
export function wireKindLabel(kind: WireKind | undefined): string {
  return kind === 'bare' ? 'Fil nu' : kind === 'jumper' ? 'Pont' : 'Fil'
}

const rounded = (value: number): number => Math.round(value * 1000) / 1000

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
