// Flèches du clavier, les mêmes dans les trois éditeurs : la sélection se déplace d'un pas de
// grille ; de cinq pas avec Maj (décision du 14 novembre 2026). Le pas est celui de l'éditeur : une
// cellule dans le montage et le diagramme, un quart de cellule dans l'éditeur de composants (une
// cellule dès qu'une broche est du voyage).

/** Nombre de pas d'une flèche tenue avec Maj. */
export const SHIFT_ARROW_STEPS = 5

const DIRECTIONS: Record<string, readonly [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1]
}

/**
 * Déplacement que demande une touche fléchée, en pas de grille (x vers la droite, y vers le bas) ;
 * null pour toute autre touche.
 */
export function arrowNudge(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey'>
): readonly [number, number] | null {
  const direction = DIRECTIONS[event.key.toLowerCase()]
  if (!direction) return null
  const steps = event.shiftKey ? SHIFT_ARROW_STEPS : 1
  return [direction[0] * steps, direction[1] * steps]
}
