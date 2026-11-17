import { boardFace, otherFacePoint, type BoardFace } from './boardFaces'
import { isBoard } from './component'
import type { GridPoint } from './grid'
import type { Box } from './handles'
import {
  IDENTITY_MATRIX,
  instanceBounds,
  instanceMatrix,
  invertMatrix,
  isIdentityMatrix,
  multiplyMatrices,
  rectContainsPoint,
  rectContainsRect,
  textLabelBounds,
  transformedInstance,
  transformedPoint,
  transformedRect,
  type GridRect,
  type Matrix
} from './placement'
import {
  absolutePinPosition,
  instanceDefinition,
  type ComponentInstance,
  type Project
} from './project'

// Une plaque à trous emmène ce qu'elle porte (décision du 17 novembre 2026) : déplacée, tournée
// ou retournée, elle emporte les composants enfichés dans ses trous, les fils soudés sur ses deux
// faces et les étiquettes posées sur elle, sans qu'il faille les sélectionner. Rien n'est stocké :
// ce qu'une plaque porte se lit sur le montage au moment où elle bouge.

const pointKey = (point: GridPoint): string => `${point[0]},${point[1]}`

/** Ce qu'une face d'une plaque porte. */
export interface FaceLoad {
  instances: string[]
  /** Fils posés en entier sur la face : ils la suivent d'un bloc. */
  wires: string[]
  labels: string[]
  /**
   * Bouts de fil soudés à un trou de la face, le reste du fil allant ailleurs : le bout suit son
   * trou, le fil s'étire comme s'il tenait à une broche.
   */
  ends: GridPoint[]
}

/** Ce qu'une plaque porte, face par face. */
export interface BoardLoad {
  top: FaceLoad
  bottom: FaceLoad
}

/** Éléments qui bougent déjà d'eux-mêmes : une plaque ne les emmène pas une seconde fois. */
export interface TakenElements {
  instances: ReadonlySet<string>
  wires: ReadonlySet<string>
  labels: ReadonlySet<string>
}

const emptyLoad = (): FaceLoad => ({ instances: [], wires: [], labels: [], ends: [] })

/**
 * Ce que porte une plaque posée. Un composant est porté s'il a une broche dans un de ses trous,
 * ou s'il est posé en entier sur elle ; un fil, si tous ses sommets sont sur elle ; une
 * étiquette, si sa boîte y tient. Le bout d'un fil qui va ailleurs suit le trou où il est soudé.
 * Vaut pour chaque face : le dessous, quand la plaque le montre, porte ses fils de la même façon.
 */
export function boardLoad(project: Project, face: BoardFace, taken: TakenElements): BoardLoad {
  const load: BoardLoad = { top: emptyLoad(), bottom: emptyLoad() }
  const sides: { zone: GridRect; holes: Set<string>; load: FaceLoad }[] = [
    { zone: face.top, holes: new Set(face.holes.map(pointKey)), load: load.top }
  ]
  if (face.bottom) {
    sides.push({
      zone: face.bottom,
      holes: new Set(face.holes.map((hole) => pointKey(otherFacePoint(face, hole)))),
      load: load.bottom
    })
  }

  for (const instance of project.components) {
    if (instance.id === face.id || taken.instances.has(instance.id)) continue
    const def = instanceDefinition(project, instance)
    if (!def) continue
    const box = instanceBounds(instance, def)
    const pins = def.pins.map((pin) => {
      const at = absolutePinPosition(instance, def, pin)
      return `${at.x},${at.y}`
    })
    const side = sides.find(
      (candidate) =>
        rectContainsRect(candidate.zone, box) || pins.some((pin) => candidate.holes.has(pin))
    )
    if (side) side.load.instances.push(instance.id)
  }

  for (const wire of project.wires) {
    if (taken.wires.has(wire.id)) continue
    const whole = sides.find((candidate) =>
      wire.points.every((point) => rectContainsPoint(candidate.zone, point[0], point[1]))
    )
    if (whole) {
      whole.load.wires.push(wire.id)
      continue
    }
    for (const end of [wire.points[0], wire.points.at(-1)]) {
      if (!end) continue
      const side = sides.find((candidate) => candidate.holes.has(pointKey(end)))
      if (side) side.load.ends.push(end)
    }
  }

  for (const label of project.labels) {
    if (taken.labels.has(label.id)) continue
    const box = textLabelBounds(label)
    const side = sides.find((candidate) => rectContainsRect(candidate.zone, box))
    if (side) side.load.labels.push(label.id)
  }
  return load
}

/**
 * Tout ce que porteraient les plaques d'un ensemble de composants qu'on déplace, faces
 * confondues : pour un déplacement, le dessus et le dessous suivent du même vecteur.
 */
export function loadOfBoards(project: Project, moving: TakenElements): FaceLoad {
  const merged = emptyLoad()
  const taken = {
    instances: new Set(moving.instances),
    wires: new Set(moving.wires),
    labels: new Set(moving.labels)
  }
  for (const instance of project.components) {
    if (!moving.instances.has(instance.id)) continue
    const def = instanceDefinition(project, instance)
    const face = def ? boardFace(instance, def) : null
    if (!face) continue
    const load = boardLoad(project, face, taken)
    for (const part of [load.top, load.bottom]) {
      merged.instances.push(...part.instances)
      merged.wires.push(...part.wires)
      merged.labels.push(...part.labels)
      merged.ends.push(...part.ends)
      for (const id of part.instances) taken.instances.add(id)
      for (const id of part.wires) taken.wires.add(id)
      for (const id of part.labels) taken.labels.add(id)
    }
  }
  return merged
}

/** Ce que des plaques emmènent, à sa nouvelle place. */
export interface Carried {
  instances: Map<string, ComponentInstance>
  wires: Map<string, GridPoint[]>
  labels: Map<string, Box>
  /** Bouts de fil soudés à un trou d'une plaque : d'où ils partent, où ils arrivent. */
  ends: { from: GridPoint; to: GridPoint }[]
}

/** Le miroir d'une face à l'autre, en matrice : x devient `flip − x`. */
function flipMatrix(flip: number): Matrix {
  return { a: -1, b: 0, c: 0, d: 1, e: flip, f: 0 }
}

function samePlace(a: ComponentInstance, b: ComponentInstance): boolean {
  return a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.mirror === b.mirror
}

/**
 * Ce qu'emmènent les plaques qu'une commande vient de bouger. `before` est le montage avant,
 * `after` le même où la commande a fait son œuvre (composants déplacés, tournés, retournés,
 * étirés), sans s'occuper de ce que les plaques portent ; `translated` nomme les fils que la
 * commande déplace elle-même. Une plaque déplacée, tournée ou retournée emmène sa charge par la
 * même transformation, celle du dessous par la transformation vue de dessous. Une plaque
 * étirée laisse en place ce qu'elle porte dessus ; son dessous, qui s'éloigne ou se rapproche
 * avec son bord, emmène ses fils. Null si aucune plaque n'a bougé.
 */
export function boardsCarry(
  before: Project,
  after: Project,
  translated: ReadonlySet<string> = new Set()
): Carried | null {
  if (before.components === after.components) return null
  const next = new Map(after.components.map((instance) => [instance.id, instance]))
  /** Ce que la commande a bougé elle-même. */
  const taken = {
    instances: new Set<string>(),
    wires: new Set(translated),
    labels: new Set<string>()
  }
  for (const instance of before.components) {
    if (next.get(instance.id) !== instance) taken.instances.add(instance.id)
  }
  const labelsAfter = new Map(after.labels.map((label) => [label.id, label]))
  for (const label of before.labels) {
    if (labelsAfter.get(label.id) !== label) taken.labels.add(label.id)
  }

  const moves: { from: BoardFace; to: BoardFace; motion: Matrix }[] = []
  for (const instance of before.components) {
    const moved = next.get(instance.id)
    if (!moved || moved === instance) continue
    const defBefore = instanceDefinition(before, instance)
    const defAfter = instanceDefinition(after, moved)
    if (!defBefore || !defAfter || !isBoard(defBefore) || !isBoard(defAfter)) continue
    const from = boardFace(instance, defBefore)
    const to = boardFace(moved, defAfter)
    if (!from || !to) continue
    let motion: Matrix
    if (defBefore === defAfter) {
      if (samePlace(instance, moved)) continue
      motion = multiplyMatrices(
        instanceMatrix(moved, defAfter),
        invertMatrix(instanceMatrix(instance, defBefore))
      )
    } else if (
      instance.defId === moved.defId &&
      instance.variant === moved.variant &&
      instance.count !== moved.count
    ) {
      // Étirée : ce qu'elle porte dessus reste où il est.
      if (!from.bottom || !to.bottom || from.flip === to.flip) continue
      motion = IDENTITY_MATRIX
    } else {
      continue
    }
    moves.push({ from, to, motion })
  }
  if (moves.length === 0) return null

  const carried: Carried = {
    instances: new Map(),
    wires: new Map(),
    labels: new Map(),
    ends: []
  }
  const instances = new Map(before.components.map((instance) => [instance.id, instance]))
  const wires = new Map(before.wires.map((wire) => [wire.id, wire]))
  const labels = new Map(before.labels.map((label) => [label.id, label]))

  for (const { from, to, motion } of moves) {
    const load = boardLoad(before, from, taken)
    const sides: { load: FaceLoad; matrix: Matrix | null }[] = [
      // Une plaque étirée ne bouge pas ce qu'elle porte dessus.
      { load: load.top, matrix: isIdentityMatrix(motion) ? null : motion },
      {
        load: load.bottom,
        // Vue de dessous : on repasse dessus, on bouge, on retourne.
        matrix: to.bottom
          ? multiplyMatrices(flipMatrix(to.flip), multiplyMatrices(motion, flipMatrix(from.flip)))
          : null
      }
    ]
    for (const { load: part, matrix } of sides) {
      if (!matrix) continue
      for (const id of part.instances) {
        const instance = instances.get(id)
        const def = instance ? instanceDefinition(before, instance) : undefined
        if (!instance || !def) continue
        carried.instances.set(id, transformedInstance(instance, def, matrix))
        taken.instances.add(id)
      }
      for (const id of part.wires) {
        const wire = wires.get(id)
        if (!wire) continue
        carried.wires.set(
          id,
          wire.points.map((point) => transformedPoint(matrix, point))
        )
        taken.wires.add(id)
      }
      for (const id of part.labels) {
        const label = labels.get(id)
        if (!label) continue
        const box = transformedRect(textLabelBounds(label), matrix)
        carried.labels.set(id, { x: box.x, y: box.y, w: box.width, h: box.height })
        taken.labels.add(id)
      }
      for (const end of part.ends) {
        carried.ends.push({ from: end, to: transformedPoint(matrix, end) })
      }
    }
  }
  return carried
}
