import type { GridPoint } from './grid'
import type { CrossingOverride, Wire } from './project'

/**
 * Croisements de fils : un segment horizontal d'un fil coupe un segment vertical d'un autre,
 * strictement à l'intérieur des deux segments. Un croisement ne relie rien ; il faut seulement
 * décider lequel des deux fils passe au-dessus : le rang d'empilement, sauf exception locale.
 */

export interface Crossing {
  point: GridPoint
  horizontalWireId: string
  verticalWireId: string
}

/** Morceau à redessiner au-dessus d'un croisement : le fil du dessus, dans sa direction. */
export interface CrossingPiece {
  point: GridPoint
  topWireId: string
  horizontal: boolean
}

export function computeCrossings(wires: readonly Wire[]): Crossing[] {
  const result: Crossing[] = []
  for (const a of wires) {
    for (let i = 0; i < a.points.length - 1; i++) {
      const h1 = a.points[i]
      const h2 = a.points[i + 1]
      if (!h1 || !h2 || h1[1] !== h2[1]) continue
      const y = h1[1]
      const hx1 = Math.min(h1[0], h2[0])
      const hx2 = Math.max(h1[0], h2[0])
      for (const b of wires) {
        if (b.id === a.id) continue
        for (let j = 0; j < b.points.length - 1; j++) {
          const v1 = b.points[j]
          const v2 = b.points[j + 1]
          if (!v1 || !v2 || v1[0] !== v2[0]) continue
          const x = v1[0]
          const vy1 = Math.min(v1[1], v2[1])
          const vy2 = Math.max(v1[1], v2[1])
          if (x > hx1 && x < hx2 && y > vy1 && y < vy2) {
            result.push({ point: [x, y], horizontalWireId: a.id, verticalWireId: b.id })
          }
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
  return stackOf(crossing.horizontalWireId) >= stackOf(crossing.verticalWireId)
    ? crossing.horizontalWireId
    : crossing.verticalWireId
}

/** Fil dessiné au-dessus à ce croisement : l'exception locale si elle vise un des deux fils, sinon le rang. */
export function crossingTop(
  crossing: Crossing,
  overrides: readonly CrossingOverride[],
  stackOf: (id: string) => number
): string {
  const override = overrideAt(overrides, crossing.point)
  if (
    override &&
    (override.topWireId === crossing.horizontalWireId ||
      override.topWireId === crossing.verticalWireId)
  ) {
    return override.topWireId
  }
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
        (crossing.horizontalWireId === override.topWireId ||
          crossing.verticalWireId === override.topWireId)
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
  const current = crossingTop(crossing, overrides, stackOf)
  const wanted =
    current === crossing.horizontalWireId ? crossing.verticalWireId : crossing.horizontalWireId
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
    return { point: crossing.point, topWireId, horizontal: topWireId === crossing.horizontalWireId }
  })
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
