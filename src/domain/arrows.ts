import type { Arrows } from './component'
import type { LocalPoint } from './grid'

/**
 * Pointes de flèche des lignes et polylignes. Unités de cellule ; dimensionnées d'après
 * l'épaisseur du trait avec un minimum lisible.
 */

/** Longueur de la pointe (de la base au bout). */
export function arrowSize(strokeWidth: number): number {
  return Math.max(0.3, strokeWidth * 3.5)
}

/** Triangle dont la pointe est en `tip`, dans la direction `from` → `tip`. */
export function arrowHeadPoints(
  from: LocalPoint,
  tip: LocalPoint,
  strokeWidth: number
): LocalPoint[] | null {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const ux = dx / length
  const uy = dy / length
  const size = arrowSize(strokeWidth)
  const half = Math.max(0.12, strokeWidth * 1.4)
  const baseX = tip.x - ux * size
  const baseY = tip.y - uy * size
  return [
    { x: tip.x, y: tip.y },
    { x: baseX - uy * half, y: baseY + ux * half },
    { x: baseX + uy * half, y: baseY - ux * half }
  ]
}

/**
 * Sommets d'un trait raccourci jusqu'à la base de ses pointes de flèche, pour que le trait
 * (et son bout arrondi) ne recouvre pas la pointe. Un segment plus court que la pointe est
 * ramené à zéro, jamais au-delà de son autre sommet.
 */
export function trimForArrows(
  points: readonly LocalPoint[],
  arrows: Arrows,
  strokeWidth: number
): LocalPoint[] {
  const result = points.map((point) => ({ x: point.x, y: point.y }))
  if (result.length < 2) return result
  const size = arrowSize(strokeWidth)
  const pullBack = (tipIndex: number, fromIndex: number): void => {
    const tip = result[tipIndex]
    const from = result[fromIndex]
    if (!tip || !from) return
    const dx = tip.x - from.x
    const dy = tip.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) return
    const back = Math.min(size, length)
    result[tipIndex] = { x: tip.x - (dx / length) * back, y: tip.y - (dy / length) * back }
  }
  if (arrows.end) pullBack(result.length - 1, result.length - 2)
  if (arrows.start) pullBack(0, 1)
  return result
}

/**
 * Pointe au milieu d'une ligne brisée, dans le sens du tracé, centrée par son centre de gravité
 * (à un tiers de la base) pour paraître au milieu ; null si le trait est de longueur nulle.
 */
export function middleArrowHead(
  points: readonly LocalPoint[],
  strokeWidth: number
): LocalPoint[] | null {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  if (total === 0) return null
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    if (remaining <= length) {
      const t = remaining / length
      const mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      const ux = (b.x - a.x) / length
      const uy = (b.y - a.y) / length
      const ahead = (arrowSize(strokeWidth) * 2) / 3
      return arrowHeadPoints(
        { x: mid.x - ux, y: mid.y - uy },
        { x: mid.x + ux * ahead, y: mid.y + uy * ahead },
        strokeWidth
      )
    }
    remaining -= length
  }
  return null
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

/** Attribut `points` d'un polygone ou d'une polyligne SVG. */
export function pointsAttribute(points: readonly LocalPoint[]): string {
  return points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(' ')
}
