import type { PinRef } from './connectivity'
import type { GridPoint } from './grid'
import { wireGeometryProblem, type Wire } from './project'
import { dragVertex, pointsEqual, simplifyPoints, translatePoints } from './wires'

/**
 * Élasticité des fils. Quand des composants bougent (déplacement, rotation, miroir), les
 * extrémités de fil posées sur leurs broches suivent, l'extrémité emmenant son segment et un
 * coude s'ajoutant au besoin (`dragVertex`). Un fil déplacé en bloc (sélectionné avec les
 * composants) garde ses extrémités posées sur des broches restées immobiles. Rien n'est stocké :
 * on compare simplement la position des broches avant et après.
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
