import type { GridPoint, LocalPoint } from '@/domain'

/** Ce que vise un clic droit sur le canevas du montage. */
export type MenuTarget =
  | { kind: 'instance'; id: string }
  | { kind: 'wire'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'empty' }

/** Demande d'ouverture du menu contextuel : position d'écran, cellule visée, cible. */
export interface MenuRequest {
  x: number
  y: number
  cell: GridPoint
  /** Point exact du clic, en cellules : pour savoir quel sommet ou quel segment d'un fil est visé. */
  point: LocalPoint
  target: MenuTarget
}
