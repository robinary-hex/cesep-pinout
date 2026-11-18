import { OTHER_FACE_PIN } from './boardFaces'
import type { ComponentDefinition } from './component'
import { projectPins, type PinRef } from './connectivity'
import type { LocalPoint } from './grid'
import { applyMatrix, instanceMatrix } from './placement'
import { instanceBaseDefinition, type ComponentInstance, type Project } from './project'
import {
  motifCells,
  restretchedFields,
  spanCount,
  stretchAxes,
  stretchAxis,
  stretchCounts,
  stretchedDefinition,
  stretchPinMap,
  type StretchAxis,
  type StretchCounts,
  type StretchEnd
} from './stretch'

// Un composant extensible posé sur le montage : ses poignées, et ce qui change quand on l'étire.

/** Poignée d'étirement d'un composant posé : le milieu d'un de ses bouts. */
export interface StretchHandle {
  /** Le sens du dessin qu'elle étire : sa largeur, ou sa hauteur. */
  axis: StretchAxis
  end: StretchEnd
  /** Où elle est, en cellules du montage. */
  x: number
  y: number
  /** Sens, sur le montage, dans lequel la tirer allonge le composant. */
  dx: number
  dy: number
}

/**
 * Poignées d'un composant extensible posé : une à chaque bout de chaque sens où il s'étire (à
 * gauche et à droite du dessin, en haut et en bas), rotation et miroir compris. `def` est le
 * composant tel qu'il est dessiné là, étiré. Aucune s'il n'est pas extensible.
 */
export function stretchHandles(
  instance: ComponentInstance,
  def: ComponentDefinition
): StretchHandle[] {
  const matrix = instanceMatrix(instance, def)
  const { widthCells, heightCells } = def.size
  // Le sens opposé, sans zéro négatif.
  const back = (value: number): number => (value === 0 ? 0 : -value)
  return stretchAxes(def.stretch).flatMap((axis): StretchHandle[] => {
    const vertical = axis === 'y'
    // Le milieu de chaque bout : à mi-hauteur pour la largeur, à mi-largeur pour la hauteur.
    const at = (along: number): LocalPoint =>
      applyMatrix(
        matrix,
        vertical ? { x: widthCells / 2, y: along } : { x: along, y: heightCells / 2 }
      )
    const start = at(0)
    const end = at(vertical ? heightCells : widthCells)
    // Sens du dessin (de son début vers sa fin) sur le montage : un vecteur unité, à
    // l'horizontale ou à la verticale.
    const dx = Math.sign(end.x - start.x)
    const dy = Math.sign(end.y - start.y)
    return [
      { axis, end: 'start', x: start.x, y: start.y, dx: back(dx), dy: back(dy) },
      { axis, end: 'end', x: end.x, y: end.y, dx, dy }
    ]
  })
}

/**
 * Nombre de motifs d'un composant dont on tire une poignée de `pulled` cellules dans son sens
 * (`axis` ; sans lui, son premier sens) : un motif de plus à chaque taille de motif, entre les
 * bornes du composant.
 */
export function pulledCount(
  def: ComponentDefinition,
  original: number,
  pulled: number,
  axis: StretchAxis = stretchAxis(def.stretch)
): number {
  const span = def.stretch?.[axis]
  if (!span) return 1
  return spanCount(span, original + Math.round(pulled / motifCells(span)))
}

/** Ce que change l'étirement d'un composant posé. */
export interface Restretch {
  /**
   * L'exemplaire après : ses nombres de motifs, sa place (le bout fixe n'a pas bougé) et les
   * valeurs de ses champs (celles des motifs suivent leur motif).
   */
  instance: ComponentInstance
  /**
   * Broches de tout le montage avant, celles de l'exemplaire nommées comme elles le seront
   * après : une extrémité de fil posée sur l'une d'elles la suit. Celles qui disparaissent n'y
   * sont plus.
   */
  pinsBefore: PinRef[]
  pinsAfter: PinRef[]
}

/** Nombres de motifs d'un composant posé, dans chaque sens ; 1 là où il ne s'étire pas. */
export function instanceCounts(project: Project, instance: ComponentInstance): StretchCounts {
  const base = instanceBaseDefinition(project, instance)
  return base ? stretchCounts(base, { x: instance.countX, y: instance.countY }) : { x: 1, y: 1 }
}

/** Nombre de motifs d'un composant posé dans son premier sens ; 1 s'il n'est pas extensible. */
export function instanceCount(project: Project, instance: ComponentInstance): number {
  const base = instanceBaseDefinition(project, instance)
  return base ? instanceCounts(project, instance)[stretchAxis(base.stretch)] : 1
}

/**
 * Étire un composant posé à `count` motifs dans un sens (`axis` ; sans lui, son premier sens),
 * en gardant en place son début (`fixed` : 'start') ou sa fin. Retourne l'exemplaire qui en
 * résulte et la correspondance des broches, pour que les fils suivent (`wiresFollowingPins`) ;
 * null si rien ne change : composant introuvable ou pas extensible dans ce sens, nombre déjà
 * atteint ou hors de ses bornes.
 */
export function restretch(
  project: Project,
  instanceId: string,
  count: number,
  fixed: StretchEnd,
  axis?: StretchAxis
): Restretch | null {
  const instance = project.components.find((candidate) => candidate.id === instanceId)
  const base = instance ? instanceBaseDefinition(project, instance) : undefined
  const along = axis ?? stretchAxis(base?.stretch)
  const span = base?.stretch?.[along]
  if (!instance || !base?.stretch || !span) return null
  const before = stretchCounts(base, { x: instance.countX, y: instance.countY })
  const after: StretchCounts = { ...before, [along]: spanCount(span, count) }
  if (before[along] === after[along]) return null
  const defBefore = stretchedDefinition(base, before)
  const defAfter = stretchedDefinition(base, after)
  // Le bout qui reste en place : le même point du montage avant et après.
  const anchor = (def: ComponentDefinition): LocalPoint =>
    fixed === 'start'
      ? { x: 0, y: 0 }
      : along === 'y'
        ? { x: 0, y: def.size.heightCells }
        : { x: def.size.widthCells, y: 0 }
  // Les valeurs des textes variables suivent leur texte, comme les fils suivent les broches.
  const fields = restretchedFields(base, instance.fields, before, after, fixed, along)
  const stretched: ComponentInstance = {
    ...instance,
    ...(base.stretch.x ? { countX: after.x } : {}),
    ...(base.stretch.y ? { countY: after.y } : {}),
    ...(fields === instance.fields ? {} : { fields: { ...fields } })
  }
  const from = applyMatrix(instanceMatrix(instance, defBefore), anchor(defBefore))
  const to = applyMatrix(instanceMatrix(stretched, defAfter), anchor(defAfter))
  const moved: ComponentInstance = {
    ...stretched,
    x: instance.x + from.x - to.x,
    y: instance.y + from.y - to.y
  }
  const next: Project = {
    ...project,
    components: project.components.map((candidate) =>
      candidate.id === instanceId ? moved : candidate
    )
  }
  const names = stretchPinMap(base, before, after, fixed, along)
  const pinsBefore = projectPins(project).flatMap((pin): PinRef[] => {
    if (pin.instanceId !== instanceId) return [pin]
    const pinId = names.get(pin.pinId)
    if (pinId === undefined) return []
    const key = `${instanceId}:${pinId}`
    // Enfichée dans une plaque à deux faces, la broche est là aussi vue de l'autre face.
    return [
      pin.of === undefined
        ? { ...pin, pinId, key }
        : { ...pin, pinId, key: `${key}${OTHER_FACE_PIN}`, of: key }
    ]
  })
  return { instance: moved, pinsBefore, pinsAfter: projectPins(next) }
}
