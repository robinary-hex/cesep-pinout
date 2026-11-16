import type { Diagram, DiagramLink, DiagramNode, NodeShape } from './diagram'
import type { TextLabel } from './project'

// Copie de style d'un diagramme (décision du 16 novembre 2026) : l'allure d'un élément, donnée à
// d'autres du même type. Une forme ne donne la sienne qu'aux formes de la même espèce (une action
// à des actions, jamais à un rectangle) ; un lien aux liens, un texte libre aux textes. On copie
// ce qui fait l'allure, pas ce qui fait l'élément : ni son texte, ni sa place, ni sa taille.

/** Ce qu'une forme donne : couleur, fond, bordure, et le style de son texte. */
export const NODE_LOOK_KEYS = [
  'color',
  'fill',
  'borderColor',
  'font',
  'bold',
  'italic',
  'underline',
  'strike',
  'textSize',
  'textColor'
] as const satisfies readonly (keyof DiagramNode)[]

/** Ce qu'un lien donne : couleur, trait, pointes, fond de son étiquette. */
export const LINK_LOOK_KEYS = [
  'color',
  'dash',
  'startArrow',
  'endArrow',
  'labelBackground'
] as const satisfies readonly (keyof DiagramLink)[]

/** Ce qu'un texte libre donne : taille, style, couleur, fond, alignement ; pas son sens. */
export const TEXT_LOOK_KEYS = [
  'size',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'anchor'
] as const satisfies readonly (keyof TextLabel)[]

export type NodeLook = Pick<DiagramNode, (typeof NODE_LOOK_KEYS)[number]>
export type LinkLook = Pick<DiagramLink, (typeof LINK_LOOK_KEYS)[number]>
export type TextLook = Pick<TextLabel, (typeof TEXT_LOOK_KEYS)[number]>

/** Un élément du diagramme, désigné par son genre et son identifiant. */
export interface StyleElement {
  kind: 'node' | 'link' | 'text'
  id: string
}

/** L'allure copiée d'un élément, et de quel type il est : elle ne va qu'à ce type. */
export type CopiedStyle =
  | { kind: 'node'; shape: NodeShape; look: NodeLook }
  | { kind: 'link'; look: LinkLook }
  | { kind: 'text'; look: TextLook }

function pick<T, K extends keyof T>(from: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>
  for (const key of keys) out[key] = from[key]
  return out
}

function hasLook<T, K extends keyof T>(element: T, look: Pick<T, K>, keys: readonly K[]): boolean {
  return keys.every((key) => element[key] === look[key])
}

/** L'allure d'un élément du diagramme, à donner à d'autres ; null s'il n'existe pas. */
export function copiedStyle(diagram: Diagram, source: StyleElement): CopiedStyle | null {
  if (source.kind === 'node') {
    const node = diagram.nodes.find((candidate) => candidate.id === source.id)
    return node ? { kind: 'node', shape: node.shape, look: pick(node, NODE_LOOK_KEYS) } : null
  }
  if (source.kind === 'link') {
    const link = diagram.links.find((candidate) => candidate.id === source.id)
    return link ? { kind: 'link', look: pick(link, LINK_LOOK_KEYS) } : null
  }
  const text = diagram.texts.find((candidate) => candidate.id === source.id)
  return text ? { kind: 'text', look: pick(text, TEXT_LOOK_KEYS) } : null
}

/**
 * Les éléments du type d'un style copié, par leur identifiant : toutes les formes de la même
 * espèce, tous les liens, ou tous les textes libres. C'est à eux seuls que le style peut aller.
 */
export function sameTypeIds(diagram: Diagram, copied: CopiedStyle): string[] {
  if (copied.kind === 'node') {
    return diagram.nodes.filter((node) => node.shape === copied.shape).map((node) => node.id)
  }
  const list = copied.kind === 'link' ? diagram.links : diagram.texts
  return list.map((element) => element.id)
}

/**
 * Parmi des éléments désignés (un clic, un lasso), ceux qui reçoivent un style copié : ceux de
 * son type qui ne l'ont pas déjà. Les autres types sont laissés tels quels, toujours.
 */
export function styleRecipients(
  diagram: Diagram,
  copied: CopiedStyle,
  among: readonly StyleElement[]
): string[] {
  const wanted = new Set(
    among.filter((element) => element.kind === copied.kind).map((element) => element.id)
  )
  if (wanted.size === 0) return []
  if (copied.kind === 'node') {
    return diagram.nodes
      .filter(
        (node) =>
          wanted.has(node.id) &&
          node.shape === copied.shape &&
          !hasLook(node, copied.look, NODE_LOOK_KEYS)
      )
      .map((node) => node.id)
  }
  if (copied.kind === 'link') {
    return diagram.links
      .filter((link) => wanted.has(link.id) && !hasLook(link, copied.look, LINK_LOOK_KEYS))
      .map((link) => link.id)
  }
  return diagram.texts
    .filter((text) => wanted.has(text.id) && !hasLook(text, copied.look, TEXT_LOOK_KEYS))
    .map((text) => text.id)
}
