import type { PaletteColor } from './settings'

// Couleurs proposées par la palette d'une barre d'outils : celles de l'application (paramètres,
// communes à tous les documents), puis celles que le document garde pour lui (`customColors`).
// Un clic droit sur une pastille la modifie ou la supprime (décision du 17 novembre 2026) : ce
// fichier dit ce que deviennent alors les deux listes, sans rien savoir de qui les enregistre.

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

/** Ce que devient l'une des deux listes quand on y modifie ou qu'on y supprime une couleur. */
export type PaletteEdit =
  { list: 'custom'; colors: string[] } | { list: 'app'; colors: PaletteColor[] }

/**
 * Remplace la couleur `hex` par `next`, là où elle se trouve : dans les couleurs du document,
 * sinon dans la palette de l'application, qui garde son nom. Null si rien n'est à faire : couleur
 * inconnue, inchangée, ou `next` déjà proposée.
 */
export function recoloredChoice(
  app: readonly PaletteColor[],
  custom: readonly string[],
  hex: string,
  next: string
): PaletteEdit | null {
  if (sameColor(hex, next)) return null
  if (paletteChoices(app, custom).some((choice) => sameColor(choice.hex, next))) return null
  if (custom.some((color) => sameColor(color, hex))) {
    return { list: 'custom', colors: custom.map((color) => (sameColor(color, hex) ? next : color)) }
  }
  if (app.some((color) => sameColor(color.hex, hex))) {
    return {
      list: 'app',
      colors: app.map((color) => (sameColor(color.hex, hex) ? { ...color, hex: next } : color))
    }
  }
  return null
}

/**
 * Retire la couleur `hex` de la liste où elle se trouve. Null si elle est inconnue, ou si c'est
 * la dernière de la palette de l'application : une palette garde au moins une couleur.
 */
export function removedChoice(
  app: readonly PaletteColor[],
  custom: readonly string[],
  hex: string
): PaletteEdit | null {
  if (custom.some((color) => sameColor(color, hex))) {
    return { list: 'custom', colors: custom.filter((color) => !sameColor(color, hex)) }
  }
  if (app.length > 1 && app.some((color) => sameColor(color.hex, hex))) {
    return { list: 'app', colors: app.filter((color) => !sameColor(color.hex, hex)) }
  }
  return null
}
