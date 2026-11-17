import type { PaletteColor } from './settings'

// Couleurs proposées par la palette d'une barre d'outils : celles de l'application (paramètres,
// communes à tous les documents), puis celles que le document garde pour lui (`customColors`).
// Un clic droit sur une couleur du document la modifie ou la supprime (décision du 17 novembre
// 2026) ; celles de l'application ne se règlent que dans les paramètres. Ce fichier dit ce que
// devient alors la liste du document, sans rien savoir de qui l'enregistre.

/** Une couleur proposée : son code, son nom, et d'où elle vient. */
export interface ColorChoice {
  hex: string
  name: string
  /** Couleur propre au document, et non de la palette de l'application. */
  custom: boolean
}

/** Deux codes de couleur désignent-ils la même ? La casse ne compte pas. */
export function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Les couleurs proposées : la palette de l'application, puis celles du document. */
export function paletteChoices(
  app: readonly PaletteColor[],
  custom: readonly string[]
): ColorChoice[] {
  return [
    ...app.map((color) => ({ hex: color.hex, name: color.name, custom: false })),
    ...custom.map((hex) => ({ hex, name: hex, custom: true }))
  ]
}

/**
 * Cette couleur est-elle la première de celles du document, après celles de l'application ?
 * C'est devant elle que les palettes tracent leur séparation (décision du 17 novembre 2026).
 */
export function startsDocumentColors(
  choices: readonly { custom?: boolean }[],
  index: number
): boolean {
  return index > 0 && choices[index]?.custom === true && choices[index - 1]?.custom !== true
}

/**
 * Les couleurs du document après avoir remplacé `hex` par `next`, à la même place. Null si rien
 * n'est à faire : `hex` n'est pas une couleur du document (celles de l'application ne se
 * modifient pas d'ici), elle est inchangée, ou `next` est déjà proposée.
 */
export function recoloredCustom(
  app: readonly PaletteColor[],
  custom: readonly string[],
  hex: string,
  next: string
): string[] | null {
  if (sameColor(hex, next)) return null
  if (!custom.some((color) => sameColor(color, hex))) return null
  if (paletteChoices(app, custom).some((choice) => sameColor(choice.hex, next))) return null
  return custom.map((color) => (sameColor(color, hex) ? next : color))
}

/**
 * Les couleurs du document sans `hex`. Null si ce n'en est pas une : une couleur de
 * l'application ne se supprime pas d'ici.
 */
export function removedCustom(custom: readonly string[], hex: string): string[] | null {
  if (!custom.some((color) => sameColor(color, hex))) return null
  return custom.filter((color) => !sameColor(color, hex))
}
