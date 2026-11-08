import type { GridPoint, LocalPoint } from './grid'
import type { GridRect } from './placement'

/**
 * Géométrie des fils : polylignes d'intersections de grille à segments horizontaux ou verticaux.
 * Tout est en unités de grille et sans état ; le rendu et l'édition s'appuient sur ces fonctions.
 */

export function pointsEqual(a: GridPoint, b: GridPoint): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function translatePoints(points: readonly GridPoint[], dx: number, dy: number): GridPoint[] {
  return points.map(([x, y]): GridPoint => [x + dx, y + dy])
}

/** Vrai si p est sur le segment [a, b] (segment horizontal ou vertical), extrémités comprises. */
export function pointOnSegment(p: GridPoint, a: GridPoint, b: GridPoint): boolean {
  if (a[0] === b[0]) {
    return p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
  }
  return p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
}

export interface WireLocation {
  /** end : première ou dernière extrémité ; vertex : sommet intermédiaire ; segment : intérieur. */
  kind: 'end' | 'vertex' | 'segment'
  index: number
}

/** Où se trouve un point de grille sur un fil, ou null s'il n'y est pas. */
export function locateOnWire(points: readonly GridPoint[], p: GridPoint): WireLocation | null {
  const last = points.length - 1
  for (let i = 0; i < points.length; i++) {
    const vertex = points[i]
    if (vertex && pointsEqual(vertex, p)) {
      return { kind: i === 0 || i === last ? 'end' : 'vertex', index: i }
    }
  }
  for (let i = 0; i < last; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a && b && pointOnSegment(p, a, b)) return { kind: 'segment', index: i }
  }
  return null
}

function dedupeConsecutive(points: readonly GridPoint[]): GridPoint[] {
  const result: GridPoint[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (!previous || !pointsEqual(previous, point)) result.push([point[0], point[1]])
  }
  return result
}

/** Vrai si b est un demi-tour entre a et c (même droite, sens opposé). */
export function isUTurn(a: GridPoint, b: GridPoint, c: GridPoint): boolean {
  const d1x = b[0] - a[0]
  const d1y = b[1] - a[1]
  const d2x = c[0] - b[0]
  const d2y = c[1] - b[1]
  return d1x * d2y - d1y * d2x === 0 && d1x * d2x + d1y * d2y < 0
}

function isStraight(a: GridPoint, b: GridPoint, c: GridPoint): boolean {
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) === 0
}

/** Retire les sommets confondus et les demi-tours ; garde les sommets dans un segment droit. */
export function normalizePoints(points: readonly GridPoint[]): GridPoint[] {
  let result = dedupeConsecutive(points)
  for (let guard = 0; guard < 10000; guard++) {
    let index = -1
    for (let i = 1; i < result.length - 1; i++) {
      const a = result[i - 1]
      const b = result[i]
      const c = result[i + 1]
      if (a && b && c && isUTurn(a, b, c)) {
        index = i
        break
      }
    }
    if (index === -1) break
    result.splice(index, 1)
    result = dedupeConsecutive(result)
  }
  return result
}

/** normalizePoints puis fusion des segments alignés : la forme canonique d'un fil tracé. */
export function simplifyPoints(points: readonly GridPoint[]): GridPoint[] {
  const clean = normalizePoints(points)
  const result: GridPoint[] = []
  clean.forEach((point, i) => {
    const previous = clean[i - 1]
    const next = clean[i + 1]
    if (previous && next && isStraight(previous, point, next)) return
    result.push(point)
  })
  return result
}

/** Trajet en L entre deux points : d'abord horizontal, ou d'abord vertical. */
export function routeL(from: GridPoint, to: GridPoint, horizontalFirst: boolean): GridPoint[] {
  if (pointsEqual(from, to)) return [from]
  const corner: GridPoint = horizontalFirst ? [to[0], from[1]] : [from[0], to[1]]
  return dedupeConsecutive([from, corner, to])
}

/**
 * Ordre naturel du L entre deux points : l'axe dominant d'abord (horizontal à égalité) ;
 * `invert` (Maj) prend l'autre ordre.
 */
export function horizontalFirstFor(from: GridPoint, to: GridPoint, invert = false): boolean {
  const horizontal = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1])
  return horizontal !== invert
}

/** Trajet en L dans l'ordre naturel (voir `horizontalFirstFor`). */
export function routeLAuto(from: GridPoint, to: GridPoint, invert = false): GridPoint[] {
  return routeL(from, to, horizontalFirstFor(from, to, invert))
}

export function segmentLength(a: GridPoint, b: GridPoint): number {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

/**
 * Tracé SVG d'un fil en unités de grille, coins arrondis par des arcs de rayon `cornerRadius`,
 * borné à la moitié du plus court des deux segments adjacents.
 */
export function wirePathData(points: readonly GridPoint[], cornerRadius: number): string {
  const first = points[0]
  if (!first) return ''
  let d = `M ${fmt(first[0])} ${fmt(first[1])}`
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]
    const vertex = points[i]
    const next = points[i + 1]
    if (!previous || !vertex || !next) continue
    const inLength = segmentLength(previous, vertex)
    const outLength = segmentLength(vertex, next)
    const inX = (vertex[0] - previous[0]) / inLength
    const inY = (vertex[1] - previous[1]) / inLength
    const outX = (next[0] - vertex[0]) / outLength
    const outY = (next[1] - vertex[1]) / outLength
    const turn = inX * outY - inY * outX
    const radius = Math.min(cornerRadius, inLength / 2, outLength / 2)
    if (turn === 0 || radius <= 0) {
      d += ` L ${fmt(vertex[0])} ${fmt(vertex[1])}`
      continue
    }
    const startX = vertex[0] - inX * radius
    const startY = vertex[1] - inY * radius
    const endX = vertex[0] + outX * radius
    const endY = vertex[1] + outY * radius
    d += ` L ${fmt(startX)} ${fmt(startY)} A ${fmt(radius)} ${fmt(radius)} 0 0 ${turn > 0 ? 1 : 0} ${fmt(endX)} ${fmt(endY)}`
  }
  const last = points.at(-1)
  if (last && points.length > 1) d += ` L ${fmt(last[0])} ${fmt(last[1])}`
  return d
}

/** Distance d'un point quelconque à un segment horizontal ou vertical. */
export function distanceToSegment(p: LocalPoint, a: GridPoint, b: GridPoint): number {
  const x1 = Math.min(a[0], b[0])
  const x2 = Math.max(a[0], b[0])
  const y1 = Math.min(a[1], b[1])
  const y2 = Math.max(a[1], b[1])
  const dx = p.x < x1 ? x1 - p.x : p.x > x2 ? p.x - x2 : 0
  const dy = p.y < y1 ? y1 - p.y : p.y > y2 ? p.y - y2 : 0
  return Math.hypot(dx, dy)
}

/** Index du segment le plus proche d'un point (0 si le fil n'a pas de segment). */
export function nearestSegmentIndex(points: readonly GridPoint[], p: LocalPoint): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const distance = distanceToSegment(p, a, b)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/**
 * Déplace un segment perpendiculairement à lui-même (nouvelle ordonnée pour un segment
 * horizontal, nouvelle abscisse pour un vertical). Les extrémités du fil ne bougent pas :
 * un coude est ajouté si le segment déplacé touche une extrémité.
 */
export function moveSegment(
  points: readonly GridPoint[],
  index: number,
  coordinate: number
): GridPoint[] {
  const a = points[index]
  const b = points[index + 1]
  if (!a || !b) return [...points]
  const last = points.length - 1
  const horizontal = a[1] === b[1]
  const newA: GridPoint = horizontal ? [a[0], coordinate] : [coordinate, a[1]]
  const newB: GridPoint = horizontal ? [b[0], coordinate] : [coordinate, b[1]]
  const head = index === 0 ? [a, newA] : [newA]
  const tail = index + 1 === last ? [newB, b] : [newB]
  return normalizePoints([...points.slice(0, index), ...head, ...tail, ...points.slice(index + 2)])
}

/**
 * Déplace un sommet. Les segments voisins restent horizontaux ou verticaux : leurs autres
 * sommets glissent, sauf les extrémités du fil, qui restent fixes et reçoivent un coude.
 */
export function dragVertex(
  points: readonly GridPoint[],
  index: number,
  target: GridPoint
): GridPoint[] {
  const vertex = points[index]
  if (!vertex) return [...points]
  const last = points.length - 1
  if (points.length < 2) return [target]

  if (index === 0 || index === last) {
    // L'extrémité emmène son segment, qui garde son orientation : le sommet voisin glisse,
    // ou, s'il est lui-même l'autre extrémité, un coude s'intercale.
    const neighborIndex = index === 0 ? 1 : last - 1
    const neighbor = points[neighborIndex]
    if (!neighbor) return [target]
    const wasHorizontal = vertex[1] === neighbor[1]
    const joint: GridPoint = wasHorizontal ? [neighbor[0], target[1]] : [target[0], neighbor[1]]
    const neighborIsEnd = neighborIndex === 0 || neighborIndex === last
    const middle: GridPoint[] = neighborIsEnd ? [joint, neighbor] : [joint]
    return normalizePoints(
      index === 0
        ? [target, ...middle, ...points.slice(neighborIndex + 1)]
        : [...points.slice(0, neighborIndex), ...middle.reverse(), target]
    )
  }

  const previous = points[index - 1]
  const next = points[index + 1]
  if (!previous || !next) return [...points]
  const previousHorizontal = previous[1] === vertex[1]

  // Le segment précédent garde son orientation ; son autre sommet glisse ou reçoit un coude.
  const before: GridPoint[] = previousHorizontal
    ? index - 1 === 0
      ? [previous, [previous[0], target[1]]]
      : [[previous[0], target[1]]]
    : index - 1 === 0
      ? [previous, [target[0], previous[1]]]
      : [[target[0], previous[1]]]
  const after: GridPoint[] = previousHorizontal
    ? index + 1 === last
      ? [[target[0], next[1]], next]
      : [[target[0], next[1]]]
    : index + 1 === last
      ? [[next[0], target[1]], next]
      : [[next[0], target[1]]]

  return normalizePoints([
    ...points.slice(0, index - 1),
    ...before,
    target,
    ...after,
    ...points.slice(index + 2)
  ])
}

export function wireBounds(points: readonly GridPoint[]): GridRect | null {
  const first = points[0]
  if (!first) return null
  let x1 = first[0]
  let y1 = first[1]
  let x2 = first[0]
  let y2 = first[1]
  for (const [x, y] of points) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Vrai si un segment du fil traverse ou touche le rectangle. */
export function wireIntersectsRect(points: readonly GridPoint[], rect: GridRect): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const x1 = Math.min(a[0], b[0])
    const x2 = Math.max(a[0], b[0])
    const y1 = Math.min(a[1], b[1])
    const y2 = Math.max(a[1], b[1])
    if (x1 <= rect.x + rect.width && rect.x <= x2 && y1 <= rect.y + rect.height && rect.y <= y2) {
      return true
    }
  }
  return false
}
