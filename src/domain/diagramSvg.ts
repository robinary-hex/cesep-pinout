import { pointsAttribute } from './arrows'
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
  DARK_GROUND,
  groundOf,
  inkColor,
  layoutNodeText,
  LIGHT_GROUND,
  mixColors,
  nodePaint,
  nodeParts,
  nodeTextAttrs,
  SUBTITLE_OPACITY,
  type DiagramGround,
  type NodePart
} from './diagramShapes'
import type { GridPoint, LocalPoint } from './grid'
import { layoutLabel } from './placement'
import type { ExportSettings } from './settings'
import { escapeXml, svgAttrs, type SvgExport } from './svg'
import { wirePathData } from './wires'

/**
 * Export d'un diagramme en SVG autonome, en unités de cellule dans le viewBox. Même ordre
 * d'empilement que l'éditeur, sans marqueurs d'édition : fond, grille optionnelle, liens, nœuds,
 * étiquettes de lien, textes libres. L'encre suit le fond de l'image : noire sur un fond clair,
 * claire sur un fond sombre ; pour un fond transparent, `darkPage` dit sur quelle page l'image ira.
 */

/** Nombre du viewBox, arrondi au millième. */
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function local(point: GridPoint): LocalPoint {
  return { x: point[0], y: point[1] }
}

/** Fond sur lequel l'image est peinte : sa couleur, ou la page visée si elle est transparente. */
export function exportGround(options: ExportSettings, darkPage: boolean): DiagramGround {
  if (options.background === 'transparent') return darkPage ? DARK_GROUND : LIGHT_GROUND
  return groundOf(options.background === 'white' ? '#ffffff' : options.background)
}

function nodeSvg(node: DiagramNode, diagram: Diagram, ground: DiagramGround): string {
  const style = diagram.style
  const paint = nodePaint(node, ground)
  const fillOf = (part: NodePart): string => {
    if (part.fill === 'color') return paint.solid
    return part.fill === 'body' && paint.fill !== null ? paint.fill : 'none'
  }
  const shapes = nodeParts(node, style)
    .map(
      (part) =>
        `<path ${svgAttrs({
          d: part.d,
          fill: fillOf(part),
          stroke: part.stroke ? paint.stroke : 'none',
          'stroke-width': part.stroke ? style.lineWidth : undefined
        })}/>`
    )
    .join('')
  const text = layoutNodeText(node, style)
  if (!text) return shapes
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
  return `${shapes}<text ${svgAttrs({ 'text-anchor': 'middle', fill: paint.text })}>${spans}</text>`
}

export function buildDiagramSvg(
  diagram: Diagram,
  options: ExportSettings,
  darkPage = false
): SvgExport | null {
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
  const ground = exportGround(options, darkPage)
  const parts: string[] = []

  if (options.background !== 'transparent') {
    parts.push(
      `<rect ${svgAttrs({
        x: x0,
        y: y0,
        width: widthCells,
        height: heightCells,
        fill: ground.paper
      })}/>`
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
    // Une grille discrète : un peu d'encre dans la couleur du papier.
    const stroke = ground.dark ? mixColors(ground.ink, ground.paper, 0.18) : '#d8dee4'
    parts.push(`<g ${svgAttrs({ stroke, 'stroke-width': 1 / cellPx })}>${lines.join('')}</g>`)
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
      return `<g ${svgAttrs({ stroke: inkColor(link.color, ground) })}>${path}${heads.join('')}</g>`
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
    const groups = diagram.nodes.map((node) => `<g>${nodeSvg(node, diagram, ground)}</g>`)
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
    // Un voile de la couleur du papier sous l'étiquette : elle reste lisible posée sur un trait.
    const back = `<rect ${svgAttrs({
      x: box.x - 0.2,
      y: box.y,
      width: box.w + 0.4,
      height: box.h,
      fill: ground.paper,
      'fill-opacity': 0.85
    })}/>`
    return [`${back}<text ${svgAttrs({ fill: inkColor(link.color, ground) })}>${spans}</text>`]
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
        fill: inkColor(text.color, ground),
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
