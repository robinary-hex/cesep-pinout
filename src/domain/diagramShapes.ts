import { CAP_CENTER, TEXT_LINE_HEIGHT } from './component'
import {
  fittedNodeSize,
  NODE_SPECS,
  type DiagramFont,
  type DiagramNode,
  type DiagramStyle
} from './diagram'
import type { GridPoint, LocalPoint } from './grid'
import { boxHandles, resizeBox, type Box, type Handle } from './handles'
import type { GridRect } from './placement'
import { roundedPathData } from './roundedPath'

// Catalogue des formes d'un diagramme : ce que chaque nœud dessine (des tracés SVG en cellules,
// les mêmes à l'écran et à l'export), où se met son texte, de quelle couleur. Le canevas et
// l'export ne font que peindre ces descriptions.

/** Épaisseur d'une barre de fourche, en cellules. */
export const BAR_THICKNESS = 0.6
/** Opacité du fond « teinté » d'un nœud. */
export const TINT_OPACITY = 0.16
/** Le sous-titre s'efface un peu devant le titre. */
export const SUBTITLE_OPACITY = 0.75

function fmt(value: number): string {
  return Number(value.toFixed(4)).toString()
}

/** Profondeur de la pointe d'un envoi ou de l'encoche d'une réception, en cellules entières. */
export function signalDepth(box: { w: number; h: number }): number {
  return Math.max(1, Math.min(Math.floor(box.h / 2), Math.floor(box.w / 3)))
}

/** Côté du coin plié d'une note, en cellules entières. */
export function noteFold(box: { w: number; h: number }): number {
  return Math.max(1, Math.min(2, Math.floor(box.w / 2), Math.floor(box.h / 2)))
}

function rectPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r === 0) return `M ${fmt(x)} ${fmt(y)} h ${fmt(w)} v ${fmt(h)} h ${fmt(-w)} Z`
  const arc = (dx: number, dy: number): string =>
    `a ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`
  return (
    `M ${fmt(x + r)} ${fmt(y)} h ${fmt(w - 2 * r)} ${arc(r, r)} v ${fmt(h - 2 * r)} ` +
    `${arc(-r, r)} h ${fmt(2 * r - w)} ${arc(-r, -r)} v ${fmt(2 * r - h)} ${arc(r, -r)} Z`
  )
}

function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M ${fmt(cx - r)} ${fmt(cy)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 ` +
    `a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0 Z`
  )
}

function polygonPath(points: readonly LocalPoint[], radius = 0): string {
  return roundedPathData(points, radius, true)
}

/** Un tracé d'un nœud et la façon de le peindre. */
export interface NodePart {
  d: string
  /** `body` : le fond du nœud selon son mode ; `color` : plein de sa couleur ; `none` : vide. */
  fill: 'body' | 'color' | 'none'
  /** Contour tracé de la couleur du nœud. */
  stroke: boolean
}

/** Tracés d'un nœud, en cellules, du fond vers le dessus. */
export function nodeParts(node: DiagramNode, style: DiagramStyle): NodePart[] {
  const { x, y, w, h } = node
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) / 2
  switch (node.shape) {
    case 'rounded':
      return [{ d: rectPath(x, y, w, h, style.nodeRadius), fill: 'body', stroke: true }]
    case 'rect':
      return [{ d: rectPath(x, y, w, h, 0), fill: 'body', stroke: true }]
    case 'diamond':
      return [
        {
          d: polygonPath(
            [
              { x: cx, y },
              { x: x + w, y: cy },
              { x: cx, y: y + h },
              { x, y: cy }
            ],
            style.nodeRadius * 0.3
          ),
          fill: 'body',
          stroke: true
        }
      ]
    case 'start':
      return [{ d: circlePath(cx, cy, r), fill: 'color', stroke: false }]
    case 'end':
      return [
        { d: circlePath(cx, cy, r), fill: 'body', stroke: true },
        { d: circlePath(cx, cy, r * 0.55), fill: 'color', stroke: false }
      ]
    case 'flow-end': {
      const reach = r * Math.SQRT1_2
      return [
        { d: circlePath(cx, cy, r), fill: 'body', stroke: true },
        {
          d:
            `M ${fmt(cx - reach)} ${fmt(cy - reach)} L ${fmt(cx + reach)} ${fmt(cy + reach)} ` +
            `M ${fmt(cx + reach)} ${fmt(cy - reach)} L ${fmt(cx - reach)} ${fmt(cy + reach)}`,
          fill: 'none',
          stroke: true
        }
      ]
    }
    case 'bar': {
      const half = BAR_THICKNESS / 2
      const d =
        h === 0
          ? rectPath(x, y - half, w, BAR_THICKNESS, 0)
          : rectPath(x - half, y, BAR_THICKNESS, h, 0)
      return [{ d, fill: 'color', stroke: false }]
    }
    case 'send': {
      const depth = signalDepth(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w - depth, y },
            { x: x + w, y: cy },
            { x: x + w - depth, y: y + h },
            { x, y: y + h }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'receive': {
      const depth = signalDepth(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
            { x: x + depth, y: cy }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'note': {
      const fold = noteFold(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w - fold, y },
            { x: x + w, y: y + fold },
            { x: x + w, y: y + h },
            { x, y: y + h }
          ]),
          fill: 'body',
          stroke: true
        },
        {
          d: `M ${fmt(x + w - fold)} ${fmt(y)} v ${fmt(fold)} h ${fmt(fold)}`,
          fill: 'none',
          stroke: true
        }
      ]
    }
  }
}

/** Boîte où le texte d'un nœud se centre : la sienne, moins la pointe ou l'encoche d'un signal. */
export function nodeTextBox(node: DiagramNode): Box {
  const { x, y, w, h } = node
  if (node.shape === 'send') return { x, y, w: w - signalDepth(node), h }
  if (node.shape === 'receive') {
    const depth = signalDepth(node)
    return { x: x + depth, y, w: w - depth, h }
  }
  return { x, y, w, h }
}

export interface NodeTextLine {
  text: string
  /** Ligne de base, en cellules. */
  y: number
  /** Hauteur de police, en cellules. */
  size: number
  role: 'title' | 'subtitle'
}

export interface NodeTextLayout {
  /** Abscisse du centre des lignes. */
  x: number
  lines: NodeTextLine[]
}

/**
 * Titre puis sous-titre d'un nœud, en un bloc centré dans sa boîte de texte (capitales centrées
 * sur chaque ligne) ; null pour une forme sans texte ou un nœud sans rien d'écrit.
 */
export function layoutNodeText(node: DiagramNode, style: DiagramStyle): NodeTextLayout | null {
  if (!NODE_SPECS[node.shape].text) return null
  const titleSize = style.titleSize / style.cellPx
  const subtitleSize = style.subtitleSize / style.cellPx
  const newline = String.fromCharCode(10)
  const entries: { text: string; size: number; role: 'title' | 'subtitle' }[] = [
    ...(node.title.length > 0
      ? node.title.split(newline).map((text) => ({ text, size: titleSize, role: 'title' as const }))
      : []),
    ...(node.subtitle.length > 0
      ? node.subtitle
          .split(newline)
          .map((text) => ({ text, size: subtitleSize, role: 'subtitle' as const }))
      : [])
  ]
  if (entries.length === 0) return null
  const box = nodeTextBox(node)
  const total = entries.reduce((sum, entry) => sum + entry.size * TEXT_LINE_HEIGHT, 0)
  let top = box.y + box.h / 2 - total / 2
  const lines = entries.map((entry) => {
    const lineHeight = entry.size * TEXT_LINE_HEIGHT
    const line = { ...entry, y: top + lineHeight / 2 + CAP_CENTER * entry.size }
    top += lineHeight
    return line
  })
  return { x: box.x + box.w / 2, lines }
}

/** Une couleur est-elle assez sombre pour porter un texte clair ? */
export function isDarkColor(hex: string): boolean {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = (value >> 16) & 0xff
  const green = (value >> 8) & 0xff
  const blue = value & 0xff
  return (red * 299 + green * 587 + blue * 114) / 1000 < 150
}

/** Couleur du texte d'un nœud : l'encre, sauf sur un fond plein où il contraste avec lui. */
export type NodeTextTone = 'ink' | 'light' | 'dark'

export function nodeTextTone(node: Pick<DiagramNode, 'color' | 'fill'>): NodeTextTone {
  if (node.fill !== 'solid') return 'ink'
  return isDarkColor(node.color) ? 'light' : 'dark'
}

/** Rectangle occupé par un nœud, épaisseur d'une barre comprise. */
export function nodeBounds(node: DiagramNode): GridRect {
  if (NODE_SPECS[node.shape].line) {
    const half = BAR_THICKNESS / 2
    return node.h === 0
      ? { x: node.x, y: node.y - half, width: node.w, height: BAR_THICKNESS }
      : { x: node.x - half, y: node.y, width: BAR_THICKNESS, height: node.h }
  }
  return { x: node.x, y: node.y, width: node.w, height: node.h }
}

/**
 * Graisse et style d'une ligne de texte de nœud : en police normale le titre est demi-gras ; en
 * chasse fixe (organigrammes de code) le titre reste maigre et le sous-titre passe en italique.
 */
export function nodeTextAttrs(
  role: 'title' | 'subtitle',
  font: DiagramFont
): { 'font-weight': string | undefined; 'font-style': string | undefined } {
  return {
    'font-weight': role === 'title' && font === 'sans' ? '600' : undefined,
    'font-style': role === 'subtitle' && font === 'mono' ? 'italic' : undefined
  }
}

/** Poignées d'un nœud : les huit de sa boîte, ou les deux bouts d'une barre. */
export function nodeHandles(node: DiagramNode): Handle[] {
  if (!NODE_SPECS[node.shape].line) return boxHandles(node)
  return node.h === 0
    ? [
        { id: 'w', x: node.x, y: node.y },
        { id: 'e', x: node.x + node.w, y: node.y }
      ]
    : [
        { id: 'n', x: node.x, y: node.y },
        { id: 's', x: node.x, y: node.y + node.h }
      ]
}

/**
 * Boîte d'un nœud après glisser d'une poignée vers `target`, ramenée à ce que sa forme permet ;
 * le bord opposé à la poignée reste en place.
 */
export function resizeNodeBox(node: DiagramNode, handleId: string, target: GridPoint): Box {
  const raw = resizeBox(node, handleId, target)
  const size = fittedNodeSize(node.shape, raw.w, raw.h, node)
  return {
    x: handleId.includes('w') ? node.x + node.w - size.w : node.x,
    y: handleId.includes('n') ? node.y + node.h - size.h : node.y,
    w: size.w,
    h: size.h
  }
}
