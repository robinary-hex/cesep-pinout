/** Ce que vise un clic droit dans l'éditeur de composants. */
export type EditorMenuTarget =
  { kind: 'primitive'; index: number } | { kind: 'pin'; id: string } | { kind: 'empty' }

/** Demande d'ouverture du menu contextuel : position d'écran, point visé, cible. */
export interface EditorMenuRequest {
  x: number
  y: number
  /** Point visé sur la feuille, en quarts de cellule, pour « Coller ici ». */
  point: { x: number; y: number }
  target: EditorMenuTarget
}
