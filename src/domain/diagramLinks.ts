import { layoutTextBox, TEXT_LINE_HEIGHT, type TextBoxLayout } from './component'
import type { PinRef } from './connectivity'
import {
  NODE_SPECS,
  type Diagram,
  type DiagramFont,
  type DiagramLink,
  type DiagramNode,
  type DiagramStyle
} from './diagram'
import { BAR_THICKNESS, nodeBounds, noteFold, signalDepth } from './diagramShapes'
import { wiresFollowingPins } from './elastic'
import type { GridPoint, LocalPoint } from './grid'
import type { Box } from './handles'
import { textLabelBounds, unionRects, type GridRect } from './placement'
import { wireBounds } from './wires'

// Liens d'un diagramme : où ils s'accrochent aux nœuds, comment ils les suivent, leurs pointes de
// flèche et leur étiquette. Un lien a la géométrie d'un fil du montage (`wires.ts`) ; l'accroche
// se déduit de la géométrie : une extrémité posée sur un point d'accroche d'un nœud le suit.

const pointKey = (point: GridPoint): string => `${point[0]},${point[1]}`

/**
 * Points d'accroche d'un nœud : les intersections de la grille qui sont sur son contour. Un
 * rectangle les offre sur tout son tour ; un losange ou un disque, au milieu de ses quatre côtés ;
 * une barre, tout du long ; les signaux et la note, là où leur contour suit leur boîte.
 */
export function nodeAnchors(node: DiagramNode): GridPoint[] {
  const { x, y, w, h } = node
  const points: GridPoint[] = []
  if (NODE_SPECS[node.shape].line) {
    if (h === 0) for (let i = 0; i <= w; i++) points.push([x + i, y])
    else for (let j = 0; j <= h; j++) points.push([x, y + j])
    return points
  }
  const midX = w % 2 === 0 ? x + w / 2 : null
  const midY = h % 2 === 0 ? y + h / 2 : null
  if (
    node.shape === 'diamond' ||
    node.shape === 'start' ||
    node.shape === 'end' ||
    node.shape === 'flow-end'
  ) {
    if (midX !== null) points.push([midX, y], [midX, y + h])
    if (midY !== null) points.push([x, midY], [x + w, midY])
    return points
  }
  // Formes qui suivent leur boîte : le tour, moins ce que la forme entame.
  const depth = node.shape === 'send' || node.shape === 'receive' ? signalDepth(node) : 0
  const fold = node.shape === 'note' ? noteFold(node) : 0
  const lastTop = node.shape === 'send' ? w - depth : node.shape === 'note' ? w - fold : w
  const lastBottom = node.shape === 'send' ? w - depth : w
  for (let i = 0; i <= lastTop; i++) points.push([x + i, y])
  for (let i = 0; i <= lastBottom; i++) points.push([x + i, y + h])
  if (node.shape === 'receive') {
    // Côté gauche : seule la pointe de l'encoche, à l'intérieur de la boîte.
    if (midY !== null) points.push([x + depth, midY])
  } else {
    for (let j = 1; j < h; j++) points.push([x, y + j])
  }
  if (node.shape === 'send') {
    // Côté droit : seule la pointe.
    if (midY !== null) points.push([x + w, midY])
  } else {
    for (let j = Math.max(1, fold); j < h; j++) points.push([x + w, y + j])
  }
  return points
}

/** Point d'accroche et le nœud qui le porte. */
export interface NodeAnchor {
  nodeId: string
  point: GridPoint
}

export function diagramAnchors(nodes: readonly DiagramNode[]): NodeAnchor[] {
  return nodes.flatMap((node) => nodeAnchors(node).map((point) => ({ nodeId: node.id, point })))
}

/**
 * Où va un point d'accroche quand la boîte de son nœud passe de `before` à `after`. Sur chaque
 * axe : un point posé sur un bord suit ce bord ; sans changement de taille, il suit le
 * déplacement ; le milieu d'un côté reste au milieu ; sinon il garde sa place, bornée à la
 * nouvelle boîte.
 */
export function movedAnchor(before: Box, after: Box, point: GridPoint): GridPoint {
  const along = (
    value: number,
    start: number,
    size: number,
    newStart: number,
    newSize: number
  ): number => {
    if (size === newSize) return value + (newStart - start)
    if (value === start) return newStart
    if (value === start + size) return newStart + newSize
    if (2 * (value - start) === size && newSize % 2 === 0) return newStart + newSize / 2
    return Math.min(Math.max(value, newStart), newStart + newSize)
  }
  return [
    along(point[0], before.x, before.w, after.x, after.w),
    along(point[1], before.y, before.h, after.y, after.h)
  ]
}

function nearestPoint(points: readonly GridPoint[], target: GridPoint): GridPoint {
  let best = target
  let bestDistance = Number.POSITIVE_INFINITY
  for (const point of points) {
    const distance = Math.abs(point[0] - target[0]) + Math.abs(point[1] - target[1])
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

function sameNode(a: DiagramNode, b: DiagramNode): boolean {
  return a.shape === b.shape && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/**
 * Liens après un changement de nœuds (déplacement, redimensionnement, changement de forme) : les
 * extrémités posées sur un point d'accroche suivent leur nœud, l'extrémité emmenant son segment.
 * `translated` donne, par identifiant, le vecteur des liens déplacés en bloc : leurs extrémités
 * posées sur un nœud resté immobile y restent. Un lien inchangé est retourné tel quel.
 */
export function linksFollowingNodes(
  links: readonly DiagramLink[],
  nodesBefore: readonly DiagramNode[],
  nodesAfter: readonly DiagramNode[],
  translated: ReadonlyMap<string, GridPoint> = new Map()
): DiagramLink[] {
  const ends = new Set<string>()
  for (const link of links) {
    const first = link.points[0]
    const last = link.points.at(-1)
    if (first) ends.add(pointKey(first))
    if (last) ends.add(pointKey(last))
  }
  const afterById = new Map(nodesAfter.map((node) => [node.id, node]))
  const pinsBefore: PinRef[] = []
  const pinsAfter: PinRef[] = []
  for (const node of nodesBefore) {
    const next = afterById.get(node.id)
    if (!next) continue
    const unchanged = sameNode(node, next)
    const nextAnchors = unchanged ? [] : nodeAnchors(next)
    const nextKeys = new Set(nextAnchors.map(pointKey))
    for (const anchor of nodeAnchors(node)) {
      const pinId = pointKey(anchor)
      if (!ends.has(pinId)) continue
      let target = anchor
      if (!unchanged) {
        const moved = movedAnchor(node, next, anchor)
        // La nouvelle forme n'a pas forcément d'accroche là : la plus proche prend le relais.
        target = nextKeys.has(pointKey(moved)) ? moved : nearestPoint(nextAnchors, moved)
      }
      const key = `${node.id}@${pinId}`
      pinsBefore.push({ key, instanceId: node.id, pinId, point: anchor })
      pinsAfter.push({ key, instanceId: node.id, pinId, point: target })
    }
  }
  if (pinsBefore.length === 0 && translated.size === 0) return [...links]
  return wiresFollowingPins(links, pinsBefore, pinsAfter, translated)
}

// Dessin

/** Longueur d'une pointe de flèche, en cellules. */
export function linkArrowSize(lineWidth: number): number {
  return Math.max(0.8, lineWidth * 6)
}

/**
 * Pointe ouverte en V : aile, pointe, aile. La pointe est en `tip`, dans la direction
 * `from` → `tip` ; null si les deux points sont confondus.
 */
export function linkArrowHead(
  from: LocalPoint,
  tip: LocalPoint,
  lineWidth: number
): LocalPoint[] | null {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const ux = dx / length
  const uy = dy / length
  const size = linkArrowSize(lineWidth)
  const half = size / 2
  const baseX = tip.x - ux * size
  const baseY = tip.y - uy * size
  return [
    { x: baseX - uy * half, y: baseY + ux * half },
    { x: tip.x, y: tip.y },
    { x: baseX + uy * half, y: baseY - ux * half }
  ]
}

/** Attribut `stroke-dasharray` d'un lien pointillé, en cellules ; indéfini pour un trait plein. */
export function linkDashArray(link: DiagramLink, lineWidth: number): string | undefined {
  const round = (value: number): number => Math.round(value * 1000) / 1000
  return link.dash === 'dashed' ? `${round(lineWidth * 4)} ${round(lineWidth * 3)}` : undefined
}

/**
 * Sommets d'un lien tels qu'on le dessine : ses sommets, sauf une extrémité qui arrive de face
 * sur une barre, reculée de la demi-épaisseur de la barre pour s'arrêter à son bord.
 */
export function linkRenderPoints(link: DiagramLink, nodes: readonly DiagramNode[]): GridPoint[] {
  const points = link.points.map((point): GridPoint => [point[0], point[1]])
  const bars = nodes.filter((node) => NODE_SPECS[node.shape].line)
  if (bars.length === 0) return points
  const inset = (endIndex: number, neighborIndex: number): void => {
    const end = points[endIndex]
    const neighbor = points[neighborIndex]
    if (!end || !neighbor) return
    const vertical = end[0] === neighbor[0]
    const onBar = bars.some((bar) => {
      const flat = bar.h === 0
      // De face : un segment vertical sur une barre couchée, horizontal sur une barre debout.
      if (flat !== vertical) return false
      return flat
        ? end[1] === bar.y && end[0] >= bar.x && end[0] <= bar.x + bar.w
        : end[0] === bar.x && end[1] >= bar.y && end[1] <= bar.y + bar.h
    })
    if (!onBar) return
    const length = Math.abs(vertical ? neighbor[1] - end[1] : neighbor[0] - end[0])
    const back = Math.min(BAR_THICKNESS / 2, length / 2)
    const sign = Math.sign(vertical ? neighbor[1] - end[1] : neighbor[0] - end[0])
    points[endIndex] = vertical ? [end[0], end[1] + sign * back] : [end[0] + sign * back, end[1]]
  }
  inset(0, 1)
  inset(points.length - 1, points.length - 2)
  return points
}

// Étiquette

/** Point à mi-longueur d'un tracé, et sens du segment qui le porte. */
export function pathMidpoint(points: readonly GridPoint[]): {
  point: LocalPoint
  horizontal: boolean
} {
  const first = points[0] ?? [0, 0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b) total += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
  }
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
    if (length === 0) continue
    if (remaining <= length) {
      const t = remaining / length
      return {
        point: { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t },
        horizontal: a[1] === b[1]
      }
    }
    remaining -= length
  }
  return { point: { x: first[0], y: first[1] }, horizontal: true }
}

/** Largeur moyenne d'un caractère, en multiple de la hauteur de police. */
const CHAR_WIDTH: Record<DiagramFont, number> = { sans: 0.52, mono: 0.6 }

/** Taille estimée d'un texte de plusieurs lignes, en cellules. */
export function estimatedTextSize(
  text: string,
  fontHeight: number,
  font: DiagramFont
): { w: number; h: number } {
  const lines = text.split(String.fromCharCode(10))
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
  return {
    w: longest * CHAR_WIDTH[font] * fontHeight,
    h: lines.length * TEXT_LINE_HEIGHT * fontHeight
  }
}

/** Centre de l'étiquette d'un lien, en cellules. */
export function linkLabelCenter(link: DiagramLink): LocalPoint {
  const { point } = pathMidpoint(link.points)
  return { x: point.x + link.labelDx / 4, y: point.y + link.labelDy / 4 }
}

/** Boîte estimée de l'étiquette d'un lien (sélection, limites du diagramme) ; null sans étiquette. */
export function linkLabelBox(link: DiagramLink, style: DiagramStyle): Box | null {
  if (link.label.length === 0) return null
  const size = estimatedTextSize(link.label, style.labelSize / style.cellPx, style.font)
  const center = linkLabelCenter(link)
  return { x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h }
}

/** Lignes de l'étiquette d'un lien, centrées sur son point ; null sans étiquette. */
export function layoutLinkLabel(link: DiagramLink, style: DiagramStyle): TextBoxLayout | null {
  const box = linkLabelBox(link, style)
  return box ? layoutTextBox(box, link.label, style.labelSize / style.cellPx, 'middle') : null
}

/**
 * Décalage d'une étiquette qu'on vient d'écrire, en quarts de cellule : au-dessus d'un segment
 * horizontal, à droite d'un segment vertical, sans toucher le trait.
 */
export function defaultLabelOffset(
  points: readonly GridPoint[],
  text: string,
  style: DiagramStyle
): { dx: number; dy: number } {
  const size = estimatedTextSize(text, style.labelSize / style.cellPx, style.font)
  const gap = 0.6
  return pathMidpoint(points).horizontal
    ? { dx: 0, dy: -Math.round((size.h / 2 + gap) * 4) }
    : { dx: Math.round((size.w / 2 + gap) * 4), dy: 0 }
}

// Limites

/** Union des nœuds, des liens, de leurs étiquettes et des textes libres ; null si tout est vide. */
export function diagramBounds(diagram: Diagram): GridRect | null {
  let result: GridRect | null = null
  const include = (bounds: GridRect | null): void => {
    if (bounds) result = result ? unionRects(result, bounds) : { ...bounds }
  }
  for (const node of diagram.nodes) include(nodeBounds(node))
  for (const link of diagram.links) {
    include(wireBounds(link.points))
    const box = linkLabelBox(link, diagram.style)
    if (box) include({ x: box.x, y: box.y, width: box.w, height: box.h })
  }
  for (const text of diagram.texts) include(textLabelBounds(text))
  return result
}
