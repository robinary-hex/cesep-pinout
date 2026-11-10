import type { LocalPoint } from './grid'

/**
 * Tracé SVG d'une polyligne ou d'un polygone aux angles arrondis. Chaque sommet est remplacé par
 * un arc de cercle tangent à ses deux côtés, quel que soit l'angle ; l'arc ne prend jamais plus de
 * la moitié d'un côté (son rayon se réduit alors), pour que deux arcs voisins ne se chevauchent
 * pas. Un sommet aligné, un demi-tour ou un côté nul restent tels quels.
 */

function fmt(value: number): string {
  return Number(value.toFixed(4)).toString()
}

interface Corner {
  start: LocalPoint
  end: LocalPoint
  radius: number
  /** 1 : l'arc tourne dans le sens horaire à l'écran (y vers le bas). */
  sweep: 0 | 1
}

function cornerArc(
  previous: LocalPoint,
  vertex: LocalPoint,
  next: LocalPoint,
  radius: number
): Corner | null {
  const inLength = Math.hypot(vertex.x - previous.x, vertex.y - previous.y)
  const outLength = Math.hypot(next.x - vertex.x, next.y - vertex.y)
  if (radius <= 0 || inLength === 0 || outLength === 0) return null
  const ux = (vertex.x - previous.x) / inLength
  const uy = (vertex.y - previous.y) / inLength
  const vx = (next.x - vertex.x) / outLength
  const vy = (next.y - vertex.y) / outLength
  const turn = ux * vy - uy * vx
  if (Math.abs(turn) < 1e-9) return null
  // Tangente de la moitié de l'angle dont le tracé tourne : la longueur prise sur chaque côté
  // vaut rayon × cette tangente (égale au rayon pour un angle droit).
  const tanHalf = Math.abs(turn) / (1 + ux * vx + uy * vy)
  const reach = Math.min(radius * tanHalf, inLength / 2, outLength / 2)
  return {
    start: { x: vertex.x - ux * reach, y: vertex.y - uy * reach },
    end: { x: vertex.x + vx * reach, y: vertex.y + vy * reach },
    radius: reach / tanHalf,
    sweep: turn > 0 ? 1 : 0
  }
}

/** Attribut `d` du tracé ; `radius` dans l'unité des points. Sans rayon, des segments droits. */
export function roundedPathData(
  points: readonly LocalPoint[],
  radius: number,
  closed: boolean
): string {
  const count = points.length
  const first = points[0]
  if (!first) return ''
  const at = (index: number): LocalPoint => points[((index % count) + count) % count] ?? first
  const corner = (index: number): Corner | null =>
    count >= 3 && (closed || (index > 0 && index < count - 1))
      ? cornerArc(at(index - 1), at(index), at(index + 1), radius)
      : null
  const point = (p: LocalPoint): string => `${fmt(p.x)} ${fmt(p.y)}`
  const arc = (c: Corner): string =>
    `A ${fmt(c.radius)} ${fmt(c.radius)} 0 0 ${c.sweep} ${point(c.end)}`

  // Un polygone part de la fin de l'arc de son premier sommet, pour s'y refermer proprement.
  const firstCorner = corner(0)
  let d = `M ${point(firstCorner ? firstCorner.end : first)}`
  for (let i = 1; i < count; i++) {
    const c = corner(i)
    d += c ? ` L ${point(c.start)} ${arc(c)}` : ` L ${point(at(i))}`
  }
  if (closed) {
    if (firstCorner) d += ` L ${point(firstCorner.start)} ${arc(firstCorner)}`
    d += ' Z'
  }
  return d
}
