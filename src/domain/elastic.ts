import type { PinRef } from './connectivity'
import type { GridPoint } from './grid'
import { wireGeometryProblem, type Wire } from './project'
import {
  dragVertex,
  locateOnWire,
  pointOnSegment,
  pointsEqual,
  simplifyPoints,
  translatePoints
} from './wires'

/**
 * Élasticité des fils. Quand des composants bougent (déplacement, rotation, miroir), les
 * extrémités de fil posées sur leurs broches suivent, l'extrémité emmenant son segment et un
 * coude s'ajoutant au besoin (`dragVertex`). Un fil déplacé en bloc (sélectionné avec les
 * composants) garde ses extrémités posées sur des broches restées immobiles. Rien n'est stocké :
 * on compare simplement la position des broches avant et après. De même, les extrémités posées
 * sur un fil (jonctions) suivent ce fil quand son tracé change (`wiresFollowingJunctions`).
 */

const pointKey = (p: GridPoint): string => `${p[0]},${p[1]}`

/**
 * Fils après un mouvement de composants. `pinsBefore` et `pinsAfter` décrivent les mêmes broches
 * (même clé) avant et après ; `translated` donne, par identifiant, le vecteur des fils déplacés
 * en bloc. Un fil qui ne change pas est retourné tel quel (même objet).
 */
export function wiresFollowingPins(
  wires: readonly Wire[],
  pinsBefore: readonly PinRef[],
  pinsAfter: readonly PinRef[],
  translated: ReadonlyMap<string, GridPoint> = new Map()
): Wire[] {
  const after = new Map(pinsAfter.map((pin) => [pin.key, pin.point]))
  /** Positions d'arrivée des broches qui partaient de chaque point. */
  const targetsByPoint = new Map<string, GridPoint[]>()
  for (const pin of pinsBefore) {
    const target = after.get(pin.key)
    if (!target) continue
    const key = pointKey(pin.point)
    const list = targetsByPoint.get(key) ?? []
    list.push(target)
    targetsByPoint.set(key, list)
  }

  return wires.map((wire) => {
    const shift = translated.get(wire.id)
    const points = shift ? translatePoints(wire.points, shift[0], shift[1]) : wire.points
    const first = wire.points[0]
    const last = wire.points.at(-1)
    if (!first || !last || wire.points.length < 2) return wire

    const moves: { atStart: boolean; target: GridPoint }[] = []
    for (const end of [
      { atStart: true, original: first },
      { atStart: false, original: last }
    ]) {
      const targets = targetsByPoint.get(pointKey(end.original))
      if (!targets) continue
      // Une broche qui bouge l'emporte ; sinon l'extrémité reste sur la broche immobile.
      const target =
        targets.find((candidate) => !pointsEqual(candidate, end.original)) ?? targets[0]
      const current = end.atStart ? points[0] : points.at(-1)
      if (!target || !current || pointsEqual(current, target)) continue
      moves.push({ atStart: end.atStart, target })
    }

    if (moves.length === 0) return shift ? { ...wire, points } : wire

    let adjusted = simplifyPoints(points)
    for (const move of moves) {
      adjusted = dragVertex(adjusted, move.atStart ? 0 : adjusted.length - 1, move.target)
    }
    if (adjusted.length < 2 || wireGeometryProblem(adjusted) !== null) {
      return shift ? { ...wire, points } : wire
    }
    return { ...wire, points: adjusted }
  })
}

// Jonctions qui suivent

function samePoints(a: readonly GridPoint[], b: readonly GridPoint[]): boolean {
  return a.length === b.length && a.every((point, i) => pointsEqual(point, b[i] ?? [NaN, NaN]))
}

/** Vecteur commun si `after` est `before` déplacé en bloc, sinon null. */
function blockShift(before: readonly GridPoint[], after: readonly GridPoint[]): GridPoint | null {
  const from = before[0]
  const to = after[0]
  if (!from || !to || before.length !== after.length) return null
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const shifted = before.every((point, i) => {
    const moved = after[i]
    return moved !== undefined && moved[0] - point[0] === dx && moved[1] - point[1] === dy
  })
  return shifted ? [dx, dy] : null
}

function clamp(value: number, a: number, b: number): number {
  return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b))
}

/**
 * Où va un point de jonction posé sur un fil dont le tracé passe de `before` à `after`. Il suit
 * un déplacement en bloc ; sinon il reste en place si le fil y passe toujours ; sinon il glisse
 * sur le segment parallèle le plus proche qui couvre sa position (le segment qu'on vient de
 * déplacer) ; à défaut, sur le point du fil le plus proche.
 */
export function movedJunction(
  before: readonly GridPoint[],
  after: readonly GridPoint[],
  point: GridPoint
): GridPoint {
  const shift = blockShift(before, after)
  if (shift) return [point[0] + shift[0], point[1] + shift[1]]
  if (locateOnWire(after, point)) return point

  let onHorizontal = false
  let onVertical = false
  for (let i = 0; i + 1 < before.length; i++) {
    const a = before[i]
    const b = before[i + 1]
    if (!a || !b || !pointOnSegment(point, a, b)) continue
    if (a[1] === b[1]) onHorizontal = true
    if (a[0] === b[0]) onVertical = true
  }

  let parallel: GridPoint | null = null
  let parallelDistance = Number.POSITIVE_INFINITY
  let nearest: GridPoint = after[0] ?? point
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i + 1 < after.length; i++) {
    const a = after[i]
    const b = after[i + 1]
    if (!a || !b) continue
    const horizontal = a[1] === b[1]
    const projected: GridPoint = horizontal
      ? [clamp(point[0], a[0], b[0]), a[1]]
      : [a[0], clamp(point[1], a[1], b[1])]
    const distance = Math.abs(projected[0] - point[0]) + Math.abs(projected[1] - point[1])
    if (distance < nearestDistance) {
      nearest = projected
      nearestDistance = distance
    }
    const covers = horizontal ? projected[0] === point[0] : projected[1] === point[1]
    const sameAxis = horizontal ? onHorizontal : onVertical
    if (covers && sameAxis && distance < parallelDistance) {
      parallel = projected
      parallelDistance = distance
    }
  }
  return parallel ?? nearest
}

/**
 * Fils après qu'une commande a changé des tracés (`before` → `after`) : les extrémités des autres
 * fils posées sur un fil qui a bougé le suivent, l'extrémité emmenant son segment et un coude
 * s'ajoutant au besoin, comme pour une broche. La règle se propage : un fil qui suit emmène à son
 * tour les jonctions qu'il porte. Ne suivent pas : une extrémité que la commande a elle-même
 * déplacée, ni une extrémité posée sur une broche (`pins`, positions d'arrivée). Un fil qui ne
 * change pas est retourné tel quel (même objet).
 */
export function wiresFollowingJunctions(
  before: readonly Wire[],
  after: readonly Wire[],
  pins: readonly PinRef[] = []
): Wire[] {
  const original = new Map(before.map((wire) => [wire.id, wire]))
  const pinPoints = new Set(pins.map((pin) => pointKey(pin.point)))
  /** Extrémités déjà emmenées : chacune ne suit qu'une fois, la propagation s'arrête donc. */
  const moved = new Set<string>()
  let current = [...after]

  for (let pass = 0; pass <= after.length; pass++) {
    const carriers = current.flatMap((wire) => {
      const old = original.get(wire.id)
      return old && !samePoints(old.points, wire.points)
        ? [{ id: wire.id, from: old.points, to: wire.points }]
        : []
    })
    if (carriers.length === 0) break

    let changed = false
    current = current.map((wire) => {
      const old = original.get(wire.id)
      if (!old || old.points.length < 2) return wire
      let points: GridPoint[] | null = null
      for (const atStart of [true, false]) {
        const key = `${wire.id}:${atStart ? 'start' : 'end'}`
        if (moved.has(key)) continue
        const shown = points ?? wire.points
        const origin = atStart ? old.points[0] : old.points.at(-1)
        const now = atStart ? shown[0] : shown.at(-1)
        if (!origin || !now || !pointsEqual(origin, now) || pinPoints.has(pointKey(now))) continue
        let target: GridPoint | null = null
        for (const carrier of carriers) {
          if (carrier.id === wire.id || !locateOnWire(carrier.from, origin)) continue
          const candidate = movedJunction(carrier.from, carrier.to, origin)
          if (!pointsEqual(candidate, origin)) {
            target = candidate
            break
          }
        }
        if (!target) continue
        const base = simplifyPoints(shown)
        const adjusted = dragVertex(base, atStart ? 0 : base.length - 1, target)
        if (adjusted.length < 2 || wireGeometryProblem(adjusted) !== null) continue
        points = adjusted
        moved.add(key)
      }
      if (!points) return wire
      changed = true
      return { ...wire, points }
    })
    if (!changed) break
  }
  return current
}
