import type { LocalPoint } from './grid'

/**
 * Pointe de flèche triangulaire dont la pointe est en `tip`, dans la direction `from` → `tip`.
 * Unités de cellule ; dimensionnée d'après l'épaisseur du trait avec un minimum lisible.
 */
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
  const size = Math.max(0.3, strokeWidth * 3.5)
  const half = Math.max(0.12, strokeWidth * 1.4)
  const baseX = tip.x - ux * size
  const baseY = tip.y - uy * size
  return [
    { x: tip.x, y: tip.y },
    { x: baseX - uy * half, y: baseY + ux * half },
    { x: baseX + uy * half, y: baseY - ux * half }
  ]
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

/** Attribut `points` d'un polygone SVG. */
export function pointsAttribute(points: readonly LocalPoint[]): string {
  return points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(' ')
}
