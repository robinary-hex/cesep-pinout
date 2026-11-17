import type { ComponentDefinition } from './component'
import { projectPins, type PinRef } from './connectivity'
import type { LocalPoint } from './grid'
import { applyMatrix, instanceMatrix } from './placement'
import {
  instanceBaseDefinition,
  instanceDefinition,
  type ComponentInstance,
  type Project
} from './project'
import {
  motifCells,
  restretchedFields,
  stretchAxis,
  stretchCount,
  stretchedDefinition,
  stretchPinMap,
  type StretchEnd
} from './stretch'

// Un composant extensible posé sur le montage : ses poignées, et ce qui change quand on l'étire.

/** Poignée d'étirement d'un composant posé : le milieu d'un de ses deux bouts. */
export interface StretchHandle {
  end: StretchEnd
  /** Où elle est, en cellules du montage. */
  x: number
  y: number
  /** Sens, sur le montage, dans lequel la tirer allonge le composant. */
  dx: number
  dy: number
}

/**
 * Poignées d'un composant extensible posé, une à chaque bout du sens où il s'étire (à gauche et
 * à droite du dessin, ou en haut et en bas), rotation et miroir compris. `def` est le composant
 * tel qu'il est dessiné là, étiré. Aucune s'il n'est pas extensible.
 */
export function stretchHandles(
  instance: ComponentInstance,
  def: ComponentDefinition
): StretchHandle[] {
  if (!def.stretch) return []
  const matrix = instanceMatrix(instance, def)
  const { widthCells, heightCells } = def.size
  const vertical = stretchAxis(def.stretch) === 'y'
  // Le milieu de chaque bout : à mi-hauteur pour un dessin qui s'étire en largeur, à mi-largeur
  // pour un dessin qui s'étire en hauteur.
  const at = (along: number): LocalPoint =>
    applyMatrix(
      matrix,
      vertical ? { x: widthCells / 2, y: along } : { x: along, y: heightCells / 2 }
    )
  const start = at(0)
  const end = at(vertical ? heightCells : widthCells)
  // Sens du dessin (de son début vers sa fin) sur le montage : un vecteur unité, à l'horizontale
  // ou à la verticale.
  const dx = Math.sign(end.x - start.x)
  const dy = Math.sign(end.y - start.y)
  // Le sens opposé, sans zéro négatif.
  const back = (value: number): number => (value === 0 ? 0 : -value)
  return [
    { end: 'start', x: start.x, y: start.y, dx: back(dx), dy: back(dy) },
    { end: 'end', x: end.x, y: end.y, dx, dy }
  ]
}

/**
 * Nombre de motifs d'un composant dont on tire une poignée de `pulled` cellules dans son sens :
 * un motif de plus à chaque largeur de motif, entre les bornes du composant.
 */
export function pulledCount(def: ComponentDefinition, original: number, pulled: number): number {
  const stretch = def.stretch
  if (!stretch) return 1
  return stretchCount(def, original + Math.round(pulled / motifCells(stretch)))
}

/** Ce que change l'étirement d'un composant posé. */
export interface Restretch {
  /**
   * L'exemplaire après : son nombre de motifs, sa place (le bout fixe n'a pas bougé) et les
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

/**
 * Étire un composant posé à `count` motifs, en gardant en place son début (`fixed` : 'start') ou
 * sa fin. Retourne l'exemplaire qui en résulte et la correspondance des broches, pour que les
 * fils suivent (`wiresFollowingPins`) ; null si rien ne change : composant introuvable ou pas
 * extensible, nombre déjà atteint ou hors de ses bornes.
 */
export function restretch(
  project: Project,
  instanceId: string,
  count: number,
  fixed: StretchEnd
): Restretch | null {
  const instance = project.components.find((candidate) => candidate.id === instanceId)
  const base = instance ? instanceBaseDefinition(project, instance) : undefined
  if (!instance || !base?.stretch) return null
  const before = stretchCount(base, instance.count)
  const after = stretchCount(base, count)
  if (before === after) return null
  const defBefore = stretchedDefinition(base, before)
  const defAfter = stretchedDefinition(base, after)
  // Le bout qui reste en place : le même point du montage avant et après.
  const vertical = stretchAxis(base.stretch) === 'y'
  const anchor = (def: ComponentDefinition): LocalPoint =>
    fixed === 'start'
      ? { x: 0, y: 0 }
      : vertical
        ? { x: 0, y: def.size.heightCells }
        : { x: def.size.widthCells, y: 0 }
  // Les valeurs des textes variables du motif suivent leur motif, comme les broches.
  const fields = restretchedFields(base, instance.fields, before, after, fixed)
  const stretched: ComponentInstance = {
    ...instance,
    count: after,
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
  const names = stretchPinMap(base, before, after, fixed)
  const pinsBefore = projectPins(project).flatMap((pin): PinRef[] => {
    if (pin.instanceId !== instanceId) return [pin]
    const pinId = names.get(pin.pinId)
    return pinId === undefined ? [] : [{ ...pin, pinId, key: `${instanceId}:${pinId}` }]
  })
  return { instance: moved, pinsBefore, pinsAfter: projectPins(next) }
}

/** Nombre de motifs d'un composant posé ; 1 s'il n'est pas extensible. */
export function instanceCount(project: Project, instance: ComponentInstance): number {
  const def = instanceDefinition(project, instance)
  return def ? stretchCount(def, instance.count) : 1
}
