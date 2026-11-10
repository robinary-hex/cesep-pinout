import type { GridPoint, LocalPoint } from '@/domain'

/** Ce que vise un clic droit sur le diagramme. */
export type DiagramMenuTarget =
  | { kind: 'node'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'empty' }

export interface DiagramMenuRequest {
  /** Position du clic à l'écran. */
  x: number
  y: number
  /** Cellule visée, pour « Coller ici ». */
  cell: GridPoint
  /** Point exact du clic, en cellules : pour savoir quel sommet ou quel segment d'un lien est visé. */
  point: LocalPoint
  target: DiagramMenuTarget
}
