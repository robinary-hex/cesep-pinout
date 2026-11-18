import { boardFace, boardFaces, type BoardFaces } from './boardFaces'
import { boardLoad, flipMatrix, isMirrorMatrix, NOTHING_TAKEN } from './boardCarry'
import type { ComponentDefinition } from './component'
import { computeConnectivity, projectPins, type Connectivity, type PinRef } from './connectivity'
import {
  instanceMatrix,
  invertMatrix,
  multiplyMatrices,
  nextNumberedId,
  textLabelBounds,
  transformedInstance,
  transformedPoint,
  transformedRect,
  type Matrix
} from './placement'
import {
  instanceDefinition,
  type ComponentInstance,
  type Project,
  type StowedLoad
} from './project'

// Dessous masqué d'une plaque à trous (décision du 18 novembre 2026). Masquer le dessous d'une
// plaque masque aussi ce qu'il porte : les composants, les fils et les étiquettes posés sur lui
// quittent le montage et se rangent dans la plaque (`stowed` de l'exemplaire), d'où ils
// reviennent quand on remontre le dessous. Rangés, ils ne sont plus nulle part : ni dessinés, ni
// saisis, ni exportés, ni comptés dans la boîte du montage, sans que rien d'autre ait à le
// savoir.
//
// Ils sont notés dans le repère de la plaque, comme s'ils étaient posés sur son dessin : la
// plaque peut bouger, tourner ou se retourner pendant que son dessous est masqué, ils
// retrouveront leur place sous elle.
//
// Une seule chose continue de les voir : la connectivité (`projectConnectivity`). Masquer le
// dessous ne dessoude rien ; les broches qu'il relie restent reliées.

/** Ce qu'une commande change au montage : ses composants, ses fils et ses étiquettes. */
export type StowChange = Pick<Project, 'components' | 'wires' | 'labels'>

const EMPTY_LOAD: StowedLoad = { components: [], wires: [], labels: [] }

function isEmptyLoad(load: StowedLoad): boolean {
  return load.components.length === 0 && load.wires.length === 0 && load.labels.length === 0
}

/** Nombre d'éléments qu'une plaque a rangés avec son dessous. */
export function stowedCount(instance: Pick<ComponentInstance, 'stowed'>): number {
  const load = instance.stowed
  return load ? load.components.length + load.wires.length + load.labels.length : 0
}

/** Un composant posé sans ce qu'il a rangé : une copie d'une plaque ne copie pas son dessous. */
export function withoutStowed<T extends Pick<ComponentInstance, 'stowed'>>(instance: T): T {
  if (instance.stowed === undefined) return instance
  const copy = { ...instance }
  delete copy.stowed
  return copy
}

/**
 * Des éléments menés ailleurs par une isométrie de la grille. Un pont mené par un miroir échange
 * ses bouts : il reste l'image de ce qu'il était, bombé du même côté vu dans le miroir. Ranger
 * puis remontrer se fait par deux miroirs, qui le rendent tel quel ; si la plaque s'est
 * retournée entre-temps, il revient retourné avec elle.
 */
function movedLoad(load: StowedLoad, project: Project, matrix: Matrix): StowedLoad {
  const mirror = isMirrorMatrix(matrix)
  return {
    components: load.components.map((instance) => {
      const def = instanceDefinition(project, instance)
      return def ? transformedInstance(instance, def, matrix) : instance
    }),
    wires: load.wires.map((wire) => {
      const points = wire.points.map((point) => transformedPoint(matrix, point))
      if (!mirror || wire.kind !== 'jumper') return { ...wire, points }
      return {
        ...wire,
        points: points.reverse(),
        endLabels: { start: wire.endLabels.end, end: wire.endLabels.start }
      }
    }),
    labels: load.labels.map((label) => {
      const box = transformedRect(textLabelBounds(label), matrix)
      return { ...label, x: box.x, y: box.y, w: box.width, h: box.height }
    })
  }
}

/** Du repère d'une plaque (son dessin) à la zone de son dessous sur le montage. */
function undersideMatrix(instance: ComponentInstance, def: ComponentDefinition): Matrix | null {
  const shown: ComponentInstance = { ...instance, underside: true }
  const face = boardFace(shown, def)
  return face?.bottom ? multiplyMatrices(flipMatrix(face.flip), instanceMatrix(shown, def)) : null
}

/**
 * Masque le dessous d'une plaque : ce qu'il portait (selon la règle de `boardLoad`) quitte le
 * montage et se range dans la plaque. Null si ce n'est pas une plaque qui montre son dessous.
 */
export function stowUnderside(project: Project, boardId: string): StowChange | null {
  const board = project.components.find((instance) => instance.id === boardId)
  const def = board ? instanceDefinition(project, board) : undefined
  if (!board || !def || board.underside !== true) return null
  const face = boardFace(board, def)
  const matrix = undersideMatrix(board, def)
  if (!face?.bottom || !matrix) return null
  const load = boardLoad(project, face, NOTHING_TAKEN).bottom
  const taken = {
    components: new Set(load.instances),
    wires: new Set(load.wires),
    labels: new Set(load.labels)
  }
  const stowed = movedLoad(
    {
      components: project.components.filter((instance) => taken.components.has(instance.id)),
      wires: project.wires.filter((wire) => taken.wires.has(wire.id)),
      labels: project.labels.filter((label) => taken.labels.has(label.id))
    },
    project,
    invertMatrix(matrix)
  )
  const hidden: ComponentInstance = { ...board }
  delete hidden.underside
  if (isEmptyLoad(stowed)) delete hidden.stowed
  else hidden.stowed = stowed
  return {
    components: project.components
      .filter((instance) => !taken.components.has(instance.id))
      .map((instance) => (instance.id === boardId ? hidden : instance)),
    wires: project.wires.filter((wire) => !taken.wires.has(wire.id)),
    labels: project.labels.filter((label) => !taken.labels.has(label.id))
  }
}

/**
 * Remontre le dessous d'une plaque : ce qu'elle avait rangé revient sur le montage, à la place
 * du dessous d'aujourd'hui. Un élément dont l'identifiant a été pris entre-temps en reçoit un
 * libre. Null si ce n'est pas une plaque dont le dessous est masqué.
 */
export function unstowUnderside(project: Project, boardId: string): StowChange | null {
  const board = project.components.find((instance) => instance.id === boardId)
  const def = board ? instanceDefinition(project, board) : undefined
  if (!board || !def || board.underside === true) return null
  const matrix = undersideMatrix(board, def)
  if (!matrix) return null
  const back = movedLoad(board.stowed ?? EMPTY_LOAD, project, matrix)
  const shown: ComponentInstance = { ...board, underside: true }
  delete shown.stowed

  /** Le même élément, sous un identifiant libre si le sien est pris. */
  const withFreeId = <T extends { id: string }>(entry: T, prefix: string, taken: string[]): T => {
    const id = taken.includes(entry.id) ? nextNumberedId(prefix, taken) : entry.id
    taken.push(id)
    return id === entry.id ? entry : { ...entry, id }
  }
  const instanceIds = project.components.map((instance) => instance.id)
  const wireIds = project.wires.map((wire) => wire.id)
  const labelIds = project.labels.map((label) => label.id)
  return {
    components: [
      ...project.components.map((instance) => (instance.id === boardId ? shown : instance)),
      ...back.components.map((instance) => withFreeId(instance, 'c', instanceIds))
    ],
    wires: [...project.wires, ...back.wires.map((wire) => withFreeId(wire, 'w', wireIds))],
    labels: [...project.labels, ...back.labels.map((label) => withFreeId(label, 't', labelIds))]
  }
}

/**
 * Écart donné, pour le seul calcul des liaisons, au dessous masqué d'une plaque : assez loin
 * pour que rien de ce qu'on voit ne s'y trouve.
 */
const HIDDEN_FACES_GAP = 1_000_000
/** Marque des identifiants de ce qui est rangé, dans ce même calcul : aucun élément visible ne la porte. */
const STOWED_MARK = '@rangé'

/**
 * Le montage tel qu'il est câblé, dessous masqués compris : chaque plaque qui a rangé quelque
 * chose remontre son dessous, loin de tout, avec ce qu'il portait. Le montage lui-même s'il n'y
 * a rien de rangé.
 */
function wiredProject(project: Project): Project {
  if (!project.components.some((instance) => stowedCount(instance) > 0)) return project
  const components: ComponentInstance[] = []
  const wires = [...project.wires]
  for (const instance of project.components) {
    const def = stowedCount(instance) > 0 ? instanceDefinition(project, instance) : undefined
    const far: ComponentInstance = { ...instance, facesGap: HIDDEN_FACES_GAP }
    const matrix = def && instance.underside !== true ? undersideMatrix(far, def) : null
    if (!instance.stowed || !matrix) {
      components.push(instance)
      continue
    }
    const back = movedLoad(instance.stowed, project, matrix)
    delete far.stowed
    components.push({ ...far, underside: true })
    for (const kept of back.components) components.push({ ...kept, id: kept.id + STOWED_MARK })
    for (const kept of back.wires) wires.push({ ...kept, id: kept.id + STOWED_MARK })
  }
  return { ...project, components, wires }
}

/**
 * Connectivité d'un montage (voir connectivity.ts), où ce que relie le dessous masqué d'une
 * plaque compte toujours : masquer un dessous ne dessoude rien. Seul ce qu'on voit en ressort :
 * les jonctions, raccords, bouts libres et soudures des fils visibles, les nets de ces fils et
 * des broches visibles. `pins` et `faces` : ceux du montage tel qu'on le voit, quand on les a
 * déjà.
 */
export function projectConnectivity(
  project: Project,
  pins: readonly PinRef[] = projectPins(project),
  faces: BoardFaces = boardFaces(project)
): Connectivity {
  const wired = wiredProject(project)
  if (wired === project) return computeConnectivity(project.wires, pins, faces.twins)
  const allFaces = boardFaces(wired)
  const all = computeConnectivity(wired.wires, projectPins(wired, allFaces), allFaces.twins)
  const seen = (wireId: string): boolean => !wireId.endsWith(STOWED_MARK)
  const pinKeys = new Set(pins.map((pin) => pin.key))
  return {
    junctions: all.junctions.filter((junction) => seen(junction.carrierWireId)),
    joints: all.joints.filter((joint) => joint.wireIds.every(seen)),
    freeEnds: all.freeEnds.filter((end) => seen(end.wireId)),
    solders: all.solders.filter((solder) => seen(solder.wireId)),
    wireNet: new Map([...all.wireNet].filter(([wireId]) => seen(wireId))),
    pinNet: new Map([...all.pinNet].filter(([key]) => pinKeys.has(key))),
    unconnectedPinKeys: new Set([...all.unconnectedPinKeys].filter((key) => pinKeys.has(key)))
  }
}
