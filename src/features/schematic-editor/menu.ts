import type { GridPoint } from '@/domain'

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
  target: MenuTarget
}
