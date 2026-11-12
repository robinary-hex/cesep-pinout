import type { Junction } from './connectivity'
import type { GridPoint } from './grid'
import { profileDifferences, type StyleProfile } from './profile'
import type { Project } from './project'

// Styles propres (décision du 12 novembre 2026) : dans un même montage, une partie des éléments
// peut se dessiner avec un autre profil de style que celui du montage. Un élément (composant
// posé, fil, étiquette) désigne alors par son nom un des `styles` du montage, copie d'un profil
// enregistré ; sans `style`, il suit le style du montage. D'un style propre tout sert (traits,
// coins, jonctions, polices) sauf la taille de cellule : la grille est commune à tout le montage.

/** Élément du montage qui peut avoir son style : composant posé, fil ou étiquette. */
export interface Styled {
  style?: string | undefined
}

/** Les styles d'un montage, prêts pour le dessin. */
export interface StyleSheet {
  /** Le style du montage : celui de tout élément qui n'a pas le sien. */
  base: StyleProfile
  /** Les styles propres, par nom, ramenés à la cellule du montage. */
  named: ReadonlyMap<string, StyleProfile>
}

/**
 * Feuille de styles d'un montage. Chaque style propre y prend la taille de cellule du montage :
 * les formules du dessin (police en points / cellule) valent alors pour tous les éléments.
 */
export function styleSheet(base: StyleProfile, styles: readonly StyleProfile[]): StyleSheet {
  return {
    base,
    named: new Map(
      styles.map((style) => [
        style.name,
        style.cellPx === base.cellPx ? style : { ...style, cellPx: base.cellPx }
      ])
    )
  }
}

export function projectStyleSheet(project: Pick<Project, 'profile' | 'styles'>): StyleSheet {
  return styleSheet(project.profile, project.styles)
}

/** Le style avec lequel un élément se dessine : le sien, sinon celui du montage. */
export function styleOf(sheet: StyleSheet, element: Styled): StyleProfile {
  if (element.style === undefined) return sheet.base
  return sheet.named.get(element.style) ?? sheet.base
}

/**
 * Deux profils donnent-ils le même dessin à un élément ? Ni le nom ni la taille de cellule, qui
 * reste celle du montage, ne comptent.
 */
export function sameLook(a: StyleProfile, b: StyleProfile): boolean {
  return profileDifferences(a, b).every((fact) => fact === 'name' || fact === 'cell')
}

/** Le même élément avec ce style, ou sans style propre (la propriété disparaît). */
export function withStyle<T extends Styled>(element: T, style: string | undefined): T {
  const copy = { ...element }
  if (style === undefined) delete copy.style
  else copy.style = style
  return copy
}

type StyledContent = Pick<Project, 'components' | 'wires' | 'labels'>

function styledElements(project: StyledContent): readonly Styled[] {
  return [...project.components, ...project.wires, ...project.labels]
}

/** Nombre d'éléments qui portent chaque style propre, par nom. */
export function styleCounts(project: StyledContent): Map<string, number> {
  const counts = new Map<string, number>()
  for (const element of styledElements(project)) {
    if (element.style === undefined) continue
    counts.set(element.style, (counts.get(element.style) ?? 0) + 1)
  }
  return counts
}

/**
 * Les styles du montage qui servent encore à un élément ; la liste elle-même s'ils servent tous.
 * Un style que plus rien ne porte n'a pas à rester dans le fichier.
 */
export function prunedStyles(
  project: StyledContent & Pick<Project, 'styles'>
): readonly StyleProfile[] {
  if (project.styles.length === 0) return project.styles
  const used = styleCounts(project)
  const kept = project.styles.filter((style) => used.has(style.name))
  return kept.length === project.styles.length ? project.styles : kept
}

/**
 * Taille d'une étiquette qui passe d'un style à un autre : elle garde son rapport à la police
 * des libellés (une étiquette ×1 reste ×1), puisque ses tailles se choisissent en multiples de
 * cette police.
 */
export function restyledLabelSize(size: number, from: StyleProfile, to: StyleProfile): number {
  if (from.labelFont.size === to.labelFont.size) return size
  return Math.round(((size * to.labelFont.size) / from.labelFont.size) * 1000) / 1000
}

/** Ce qu'il faut d'un fil pour dessiner ses jonctions. */
export interface JunctionWire extends Styled {
  id: string
  color: string
  points: readonly GridPoint[]
}

/**
 * Point d'une jonction quand les fils n'ont pas tous le même style : son rayon est le plus grand
 * que demandent les fils qui s'y rejoignent (le fil porteur et ceux dont un bout est là), pour
 * rester visible sur le plus épais ; sa couleur suit le style du fil porteur.
 */
export function junctionDot(
  junction: Junction,
  wires: readonly JunctionWire[],
  sheet: StyleSheet
): { radius: number; color: string } {
  const [x, y] = junction.point
  const here = (point: GridPoint | undefined): boolean =>
    point !== undefined && point[0] === x && point[1] === y
  const carrier = wires.find((wire) => wire.id === junction.carrierWireId)
  const carrierStyle = carrier ? styleOf(sheet, carrier) : sheet.base
  let radius = (carrierStyle.wireWidth * carrierStyle.junctionScale) / 2
  for (const wire of wires) {
    if (wire === carrier || !(here(wire.points[0]) || here(wire.points.at(-1)))) continue
    const style = styleOf(sheet, wire)
    radius = Math.max(radius, (style.wireWidth * style.junctionScale) / 2)
  }
  const color =
    carrierStyle.junctionColor === 'wire'
      ? (carrier?.color ?? '#000000')
      : carrierStyle.junctionColor
  return { radius, color }
}
