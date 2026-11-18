import { drawingHoles, isBoard, type ComponentDefinition } from './component'
import type { PinRef } from './connectivity'
import type { GridPoint } from './grid'
import {
  applyMatrix,
  facesFlip,
  facesGap,
  instanceBounds,
  instanceMatrix,
  showsUnderside,
  undersideBounds,
  type GridRect
} from './placement'
import { instanceDefinition, type ComponentInstance, type Project } from './project'
import { SOLDER_COLOR, SOLDER_EDGE } from './wireKinds'

// Les deux faces d'une plaque à trous (décision du 17 novembre 2026). Une plaque posée peut
// montrer son dessous à côté de son dessus : le même dessin, retourné comme une page qu'on
// tourne, à sa droite. Les composants s'enfichent dessus, les fils se soudent dessous. Rien
// n'est stocké pour cela : un fil du dessous est un fil du montage comme un autre, posé dans la
// zone du dessous. Ce qui relie les deux faces se déduit de la géométrie : les trous sont
// métallisés, donc un trou du dessus et le même trou vu de dessous sont un seul point
// électrique.

const pointKey = (point: GridPoint): string => `${point[0]},${point[1]}`

/** Une plaque posée : ses deux faces sur le montage. */
export interface BoardFace {
  /** Identifiant de la plaque posée. */
  id: string
  /** Boîte du dessus : celle de la plaque. */
  top: GridRect
  /** Boîte du dessous, à droite du dessus ; null si la plaque ne le montre pas. */
  bottom: GridRect | null
  /** Un point d'abscisse x du dessus se voit de dessous en `flip − x`, à la même hauteur. */
  flip: number
  /** Trous du dessus, en cellules du montage. */
  holes: GridPoint[]
}

/** Les faces d'un composant posé, si c'est une plaque à trous ; sinon null. */
export function boardFace(instance: ComponentInstance, def: ComponentDefinition): BoardFace | null {
  if (!isBoard(def)) return null
  const top = instanceBounds(instance, def)
  const matrix = instanceMatrix(instance, def)
  const holes = drawingHoles(def.visual.primitives).map((hole): GridPoint => {
    const at = applyMatrix(matrix, hole)
    return [Math.round(at.x), Math.round(at.y)]
  })
  const gap = facesGap(instance)
  return {
    id: instance.id,
    top,
    bottom: showsUnderside(instance, def) ? undersideBounds(top, gap) : null,
    flip: facesFlip(top, gap),
    holes
  }
}

/** Le même point vu de l'autre face : la transformation est sa propre réciproque. */
export function otherFacePoint(face: Pick<BoardFace, 'flip'>, point: GridPoint): GridPoint {
  return [face.flip - point[0], point[1]]
}

/** Le même trou sur l'autre face d'une plaque. */
export interface HoleTwin {
  /** La plaque dont c'est un trou. */
  board: string
  point: GridPoint
}

/** Les plaques du montage qui montrent leurs deux faces, et la correspondance de leurs trous. */
export interface BoardFaces {
  boards: BoardFace[]
  /** Pour chaque trou d'une face (clé « x,y »), le même trou sur l'autre face. */
  twins: ReadonlyMap<string, HoleTwin>
}

export const NO_BOARD_FACES: BoardFaces = { boards: [], twins: new Map() }

/** Les plaques à deux faces d'un montage. Sans aucune, rien n'est calculé. */
export function boardFaces(project: Pick<Project, 'components' | 'embeddedDefs'>): BoardFaces {
  if (!project.components.some((instance) => instance.underside === true)) return NO_BOARD_FACES
  const boards: BoardFace[] = []
  const twins = new Map<string, HoleTwin>()
  for (const instance of project.components) {
    if (instance.underside !== true) continue
    const def = instanceDefinition(project, instance)
    const face = def ? boardFace(instance, def) : null
    if (!face?.bottom) continue
    boards.push(face)
    for (const hole of face.holes) {
      const below = otherFacePoint(face, hole)
      twins.set(pointKey(hole), { board: face.id, point: below })
      twins.set(pointKey(below), { board: face.id, point: hole })
    }
  }
  return boards.length > 0 ? { boards, twins } : NO_BOARD_FACES
}

/** Suffixe de la clé d'une broche vue de l'autre face de la plaque où elle est enfichée. */
export const OTHER_FACE_PIN = '@verso'

/**
 * Les broches enfichées dans une plaque à deux faces, vues de l'autre face : la patte traverse
 * la plaque et se soude de l'autre côté. Chacune est la même broche (`of`) à un autre endroit :
 * un fil posé là lui est relié, et la suit quand le composant bouge.
 */
export function otherFacePins(pins: readonly PinRef[], faces: BoardFaces): PinRef[] {
  if (faces.twins.size === 0) return []
  const through: PinRef[] = []
  for (const pin of pins) {
    const twin = faces.twins.get(pointKey(pin.point))
    if (!twin) continue
    through.push({
      key: `${pin.key}${OTHER_FACE_PIN}`,
      instanceId: pin.instanceId,
      pinId: pin.pinId,
      point: twin.point,
      of: pin.key
    })
  }
  return through
}

/**
 * Marque de ce qui traverse une plaque : un point de couleur vive sur la pastille, cerné de
 * sombre, pour qu'on voie d'un coup d'œil où sont les pattes (décision du 17 novembre 2026 :
 * une goutte d'étain, de la couleur des pastilles, ne se voyait pas). C'est la marque d'une
 * broche soudée à un fil nu (`SOLDER_COLOR`) : une patte se voit pareil, soudée ou non. Son
 * rayon est en cellules ; la pastille (0,3) reste visible autour.
 */
export const THROUGH_MARK_RADIUS = 0.24
export const THROUGH_MARK_COLOR = SOLDER_COLOR
export const THROUGH_MARK_EDGE = SOLDER_EDGE
/** Épaisseur du cerne à l'export, en cellules. */
export const THROUGH_MARK_EDGE_WIDTH = 0.05

/** Ce qui traverse une plaque et se voit sur l'autre face : un point de couleur sur la pastille. */
export interface ThroughMark {
  board: string
  point: GridPoint
}

/**
 * Sur chaque face d'une plaque à deux faces, les pastilles où ressort ce qui est enfiché de
 * l'autre côté : la patte d'un composant, le bout d'un fil. C'est là qu'on soude, et la marque
 * dépasse du fil qu'on y a soudé. Une pastille
 * qui porte elle-même une broche n'est pas marquée : le composant s'y dessine.
 */
export function throughMarks(
  wires: readonly { points: readonly GridPoint[] }[],
  pins: readonly PinRef[],
  faces: BoardFaces
): ThroughMark[] {
  if (faces.twins.size === 0) return []
  const real = pins.filter((pin) => pin.of === undefined)
  const occupied = new Set(real.map((pin) => pointKey(pin.point)))
  const marks = new Map<string, ThroughMark>()
  const add = (point: GridPoint | undefined): void => {
    const twin = point ? faces.twins.get(pointKey(point)) : undefined
    if (!twin) return
    const key = pointKey(twin.point)
    if (occupied.has(key) || marks.has(key)) return
    marks.set(key, { board: twin.board, point: twin.point })
  }
  for (const pin of real) add(pin.point)
  for (const wire of wires) {
    add(wire.points[0])
    add(wire.points.at(-1))
  }
  return [...marks.values()]
}
