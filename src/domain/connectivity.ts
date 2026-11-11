import type { GridPoint } from './grid'
import { absolutePinPosition, instanceDefinition, type Project, type Wire } from './project'
import { locateOnWire } from './wires'

/**
 * Connectivité électrique dérivée de la géométrie, jamais stockée :
 * - deux fils sont reliés quand une extrémité de l'un est sur un sommet ou un segment de l'autre ;
 * - un fil est relié à une broche quand une extrémité est dessus ;
 * - un croisement en milieu de segment ne relie rien.
 * Un point de jonction apparaît là où au moins trois branches arrivent (T, croix reliée).
 */

export interface PinRef {
  /** `${instanceId}:${pinId}` */
  key: string
  instanceId: string
  pinId: string
  point: GridPoint
}

export interface Junction {
  point: GridPoint
  /** Fil « porteur », celui sur lequel on se branche : donne la couleur du point. */
  carrierWireId: string
  branches: number
}

export interface FreeEnd {
  wireId: string
  endIndex: number
  point: GridPoint
}

export interface Connectivity {
  junctions: Junction[]
  freeEnds: FreeEnd[]
  /** Numéro de net de chaque fil. */
  wireNet: ReadonlyMap<string, number>
  /** Numéro de net de chaque broche (clé de PinRef). */
  pinNet: ReadonlyMap<string, number>
  /** Broches qu'aucun fil ni aucune autre broche ne relie. */
  unconnectedPinKeys: ReadonlySet<string>
}

/** Broches de toutes les instances, en coordonnées absolues. */
export function projectPins(project: Project): PinRef[] {
  const refs: PinRef[] = []
  for (const instance of project.components) {
    const def = instanceDefinition(project, instance)
    if (!def) continue
    for (const pin of def.pins) {
      const position = absolutePinPosition(instance, def, pin)
      refs.push({
        key: `${instance.id}:${pin.id}`,
        instanceId: instance.id,
        pinId: pin.id,
        point: [position.x, position.y]
      })
    }
  }
  return refs
}

class UnionFind {
  private readonly parent = new Map<string, string>()

  find(node: string): string {
    if (!this.parent.has(node)) this.parent.set(node, node)
    let root: string = node
    for (;;) {
      const next = this.parent.get(root)
      if (next === undefined || next === root) break
      root = next
    }
    this.parent.set(node, root)
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent.set(rootA, rootB)
  }
}

const pointKey = (p: GridPoint): string => `${p[0]},${p[1]}`

export function computeConnectivity(wires: readonly Wire[], pins: readonly PinRef[]): Connectivity {
  const uf = new UnionFind()
  const pinsByPoint = new Map<string, PinRef[]>()
  for (const pin of pins) {
    uf.find(`p:${pin.key}`)
    const list = pinsByPoint.get(pointKey(pin.point)) ?? []
    list.push(pin)
    pinsByPoint.set(pointKey(pin.point), list)
  }
  // Deux broches sur la même intersection (composants qui se touchent) sont reliées.
  for (const list of pinsByPoint.values()) {
    for (let i = 1; i < list.length; i++) {
      const first = list[0]
      const other = list[i]
      if (first && other) uf.union(`p:${first.key}`, `p:${other.key}`)
    }
  }

  const freeEnds: FreeEnd[] = []
  const junctionAt = new Map<string, Junction>()

  for (const wire of wires) {
    uf.find(`w:${wire.id}`)
    const endIndexes = [0, wire.points.length - 1]
    for (const endIndex of endIndexes) {
      const point = wire.points[endIndex]
      if (!point) continue
      let branches = 1
      let touched = false
      const candidates: { id: string; stack: number; passing: boolean }[] = []
      for (const other of wires) {
        if (other.id === wire.id) continue
        const location = locateOnWire(other.points, point)
        if (!location) continue
        uf.union(`w:${wire.id}`, `w:${other.id}`)
        touched = true
        const passing = location.kind !== 'end'
        branches += passing ? 2 : 1
        candidates.push({ id: other.id, stack: other.stack, passing })
      }
      const pinsHere = pinsByPoint.get(pointKey(point)) ?? []
      for (const pin of pinsHere) {
        uf.union(`w:${wire.id}`, `p:${pin.key}`)
        touched = true
      }
      if (!touched) freeEnds.push({ wireId: wire.id, endIndex, point })
      const key = pointKey(point)
      if (branches >= 3 && pinsHere.length === 0 && !junctionAt.has(key)) {
        const sorted = [...candidates].sort(
          (a, b) => Number(b.passing) - Number(a.passing) || a.stack - b.stack
        )
        junctionAt.set(key, { point, carrierWireId: sorted[0]?.id ?? wire.id, branches })
      }
    }
  }

  const roots = new Map<string, number>()
  const netOf = (node: string): number => {
    const root = uf.find(node)
    let net = roots.get(root)
    if (net === undefined) {
      net = roots.size
      roots.set(root, net)
    }
    return net
  }
  const wireNet = new Map(wires.map((wire) => [wire.id, netOf(`w:${wire.id}`)]))
  const pinNet = new Map(pins.map((pin) => [pin.key, netOf(`p:${pin.key}`)]))

  const netsWithWires = new Set(wireNet.values())
  const pinsPerNet = new Map<number, number>()
  for (const net of pinNet.values()) pinsPerNet.set(net, (pinsPerNet.get(net) ?? 0) + 1)
  const unconnectedPinKeys = new Set<string>()
  for (const [key, net] of pinNet) {
    if (!netsWithWires.has(net) && (pinsPerNet.get(net) ?? 0) < 2) unconnectedPinKeys.add(key)
  }

  return { junctions: [...junctionAt.values()], freeEnds, wireNet, pinNet, unconnectedPinKeys }
}
