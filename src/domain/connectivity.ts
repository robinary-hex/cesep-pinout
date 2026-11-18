import { boardFaces, otherFacePins, type BoardFaces, type HoleTwin } from './boardFaces'
import type { GridPoint } from './grid'
import { absolutePinPosition, instanceDefinition, type Project, type Wire } from './project'
import { locateOnWire } from './wires'

/**
 * Connectivité électrique dérivée de la géométrie, jamais stockée :
 * - deux fils sont reliés quand une extrémité de l'un est sur un sommet ou un segment de l'autre ;
 * - un fil est relié à une broche quand une extrémité est dessus ;
 * - un croisement en milieu de segment ne relie rien ;
 * - un fil nu est relié à toutes les broches posées sur son trajet, pas seulement à ses bouts
 *   (décision du 17 novembre 2026 : aux broches, pas aux pastilles vides d'une plaque) ;
 * - un pont n'est relié que par ses deux bouts : sa courbe ne passe par aucun point de la grille ;
 * - les trous d'une plaque qui montre ses deux faces sont métallisés : ce qui est soudé à un
 *   trou d'un côté l'est aussi de l'autre. La broche enfichée dessus se soude dessous
 *   (`otherFacePins`), deux bouts de fil dans le même trou sont reliés, et un fil nu couché sur
 *   une pastille d'où ressort un bout de fil lui est soudé.
 * Un point de jonction apparaît là où au moins trois branches arrivent (T, croix reliée).
 */

export interface PinRef {
  /** `${instanceId}:${pinId}` */
  key: string
  instanceId: string
  pinId: string
  point: GridPoint
  /**
   * Clé de la broche dont celle-ci est la vue depuis l'autre face d'une plaque : la même broche,
   * à l'endroit où sa patte ressort. Absente pour une broche là où son composant la dessine.
   */
  of?: string
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

/** Soudure d'un fil nu sur une broche de son trajet : là où se dessine le point de soudure. */
export interface Solder {
  wireId: string
  point: GridPoint
}

/**
 * Raccord : là où des fils se touchent, le bout de l'un posé sur un autre ou sur son bout, qu'un
 * point de jonction s'y dessine ou non. C'est là que les bordures des fils se rejoignent en un
 * seul contour (voir `jointRadius` de wireKinds.ts).
 */
export interface WireJoint {
  point: GridPoint
  wireIds: string[]
}

export interface Connectivity {
  junctions: Junction[]
  /** Les raccords entre fils, avec ou sans point de jonction. */
  joints: WireJoint[]
  freeEnds: FreeEnd[]
  /** Soudures des fils nus sur les broches de leur trajet. */
  solders: Solder[]
  /** Numéro de net de chaque fil. */
  wireNet: ReadonlyMap<string, number>
  /** Numéro de net de chaque broche (clé de PinRef). */
  pinNet: ReadonlyMap<string, number>
  /** Broches qu'aucun fil ni aucune autre broche ne relie. */
  unconnectedPinKeys: ReadonlySet<string>
}

/**
 * Broches de toutes les instances, en coordonnées absolues ; celles qui sont enfichées dans une
 * plaque à deux faces y sont une seconde fois, là où elles ressortent sur l'autre face.
 */
export function projectPins(
  project: Pick<Project, 'components' | 'embeddedDefs'>,
  faces: BoardFaces = boardFaces(project)
): PinRef[] {
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
  return faces.twins.size > 0 ? [...refs, ...otherFacePins(refs, faces)] : refs
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

const NO_TWINS: ReadonlyMap<string, HoleTwin> = new Map()

/**
 * `twins` : les trous des plaques à deux faces du montage (`boardFaces`), pour que ce qui est
 * soudé à un trou d'un côté le soit de l'autre ; sans plaque à deux faces, rien à donner.
 */
export function computeConnectivity(
  wires: readonly Wire[],
  pins: readonly PinRef[],
  twins: ReadonlyMap<string, HoleTwin> = NO_TWINS
): Connectivity {
  const uf = new UnionFind()
  /** Nœud d'une broche : le même pour elle et pour sa vue depuis l'autre face d'une plaque. */
  const pinNode = (pin: PinRef): string => `p:${pin.of ?? pin.key}`
  const pinsByPoint = new Map<string, PinRef[]>()
  for (const pin of pins) {
    uf.find(pinNode(pin))
    const list = pinsByPoint.get(pointKey(pin.point)) ?? []
    list.push(pin)
    pinsByPoint.set(pointKey(pin.point), list)
  }
  // Deux broches sur la même intersection (composants qui se touchent) sont reliées.
  for (const list of pinsByPoint.values()) {
    for (let i = 1; i < list.length; i++) {
      const first = list[0]
      const other = list[i]
      if (first && other) uf.union(pinNode(first), pinNode(other))
    }
  }

  const freeEnds: FreeEnd[] = []
  const junctionAt = new Map<string, Junction>()
  /** Raccords, par point : les fils qui s'y touchent. */
  const jointAt = new Map<string, { point: GridPoint; wireIds: Set<string> }>()
  /** Soudures des fils nus, sans doublon : fil et point. */
  const soldered = new Map<string, Solder>()
  const solder = (wireId: string, point: GridPoint): void => {
    const key = `${wireId}:${pointKey(point)}`
    if (!soldered.has(key)) soldered.set(key, { wireId, point })
  }

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
        // Un pont ne se rejoint que par ses bouts : sa courbe ne passe pas par sa corde.
        if (other.kind === 'jumper' && location.kind !== 'end') continue
        uf.union(`w:${wire.id}`, `w:${other.id}`)
        touched = true
        const joint = jointAt.get(pointKey(point)) ?? { point, wireIds: new Set<string>() }
        joint.wireIds.add(wire.id).add(other.id)
        jointAt.set(pointKey(point), joint)
        const passing = location.kind !== 'end'
        branches += passing ? 2 : 1
        candidates.push({ id: other.id, stack: other.stack, passing })
      }
      const pinsHere = pinsByPoint.get(pointKey(point)) ?? []
      for (const pin of pinsHere) {
        uf.union(`w:${wire.id}`, pinNode(pin))
        touched = true
      }
      // Par le trou d'une plaque à deux faces : le bout ressort de l'autre côté, où il est
      // soudé à un autre bout enfiché dans le même trou, ou à un fil nu couché sur la pastille.
      const below = twins.get(pointKey(point))?.point
      if (below) {
        for (const other of wires) {
          if (other.id === wire.id) continue
          const location = locateOnWire(other.points, below)
          if (!location) continue
          if (location.kind !== 'end' && other.kind !== 'bare') continue
          uf.union(`w:${wire.id}`, `w:${other.id}`)
          touched = true
          if (other.kind === 'bare') solder(other.id, below)
        }
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

  // Un fil nu est soudé à toutes les broches posées sur son trajet.
  for (const wire of wires) {
    if (wire.kind !== 'bare') continue
    for (const list of pinsByPoint.values()) {
      const point = list[0]?.point
      if (!point || !locateOnWire(wire.points, point)) continue
      for (const pin of list) uf.union(`w:${wire.id}`, pinNode(pin))
      solder(wire.id, point)
    }
  }
  const solders = [...soldered.values()]

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
  // Une broche compte une fois, là où son composant la dessine.
  const pinNet = new Map(
    pins.filter((pin) => pin.of === undefined).map((pin) => [pin.key, netOf(pinNode(pin))])
  )

  const netsWithWires = new Set(wireNet.values())
  const pinsPerNet = new Map<number, number>()
  for (const net of pinNet.values()) pinsPerNet.set(net, (pinsPerNet.get(net) ?? 0) + 1)
  const unconnectedPinKeys = new Set<string>()
  for (const [key, net] of pinNet) {
    if (!netsWithWires.has(net) && (pinsPerNet.get(net) ?? 0) < 2) unconnectedPinKeys.add(key)
  }

  return {
    junctions: [...junctionAt.values()],
    joints: [...jointAt.values()].map((joint) => ({
      point: joint.point,
      wireIds: [...joint.wireIds]
    })),
    freeEnds,
    solders,
    wireNet,
    pinNet,
    unconnectedPinKeys
  }
}
