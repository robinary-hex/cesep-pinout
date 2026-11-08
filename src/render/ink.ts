/**
 * Couleur d'affichage à l'écran : le noir pur des composants et des fils devient l'encre du
 * thème (`--ink`, blanc cassé en sombre) ; les autres couleurs restent telles quelles.
 * L'export n'en tient pas compte : il garde les couleurs du document.
 */
export function screenColor(hex: string): string {
  return hex.toLowerCase() === '#000000' ? 'var(--ink)' : hex
}
