import type { GridPoint } from './grid'
import type { CrossingOverride, Wire } from './project'

/**
 * Croisements de fils : deux segments de fils différents, de directions différentes, qui se
 * coupent strictement à l'intérieur de l'un et de l'autre. Un croisement ne relie rien ; il faut
 * seulement décider lequel des deux fils passe au-dessus : le rang d'empilement, sauf exception
 * locale.
 */

export interface Crossing {
  /** Point du croisement ; entre deux diagonales, il peut tomber au milieu d'une cellule. */
  point: GridPoint
  /** Les deux fils ; à rang d'empilement égal, le premier passe au-dessus. */
  wireIds: readonly [string, string]
  /** Direction de chacun à cet endroit : (1, 0), (1, 1), (1, -1) ou (0, 1). */
  steps: readonly [GridPoint, GridPoint]
}

/** Morceau à redessiner au-dessus d'un croisement : le fil du dessus, dans sa direction. */
export interface CrossingPiece {
  point: GridPoint
  topWireId: string
  /** Direction du fil du dessus : (1, 0), (1, 1), (1, -1) ou (0, 1). */
  step: GridPoint
}

/** Direction d'un segment sans son sens, ou null s'il est nul. */
function direction(a: GridPoint, b: GridPoint): GridPoint | null {
  const dx = Math.sign(b[0] - a[0])
  const dy = Math.sign(b[1] - a[1])
  if (dx === 0 && dy === 0) return null
  if (dx === 0) return [0, 1]
  return dx > 0 ? [1, dy] : [1, -dy]
}

/** Rang d'une direction : horizontale d'abord, verticale en dernier, comme avant les diagonales. */
function directionRank(step: GridPoint): number {
  if (step[0] === 0) return 3
  return step[1] === 0 ? 0 : step[1] > 0 ? 1 : 2
}

/** Point où deux segments se coupent strictement à l'intérieur de chacun, ou null. */
function interiorCrossing(
  a1: GridPoint,
  a2: GridPoint,
  b1: GridPoint,
  b2: GridPoint
): GridPoint | null {
  const ax = a2[0] - a1[0]
  const ay = a2[1] - a1[1]
  const bx = b2[0] - b1[0]
  const by = b2[1] - b1[1]
  const denominator = ax * by - ay * bx
  if (denominator === 0) return null
  const ox = b1[0] - a1[0]
  const oy = b1[1] - a1[1]
  const alongA = (ox * by - oy * bx) / denominator
  const alongB = (ox * ay - oy * ax) / denominator
  if (!(alongA > 0 && alongA < 1 && alongB > 0 && alongB < 1)) return null
  // Produit avant division : le point, entier ou demi-entier, est exact.
  const numerator = ox * by - oy * bx
  return [a1[0] + (numerator * ax) / denominator, a1[1] + (numerator * ay) / denominator]
}

export function computeCrossings(wires: readonly Wire[]): Crossing[] {
  const result: Crossing[] = []
  for (let i = 0; i < wires.length; i++) {
    const a = wires[i]
    if (!a) continue
    for (let j = i + 1; j < wires.length; j++) {
      const b = wires[j]
      if (!b) continue
      for (let m = 0; m < a.points.length - 1; m++) {
        const a1 = a.points[m]
        const a2 = a.points[m + 1]
        const stepA = a1 && a2 ? direction(a1, a2) : null
        if (!a1 || !a2 || !stepA) continue
        for (let n = 0; n < b.points.length - 1; n++) {
          const b1 = b.points[n]
          const b2 = b.points[n + 1]
          const stepB = b1 && b2 ? direction(b1, b2) : null
          if (!b1 || !b2 || !stepB) continue
          const point = interiorCrossing(a1, a2, b1, b2)
          if (!point) continue
          result.push(
            directionRank(stepA) <= directionRank(stepB)
              ? { point, wireIds: [a.id, b.id], steps: [stepA, stepB] }
              : { point, wireIds: [b.id, a.id], steps: [stepB, stepA] }
          )
        }
      }
    }
  }
  return result
}

function overrideAt(
  overrides: readonly CrossingOverride[],
  point: GridPoint
): CrossingOverride | undefined {
  return overrides.find((override) => override.x === point[0] && override.y === point[1])
}

function defaultTop(crossing: Crossing, stackOf: (id: string) => number): string {
  const [first, second] = crossing.wireIds
  return stackOf(first) >= stackOf(second) ? first : second
}

/** Fil dessiné au-dessus à ce croisement : l'exception locale si elle vise un des deux fils, sinon le rang. */
export function crossingTop(
  crossing: Crossing,
  overrides: readonly CrossingOverride[],
  stackOf: (id: string) => number
): string {
  const override = overrideAt(overrides, crossing.point)
  if (override && crossing.wireIds.includes(override.topWireId)) return override.topWireId
  return defaultTop(crossing, stackOf)
}

/** Garde seulement les exceptions qui correspondent encore à un croisement de leur fil. */
export function pruneCrossingOverrides(
  overrides: readonly CrossingOverride[],
  crossings: readonly Crossing[]
): CrossingOverride[] {
  return overrides.filter((override) =>
    crossings.some(
      (crossing) =>
        crossing.point[0] === override.x &&
        crossing.point[1] === override.y &&
        crossing.wireIds.includes(override.topWireId)
    )
  )
}

/**
 * Alt+clic sur un croisement : l'autre fil passe au-dessus. Si ce nouvel ordre est celui du rang
 * d'empilement, l'exception disparaît ; sinon elle est posée ou remplacée.
 */
export function toggledOverrides(
  overrides: readonly CrossingOverride[],
  crossing: Crossing,
  stackOf: (id: string) => number
): CrossingOverride[] {
  const [first, second] = crossing.wireIds
  const current = crossingTop(crossing, overrides, stackOf)
  const wanted = current === first ? second : first
  const others = overrides.filter(
    (override) => override.x !== crossing.point[0] || override.y !== crossing.point[1]
  )
  if (wanted === defaultTop(crossing, stackOf)) return others
  return [...others, { x: crossing.point[0], y: crossing.point[1], topWireId: wanted }]
}

export function crossingPieces(
  wires: readonly Wire[],
  overrides: readonly CrossingOverride[]
): CrossingPiece[] {
  const stacks = new Map(wires.map((wire) => [wire.id, wire.stack]))
  const stackOf = (id: string): number => stacks.get(id) ?? 0
  return computeCrossings(wires).map((crossing) => {
    const topWireId = crossingTop(crossing, overrides, stackOf)
    const step = topWireId === crossing.wireIds[0] ? crossing.steps[0] : crossing.steps[1]
    return { point: crossing.point, topWireId, step }
  })
}

/**
 * Bouts du morceau de fil redessiné sur un croisement : une demi-cellule de part et d'autre du
 * point, dans la direction du fil du dessus.
 */
export function crossingPieceEnds(piece: CrossingPiece): [GridPoint, GridPoint] {
  const [x, y] = piece.point
  const half = 0.5 / Math.hypot(piece.step[0], piece.step[1])
  const dx = piece.step[0] * half
  const dy = piece.step[1] * half
  return [
    [x - dx, y - dy],
    [x + dx, y + dy]
  ]
}

/** Croisement le plus proche d'un point (en cellules), dans un rayon donné. */
export function nearestCrossing(
  crossings: readonly Crossing[],
  x: number,
  y: number,
  maxDistance: number
): Crossing | null {
  let best: Crossing | null = null
  let bestDistance = maxDistance
  for (const crossing of crossings) {
    const distance = Math.hypot(crossing.point[0] - x, crossing.point[1] - y)
    if (distance <= bestDistance) {
      best = crossing
      bestDistance = distance
    }
  }
  return best
}
