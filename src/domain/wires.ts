import type { GridPoint, LocalPoint } from './grid'
import type { GridRect } from './placement'

/**
 * Géométrie des fils : polylignes d'intersections de grille à segments horizontaux, verticaux ou
 * en diagonale à 45°. Tout est en unités de grille et sans état ; le rendu et l'édition s'appuient
 * sur ces fonctions. Les liens d'un diagramme ont la même géométrie, sans les diagonales.
 */

export function pointsEqual(a: GridPoint, b: GridPoint): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function translatePoints(points: readonly GridPoint[], dx: number, dy: number): GridPoint[] {
  return points.map(([x, y]): GridPoint => [x + dx, y + dy])
}

/** Vrai si p est sur le segment [a, b], extrémités comprises, quelle que soit sa direction. */
export function pointOnSegment(p: GridPoint, a: GridPoint, b: GridPoint): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  return (
    cross === 0 &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  )
}

/**
 * Pas de grille d'un segment, de a vers b : (±1, 0), (0, ±1), ou (±1, ±1) pour une diagonale à
 * 45°. Null pour un segment nul ou d'une autre pente.
 */
export function segmentStep(a: GridPoint, b: GridPoint): GridPoint | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return null
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null
  return [Math.sign(dx), Math.sign(dy)]
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

/**
 * Trajet à 45° entre deux points : une diagonale rattrape le plus petit des deux écarts, un
 * segment droit fait le reste. La diagonale part du premier point ; `straightFirst` (Maj) la met
 * à l'arrivée. Deux points alignés ou en diagonale exacte donnent un seul segment.
 */
export function routeDiagonal(from: GridPoint, to: GridPoint, straightFirst = false): GridPoint[] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const reach = Math.min(Math.abs(dx), Math.abs(dy))
  const sx = Math.sign(dx) * reach
  const sy = Math.sign(dy) * reach
  const corner: GridPoint = straightFirst ? [to[0] - sx, to[1] - sy] : [from[0] + sx, from[1] + sy]
  return dedupeConsecutive([from, corner, to])
}

/** Trajet d'un tracé de fil : en L, ou à 45° quand `diagonal` (Alt) ; `invert` (Maj) change l'ordre. */
export function routeWire(
  from: GridPoint,
  to: GridPoint,
  options: { invert?: boolean; diagonal?: boolean } = {}
): GridPoint[] {
  return options.diagonal
    ? routeDiagonal(from, to, options.invert)
    : routeLAuto(from, to, options.invert)
}

export function segmentLength(a: GridPoint, b: GridPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

/**
 * Tracé SVG d'un fil en unités de grille. Chaque coude est arrondi par un arc de rayon
 * `cornerRadius` tangent à ses deux segments, quel que soit l'angle (90°, ou 45° et 135° avec une
 * diagonale) ; l'arc ne prend jamais plus de la moitié d'un segment adjacent.
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
    // Sens du virage sur les vecteurs entiers : exact, même pour deux diagonales alignées.
    const turn =
      (vertex[0] - previous[0]) * (next[1] - vertex[1]) -
      (vertex[1] - previous[1]) * (next[0] - vertex[0])
    if (turn === 0 || cornerRadius <= 0 || inLength === 0 || outLength === 0) {
      d += ` L ${fmt(vertex[0])} ${fmt(vertex[1])}`
      continue
    }
    const inX = (vertex[0] - previous[0]) / inLength
    const inY = (vertex[1] - previous[1]) / inLength
    const outX = (next[0] - vertex[0]) / outLength
    const outY = (next[1] - vertex[1]) / outLength
    // Distance du sommet aux points de tangence : rayon × tan(déviation / 2) ; 1 pour un angle droit.
    const tanHalf = Math.abs(inX * outY - inY * outX) / (1 + inX * outX + inY * outY)
    const reach = Math.min(cornerRadius * tanHalf, inLength / 2, outLength / 2)
    const radius = reach / tanHalf
    const startX = vertex[0] - inX * reach
    const startY = vertex[1] - inY * reach
    const endX = vertex[0] + outX * reach
    const endY = vertex[1] + outY * reach
    d += ` L ${fmt(startX)} ${fmt(startY)} A ${fmt(radius)} ${fmt(radius)} 0 0 ${turn > 0 ? 1 : 0} ${fmt(endX)} ${fmt(endY)}`
  }
  const last = points.at(-1)
  if (last && points.length > 1) d += ` L ${fmt(last[0])} ${fmt(last[1])}`
  return d
}

/** Distance d'un point quelconque à un segment. */
export function distanceToSegment(p: LocalPoint, a: GridPoint, b: GridPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / lengthSquared))
  return Math.hypot(p.x - (a[0] + along * dx), p.y - (a[1] + along * dy))
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
 * Intersection de la droite passant par `through`, de direction `step`, avec la droite (a, b) ;
 * null si elles sont parallèles ou si le point ne tombe pas sur la grille (deux diagonales qui se
 * coupent au milieu d'une cellule).
 */
function slideTo(
  through: GridPoint,
  step: GridPoint,
  a: GridPoint,
  b: GridPoint
): GridPoint | null {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const denominator = step[0] * ey - step[1] * ex
  if (denominator === 0) return null
  const along = ((a[0] - through[0]) * ey - (a[1] - through[1]) * ex) / denominator
  const x = through[0] + along * step[0]
  const y = through[1] + along * step[1]
  return Number.isInteger(x) && Number.isInteger(y) ? [x, y] : null
}

/**
 * Coude entre un sommet déplacé en `target`, dont le segment avait la direction `step`, et un
 * point qui reste fixe : le segment garde son orientation et un second, perpendiculaire, rejoint
 * le point fixe ; une diagonale rattrape le plus petit écart, le reste est droit.
 */
function jointToward(target: GridPoint, step: GridPoint, fixed: GridPoint): GridPoint {
  if (step[1] === 0) return [fixed[0], target[1]]
  if (step[0] === 0) return [target[0], fixed[1]]
  const dx = fixed[0] - target[0]
  const dy = fixed[1] - target[1]
  const reach = Math.min(Math.abs(dx), Math.abs(dy))
  return [target[0] + Math.sign(dx) * reach, target[1] + Math.sign(dy) * reach]
}

/**
 * Coordonnée que `moveSegment` attend pour amener un segment sous le pointeur : l'ordonnée pour un
 * segment horizontal, l'abscisse pour un vertical ; pour une diagonale, l'abscisse où sa droite,
 * passant par le pointeur, coupe la rangée de son premier sommet.
 */
export function segmentCoordinate(
  points: readonly GridPoint[],
  index: number,
  pointer: LocalPoint
): number {
  const a = points[index]
  const b = points[index + 1]
  const step = a && b ? segmentStep(a, b) : null
  if (!a || !step) return Math.round(pointer.x)
  if (step[1] === 0) return Math.round(pointer.y)
  if (step[0] === 0) return Math.round(pointer.x)
  return Math.round(pointer.x - (pointer.y - a[1]) * step[0] * step[1])
}

/**
 * Déplace un segment parallèlement à lui-même : nouvelle ordonnée pour un segment horizontal,
 * nouvelle abscisse pour un vertical ; pour une diagonale, l'abscisse où sa droite coupe la
 * rangée de son premier sommet (voir `segmentCoordinate`). Les segments voisins gardent leur
 * direction : leur sommet commun glisse le long d'eux. Les extrémités du fil ne bougent pas : un
 * coude les relie au segment déplacé ; de même pour un voisin aligné, qu'on ne peut pas faire
 * glisser.
 */
export function moveSegment(
  points: readonly GridPoint[],
  index: number,
  coordinate: number
): GridPoint[] {
  const a = points[index]
  const b = points[index + 1]
  const step = a && b ? segmentStep(a, b) : null
  if (!a || !b || !step) return [...points]
  const through: GridPoint = step[1] === 0 ? [a[0], coordinate] : [coordinate, a[1]]

  /** Sommets qui remplacent un bout du segment, de l'extérieur vers le segment déplacé. */
  const moved = (corner: GridPoint, beyond: GridPoint | undefined): GridPoint[] | null => {
    if (beyond) {
      const slid = slideTo(through, step, corner, beyond)
      if (slid) return [slid]
    }
    const across: GridPoint =
      step[1] === 0 ? [corner[0], corner[1] + 1] : [corner[0] + 1, corner[1]]
    const foot = slideTo(through, step, corner, across)
    return foot ? [corner, foot] : null
  }
  const head = moved(a, points[index - 1])
  const tail = moved(b, points[index + 2])
  if (!head || !tail) return [...points]
  return normalizePoints([
    ...points.slice(0, index),
    ...head,
    ...tail.reverse(),
    ...points.slice(index + 2)
  ])
}

/**
 * Déplace un sommet. Ses deux segments gardent leur direction (horizontale, verticale ou
 * diagonale) : leurs autres sommets glissent le long du segment suivant. Une extrémité du fil,
 * elle, reste fixe et reçoit un coude ; de même un sommet qu'on ne peut pas faire glisser (voisin
 * aligné, ou diagonales qui se couperaient hors de la grille).
 */
export function dragVertex(
  points: readonly GridPoint[],
  index: number,
  target: GridPoint
): GridPoint[] {
  const vertex = points[index]
  if (!vertex) return [...points]
  if (points.length < 2) return [target]
  const last = points.length - 1

  /** Sommets qui remplacent un voisin du sommet déplacé, du plus proche de `target` au plus loin. */
  const side = (neighbor: GridPoint | undefined, beyond: GridPoint | undefined): GridPoint[] => {
    if (!neighbor) return []
    const step = segmentStep(vertex, neighbor)
    if (!step) return [neighbor]
    if (beyond) {
      const slid = slideTo(target, step, neighbor, beyond)
      if (slid) return [slid]
    }
    return [jointToward(target, step, neighbor), neighbor]
  }
  const before = index > 0 ? side(points[index - 1], points[index - 2]).reverse() : []
  const after = index < last ? side(points[index + 1], points[index + 2]) : []
  return normalizePoints([
    ...points.slice(0, Math.max(0, index - 1)),
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

/** Vrai si le segment [a, b] traverse ou touche le rectangle (découpage de Liang-Barsky). */
function segmentIntersectsRect(a: GridPoint, b: GridPoint, rect: GridRect): boolean {
  let enter = 0
  let leave = 1
  const clip = (direction: number, room: number): boolean => {
    if (direction === 0) return room >= 0
    const ratio = room / direction
    if (direction < 0) {
      if (ratio > leave) return false
      if (ratio > enter) enter = ratio
    } else {
      if (ratio < enter) return false
      if (ratio < leave) leave = ratio
    }
    return true
  }
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return (
    clip(-dx, a[0] - rect.x) &&
    clip(dx, rect.x + rect.width - a[0]) &&
    clip(-dy, a[1] - rect.y) &&
    clip(dy, rect.y + rect.height - a[1])
  )
}

/** Vrai si un segment du fil traverse ou touche le rectangle. */
export function wireIntersectsRect(points: readonly GridPoint[], rect: GridRect): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a && b && segmentIntersectsRect(a, b, rect)) return true
  }
  return false
}
