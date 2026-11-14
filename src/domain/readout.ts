import { primitiveBounds, type Primitive } from './component'
import { QUARTERS_PER_CELL } from './grid'

// Ce que la barre d'état dit de la sélection (décision du 14 novembre 2026) : où est l'élément
// sélectionné, en cellules. Un élément a une position, x et y ; une ligne, un fil ou un lien a un
// départ et une arrivée, et l'écart entre les deux sur chaque axe (pas sa longueur). Les trois
// éditeurs disent la même chose de la même façon.

type Point = readonly [number, number]

export type Readout =
  /** Un élément : le coin supérieur gauche de sa boîte (son centre pour un point, sa place pour une broche). */
  | { kind: 'place'; x: number; y: number }
  /** Une ligne, un fil, un lien : son premier et son dernier sommet. */
  | { kind: 'span'; from: Point; to: Point }
  /** Plusieurs éléments : leur nombre, sans coordonnées. */
  | { kind: 'many'; count: number }

export function placeReadout(x: number, y: number): Readout {
  return { kind: 'place', x, y }
}

/** D'une suite de sommets, le départ et l'arrivée ; null s'il n'y en a pas deux. */
export function spanReadout(points: readonly Point[]): Readout | null {
  const from = points[0]
  const to = points.at(-1)
  return from && to && points.length >= 2 ? { kind: 'span', from, to } : null
}

/**
 * Une forme de l'éditeur de composants, dont les coordonnées sont en quarts de cellule : une ligne
 * ou une polyligne ouverte donne son départ et son arrivée ; un point, son centre ; toute autre
 * forme, le coin supérieur gauche de sa boîte.
 */
export function primitiveReadout(primitive: Primitive): Readout {
  const cells = (quarters: number): number => quarters / QUARTERS_PER_CELL
  if (primitive.kind === 'line') {
    return {
      kind: 'span',
      from: [cells(primitive.x1), cells(primitive.y1)],
      to: [cells(primitive.x2), cells(primitive.y2)]
    }
  }
  if (primitive.kind === 'polyline' && !primitive.closed) {
    const span = spanReadout(primitive.points.map(([x, y]) => [cells(x), cells(y)] as const))
    if (span) return span
  }
  if (primitive.kind === 'dot') return placeReadout(cells(primitive.x), cells(primitive.y))
  const bounds = primitiveBounds(primitive)
  return placeReadout(cells(bounds.x1), cells(bounds.y1))
}

/**
 * Nombre de cellules tel qu'on l'écrit : virgule décimale, deux décimales au plus, vrai signe
 * moins. Zéro n'a pas de signe.
 */
export function formatCells(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (rounded === 0) return '0'
  return (rounded < 0 ? '−' : '') + String(Math.abs(rounded)).replace('.', ',')
}

function formatPoint([x, y]: Point): string {
  return `(${formatCells(x)} ; ${formatCells(y)})`
}

/** Le texte de la barre d'état ; vide sans sélection. */
export function formatReadout(readout: Readout | null): string {
  if (readout === null) return ''
  if (readout.kind === 'many') return `${readout.count} éléments`
  if (readout.kind === 'place') return `x ${formatCells(readout.x)}   y ${formatCells(readout.y)}`
  const { from, to } = readout
  return [
    `départ ${formatPoint(from)}`,
    `arrivée ${formatPoint(to)}`,
    `Δx ${formatCells(to[0] - from[0])}`,
    `Δy ${formatCells(to[1] - from[1])}`
  ].join('   ')
}
