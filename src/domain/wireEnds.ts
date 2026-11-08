import { arrowHeadPoints, arrowSize } from './arrows'
import type { GridPoint, LocalPoint } from './grid'
import type { GridRect } from './placement'
import type { FreeEndStyle } from './project'

/**
 * Extrémités libres des fils, à l'écran comme à l'export : style (nette, flèche, pointillés),
 * géométrie d'affichage et étiquette d'extrémité placée dans le prolongement du fil.
 * Rien n'est stocké hors du style et du texte : tout se déduit des sommets.
 */

/** Longueur de la queue en pointillés, en cellules. */
export const DOTTED_TAIL_CELLS = 1.5
/** Distance entre le bout du fil et son étiquette d'extrémité, en cellules. */
export const END_LABEL_OFFSET_CELLS = 0.6

export interface WireEndFlags {
  start: boolean
  end: boolean
}

export interface WireRenderParts {
  /** Corps plein du fil ; ses extrémités décorées sont raccourcies (coordonnées flottantes). */
  body: GridPoint[]
  /** Queues en pointillés, une par extrémité libre quand le style est « pointillés ». */
  dotted: GridPoint[][]
  /** Pointes de flèche, la pointe sur le bout du fil, quand le style est « flèche ». */
  heads: LocalPoint[][]
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * Coupe une ligne brisée à `length` de son dernier sommet : [partie gardée, queue].
 * Une queue plus longue que le fil prend tout le fil (partie gardée vide).
 */
export function splitFromEnd(
  points: readonly GridPoint[],
  length: number
): [GridPoint[], GridPoint[]] {
  const copy = points.map((p): GridPoint => [p[0], p[1]])
  if (copy.length < 2 || length <= 0) return [copy, []]
  let remaining = length
  for (let i = copy.length - 1; i > 0; i--) {
    const a = copy[i - 1]
    const b = copy[i]
    if (!a || !b) continue
    const segment = distance(a, b)
    if (segment === 0) continue
    if (remaining < segment) {
      const t = (segment - remaining) / segment
      const cut: GridPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      return [
        [...copy.slice(0, i), cut],
        [cut, ...copy.slice(i)]
      ]
    }
    if (remaining === segment) return [copy.slice(0, i), copy.slice(i - 1)]
    remaining -= segment
  }
  return [[], copy]
}

/** Géométrie d'affichage d'un fil selon le style de ses extrémités libres. */
export function wireRenderParts(
  points: readonly GridPoint[],
  style: FreeEndStyle,
  free: WireEndFlags,
  wireWidth: number
): WireRenderParts {
  let body = points.map((p): GridPoint => [p[0], p[1]])
  const dotted: GridPoint[][] = []
  const heads: LocalPoint[][] = []
  if (style === 'flat' || points.length < 2) return { body, dotted, heads }
  const amount = style === 'arrow' ? arrowSize(wireWidth) : DOTTED_TAIL_CELLS

  const decorate = (atStart: boolean): void => {
    const oriented = atStart ? [...body].reverse() : body
    const tip = oriented.at(-1)
    const from = oriented.at(-2)
    const [kept, tail] = splitFromEnd(oriented, amount)
    body = atStart ? [...kept].reverse() : kept
    if (style === 'arrow') {
      if (!tip || !from) return
      const head = arrowHeadPoints({ x: from[0], y: from[1] }, { x: tip[0], y: tip[1] }, wireWidth)
      if (head) heads.push(head)
    } else if (tail.length >= 2) {
      dotted.push(atStart ? [...tail].reverse() : tail)
    }
  }
  if (free.end) decorate(false)
  if (free.start) decorate(true)
  return { body, dotted, heads }
}

export interface EndLabelPlacement {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  baseline: 'auto' | 'middle' | 'hanging'
}

/**
 * Position de l'étiquette d'une extrémité : dans le prolongement du dernier segment, à l'opposé
 * du fil. Un fil qui arrive par le haut a son étiquette en dessous ; par la gauche, à droite.
 */
export function wireEndLabelPlacement(
  points: readonly GridPoint[],
  endIndex: number,
  offset = END_LABEL_OFFSET_CELLS
): EndLabelPlacement | null {
  const end = points[endIndex]
  const neighbor = points[endIndex === 0 ? 1 : endIndex - 1]
  if (!end || !neighbor) return null
  const dx = Math.sign(end[0] - neighbor[0])
  const dy = Math.sign(end[1] - neighbor[1])
  if (dx === 0 && dy === 0) return null
  if (dx !== 0) {
    return {
      x: end[0] + dx * offset,
      y: end[1],
      anchor: dx > 0 ? 'start' : 'end',
      baseline: 'middle'
    }
  }
  return {
    x: end[0],
    y: end[1] + dy * offset,
    anchor: 'middle',
    baseline: dy > 0 ? 'hanging' : 'auto'
  }
}

/** Encombrement approché d'une étiquette d'extrémité, arrondi à la cellule. */
export function wireEndLabelBounds(
  text: string,
  placement: EndLabelPlacement,
  fontCells: number
): GridRect {
  const width = Math.max(0.5, text.length * 0.6 * fontCells)
  const height = fontCells
  const x =
    placement.anchor === 'start'
      ? placement.x
      : placement.anchor === 'end'
        ? placement.x - width
        : placement.x - width / 2
  const y =
    placement.baseline === 'middle'
      ? placement.y - height / 2
      : placement.baseline === 'hanging'
        ? placement.y
        : placement.y - height
  const x1 = Math.floor(x)
  const y1 = Math.floor(y)
  return { x: x1, y: y1, width: Math.ceil(x + width) - x1, height: Math.ceil(y + height) - y1 }
}
