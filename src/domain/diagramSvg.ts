import { textEmphasisAttrs, textTransform } from './component'
import { DIAGRAM_FONT_FAMILIES, type Diagram, type DiagramNode } from './diagram'
import {
  diagramBounds,
  layoutLinkLabel,
  linkArrowHead,
  linkDashArray,
  linkLabelBox,
  linkRenderPoints
} from './diagramLinks'
import {
  layoutNodeText,
  nodeParts,
  nodeTextAttrs,
  nodeTextTone,
  SUBTITLE_OPACITY,
  TINT_OPACITY,
  type NodePart
} from './diagramShapes'
import { pointsAttribute } from './arrows'
import type { GridPoint, LocalPoint } from './grid'
import { layoutLabel } from './placement'
import type { ExportSettings } from './settings'
import { escapeXml, svgAttrs, type SvgExport } from './svg'
import { wirePathData } from './wires'

/**
 * Export d'un diagramme en SVG autonome, en unités de cellule dans le viewBox. Même ordre
 * d'empilement que l'éditeur, sans marqueurs d'édition : fond, grille optionnelle, liens, nœuds,
 * étiquettes de lien, textes libres. L'encre est noire ; un fond teinté se pose sur la couleur du
 * fond de l'image (blanc si elle est transparente), comme à l'écran sur le papier.
 */

/** Nombre du viewBox, arrondi au millième. */
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function local(point: GridPoint): LocalPoint {
  return { x: point[0], y: point[1] }
}

function nodeSvg(node: DiagramNode, diagram: Diagram, underlay: string): string {
  const style = diagram.style
  const paint = (part: NodePart): string => {
    const body = part.fill === 'body'
    const filled = part.fill === 'color' || (body && node.fill !== 'none')
    const path = `<path ${svgAttrs({
      d: part.d,
      fill: filled ? node.color : 'none',
      'fill-opacity': body && node.fill === 'tint' ? TINT_OPACITY : undefined,
      stroke: part.stroke ? node.color : 'none',
      'stroke-width': part.stroke ? style.lineWidth : undefined
    })}/>`
    return body && node.fill === 'tint'
      ? `<path ${svgAttrs({ d: part.d, fill: underlay })}/>${path}`
      : path
  }
  const shapes = nodeParts(node, style).map(paint).join('')
  const text = layoutNodeText(node, style)
  if (!text) return shapes
  const tone = nodeTextTone(node)
  const spans = text.lines
    .map(
      (line) =>
        `<tspan ${svgAttrs({
          x: text.x,
          y: line.y,
          'font-size': line.size,
          'fill-opacity': line.role === 'subtitle' ? SUBTITLE_OPACITY : undefined,
          ...nodeTextAttrs(line.role, style.font)
        })}>${escapeXml(line.text)}</tspan>`
    )
    .join('')
  return `${shapes}<text ${svgAttrs({
    'text-anchor': 'middle',
    fill: tone === 'light' ? '#ffffff' : '#000000'
  })}>${spans}</text>`
}

export function buildDiagramSvg(diagram: Diagram, options: ExportSettings): SvgExport | null {
  const bounds = diagramBounds(diagram)
  if (!bounds) return null
  const style = diagram.style
  const margin = options.marginCells
  const x0 = bounds.x - margin
  const y0 = bounds.y - margin
  const widthCells = bounds.width + 2 * margin
  const heightCells = bounds.height + 2 * margin
  const cellPx = style.cellPx * options.scale
  const lineWidth = style.lineWidth
  const parts: string[] = []
  const paper =
    options.background === 'transparent' || options.background === 'white'
      ? '#ffffff'
      : options.background

  if (options.background !== 'transparent') {
    parts.push(
      `<rect ${svgAttrs({ x: x0, y: y0, width: widthCells, height: heightCells, fill: paper })}/>`
    )
  }

  if (options.grid) {
    const lines: string[] = []
    for (let x = Math.ceil(x0); x <= Math.floor(x0 + widthCells); x++) {
      lines.push(`<line ${svgAttrs({ x1: x, y1: y0, x2: x, y2: y0 + heightCells })}/>`)
    }
    for (let y = Math.ceil(y0); y <= Math.floor(y0 + heightCells); y++) {
      lines.push(`<line ${svgAttrs({ x1: x0, y1: y, x2: x0 + widthCells, y2: y })}/>`)
    }
    parts.push(
      `<g ${svgAttrs({ stroke: '#d8dee4', 'stroke-width': 1 / cellPx })}>${lines.join('')}</g>`
    )
  }

  if (diagram.links.length > 0) {
    const linkParts = diagram.links.map((link) => {
      const points = linkRenderPoints(link, diagram.nodes)
      const heads: string[] = []
      const first = points[0]
      const second = points[1]
      const last = points.at(-1)
      const beforeLast = points.at(-2)
      const head = (from: GridPoint, tip: GridPoint): void => {
        const wings = linkArrowHead(local(from), local(tip), lineWidth)
        if (wings) {
          heads.push(
            `<polyline ${svgAttrs({ points: pointsAttribute(wings), 'stroke-linecap': 'round' })}/>`
          )
        }
      }
      if (link.startArrow && first && second) head(second, first)
      if (link.endArrow && last && beforeLast) head(beforeLast, last)
      const path = `<path ${svgAttrs({
        d: wirePathData(points, style.cornerRadius),
        'stroke-dasharray': linkDashArray(link, lineWidth)
      })}/>`
      return `<g ${svgAttrs({ stroke: link.color })}>${path}${heads.join('')}</g>`
    })
    parts.push(
      `<g ${svgAttrs({
        class: 'links',
        fill: 'none',
        'stroke-width': lineWidth,
        'stroke-linejoin': 'round'
      })}>${linkParts.join('')}</g>`
    )
  }

  if (diagram.nodes.length > 0) {
    const groups = diagram.nodes.map((node) => `<g>${nodeSvg(node, diagram, paper)}</g>`)
    parts.push(
      `<g ${svgAttrs({
        class: 'nodes',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })}>${groups.join('')}</g>`
    )
  }

  const labelSize = style.labelSize / style.cellPx
  const labelParts = diagram.links.flatMap((link) => {
    const layout = layoutLinkLabel(link, style)
    const box = linkLabelBox(link, style)
    if (!layout || !box) return []
    const spans = layout.lines
      .map(
        (line) => `<tspan ${svgAttrs({ x: layout.x, y: line.y })}>${escapeXml(line.text)}</tspan>`
      )
      .join('')
    const back = `<rect ${svgAttrs({
      x: box.x - 0.2,
      y: box.y,
      width: box.w + 0.4,
      height: box.h,
      fill: paper,
      'fill-opacity': 0.85
    })}/>`
    return [`${back}<text ${svgAttrs({ fill: link.color })}>${spans}</text>`]
  })
  if (labelParts.length > 0) {
    parts.push(
      `<g ${svgAttrs({
        class: 'link-labels',
        'text-anchor': 'middle',
        'font-size': labelSize
      })}>${labelParts.join('')}</g>`
    )
  }

  if (diagram.texts.length > 0) {
    const textParts = diagram.texts.map((text) => {
      const layout = layoutLabel(text, style.cellPx)
      const spans = layout.lines
        .map(
          (line) => `<tspan ${svgAttrs({ x: layout.x, y: line.y })}>${escapeXml(line.text)}</tspan>`
        )
        .join('')
      return `<text ${svgAttrs({
        'font-size': text.size / style.cellPx,
        'text-anchor': text.anchor,
        fill: text.color,
        ...textEmphasisAttrs(text),
        transform: textTransform(text)
      })}>${spans}</text>`
    })
    parts.push(`<g class="texts">${textParts.join('')}</g>`)
  }

  const widthPx = Math.round(widthCells * cellPx)
  const heightPx = Math.round(heightCells * cellPx)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `${svgAttrs({
      width: widthPx,
      height: heightPx,
      viewBox: `${num(x0)} ${num(y0)} ${num(widthCells)} ${num(heightCells)}`,
      'font-family': DIAGRAM_FONT_FAMILIES[style.font]
    })}>${parts.join('')}</svg>`
  return { svg, widthPx, heightPx, widthCells, heightCells, originX: x0, originY: y0 }
}
