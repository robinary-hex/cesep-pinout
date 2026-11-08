import { arrowHeadPoints, pointsAttribute, trimForArrows } from './arrows'
import {
  strokeWidthCells,
  textContent,
  type ComponentDefinition,
  type FieldValues,
  type Primitive,
  NO_ARROWS
} from './component'
import { computeConnectivity, projectPins, type FreeEnd } from './connectivity'
import { crossingPieces } from './crossings'
import { QUARTERS_PER_CELL, type GridPoint, type LocalPoint } from './grid'
import { instanceBounds, instanceMatrix, matrixToSvg, projectBounds, unionRects } from './placement'
import type { Project } from './project'
import type { ExportSettings } from './settings'
import { wirePathData } from './wires'

/**
 * Export d'un montage en SVG autonome, en unités de cellule dans le viewBox.
 * Même ordre d'empilement que l'éditeur, sans marqueurs d'édition : fond, grille optionnelle,
 * fils (par rang), points de jonction, composants, repères, étiquettes.
 */

export interface SvgExport {
  svg: string
  widthPx: number
  heightPx: number
  widthCells: number
  heightCells: number
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}

function attrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${key}="${escapeXml(typeof value === 'number' ? fmt(value) : String(value))}"`
    )
    .join(' ')
}

const q = (quarters: number): number => quarters / QUARTERS_PER_CELL

const FONT_STACK = "'Segoe UI', sans-serif"

/** Pointes de flèche d'une ligne ou d'une polyligne ouverte, en unités de cellule. */
function arrowsSvg(
  primitive: Extract<Primitive, { kind: 'line' | 'polyline' }>,
  width: number
): string {
  if (primitive.style.stroke === 'none') return ''
  if (primitive.kind === 'polyline' && primitive.closed) return ''
  const points: LocalPoint[] =
    primitive.kind === 'line'
      ? [
          { x: q(primitive.x1), y: q(primitive.y1) },
          { x: q(primitive.x2), y: q(primitive.y2) }
        ]
      : primitive.points.map(([x, y]) => ({ x: q(x), y: q(y) }))
  const first = points[0]
  const second = points[1]
  const last = points.at(-1)
  const beforeLast = points.at(-2)
  const heads: string[] = []
  if (primitive.arrows.end && last && beforeLast) {
    const head = arrowHeadPoints(beforeLast, last, width)
    if (head)
      heads.push(
        `<polygon ${attrs({ points: pointsAttribute(head), fill: primitive.style.stroke })}/>`
      )
  }
  if (primitive.arrows.start && first && second) {
    const head = arrowHeadPoints(second, first, width)
    if (head)
      heads.push(
        `<polygon ${attrs({ points: pointsAttribute(head), fill: primitive.style.stroke })}/>`
      )
  }
  return heads.join('')
}

/** Une forme du mini-éditeur, en unités de cellule. */
export function primitiveSvg(
  primitive: Primitive,
  componentStroke: number,
  fields?: FieldValues
): string {
  if (primitive.kind === 'text') {
    return `<text ${attrs({
      x: q(primitive.x),
      y: q(primitive.y),
      'font-size': primitive.size,
      'text-anchor': primitive.anchor,
      fill: primitive.color,
      'dominant-baseline': 'middle',
      'font-family': FONT_STACK
    })}>${escapeXml(textContent(primitive, fields))}</text>`
  }
  const width = strokeWidthCells(primitive.style, componentStroke)
  const style = {
    stroke: primitive.style.stroke,
    'stroke-width': width,
    fill: primitive.style.fill,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
  switch (primitive.kind) {
    case 'rect':
      return `<rect ${attrs({ x: q(primitive.x), y: q(primitive.y), width: q(primitive.w), height: q(primitive.h), rx: q(primitive.rx), ...style })}/>`
    case 'ellipse':
      return `<ellipse ${attrs({ cx: q(primitive.cx), cy: q(primitive.cy), rx: q(primitive.rx), ry: q(primitive.ry), ...style })}/>`
    case 'line': {
      // Le trait s'arrête à la base des pointes de flèche pour ne pas les recouvrir.
      const heads = primitive.style.stroke === 'none' ? NO_ARROWS : primitive.arrows
      const [a, b] = trimForArrows(
        [
          { x: q(primitive.x1), y: q(primitive.y1) },
          { x: q(primitive.x2), y: q(primitive.y2) }
        ],
        heads,
        width
      )
      if (!a || !b) return ''
      return (
        `<line ${attrs({ x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y), ...style })}/>` +
        arrowsSvg(primitive, width)
      )
    }
    case 'polyline': {
      const cells: LocalPoint[] = primitive.points.map(([x, y]) => ({ x: q(x), y: q(y) }))
      const heads =
        primitive.closed || primitive.style.stroke === 'none' ? NO_ARROWS : primitive.arrows
      const points = pointsAttribute(trimForArrows(cells, heads, width))
      const tag = primitive.closed ? 'polygon' : 'polyline'
      return `<${tag} ${attrs({ points, ...style })}/>` + arrowsSvg(primitive, width)
    }
  }
}

/** Contenu d'un composant dans son repère local (cellules), PNG ou formes. */
export function componentSvg(
  def: ComponentDefinition,
  componentStroke: number,
  fields?: FieldValues
): string {
  const { widthCells, heightCells } = def.size
  if (def.visual.kind === 'drawing') {
    return def.visual.primitives
      .map((primitive) => primitiveSvg(primitive, componentStroke, fields))
      .join('')
  }
  if (!def.visual.dataUrl) {
    return `<rect ${attrs({ width: widthCells, height: heightCells, fill: '#eef1f4', stroke: '#8c959f', 'stroke-width': 0.05 })}/>`
  }
  return `<image ${attrs({
    href: def.visual.dataUrl,
    'xlink:href': def.visual.dataUrl,
    width: widthCells,
    height: heightCells,
    preserveAspectRatio: 'none'
  })}/>`
}

/** Petite flèche au bout d'une extrémité libre « prolongée », dans la direction du dernier segment. */
function arrowHead(
  points: readonly GridPoint[],
  endIndex: number,
  wireWidth: number,
  color: string
): string {
  const end = points[endIndex]
  const neighbor = points[endIndex === 0 ? 1 : endIndex - 1]
  if (!end || !neighbor) return ''
  const length = Math.abs(end[0] - neighbor[0]) + Math.abs(end[1] - neighbor[1])
  if (length === 0) return ''
  const dirX = (end[0] - neighbor[0]) / length
  const dirY = (end[1] - neighbor[1]) / length
  const size = wireWidth * 3
  const half = wireWidth * 1.5
  const tipX = end[0] + dirX * size
  const tipY = end[1] + dirY * size
  const baseAx = end[0] - dirY * half
  const baseAy = end[1] + dirX * half
  const baseBx = end[0] + dirY * half
  const baseBy = end[1] - dirX * half
  return `<polygon ${attrs({
    points: `${fmt(baseAx)},${fmt(baseAy)} ${fmt(baseBx)},${fmt(baseBy)} ${fmt(tipX)},${fmt(tipY)}`,
    fill: color
  })}/>`
}

export function buildProjectSvg(project: Project, options: ExportSettings): SvgExport | null {
  let bounds = projectBounds(project)
  if (!bounds) return null
  if (options.labels) {
    // Les repères s'écrivent juste au-dessus des boîtes : on leur réserve une cellule.
    for (const instance of project.components) {
      const def = project.embeddedDefs[instance.defId]
      if (!def || instance.label.length === 0) continue
      const box = instanceBounds(instance, def)
      bounds = unionRects(bounds, { x: box.x, y: box.y - 1, width: 1, height: 1 })
    }
  }
  const margin = options.marginCells
  const x0 = bounds.x - margin
  const y0 = bounds.y - margin
  const widthCells = bounds.width + 2 * margin
  const heightCells = bounds.height + 2 * margin
  const profile = project.profile
  const cellPx = profile.cellPx * options.scale
  const parts: string[] = []

  if (options.background !== 'transparent') {
    const fill = options.background === 'white' ? '#ffffff' : options.background
    parts.push(`<rect ${attrs({ x: x0, y: y0, width: widthCells, height: heightCells, fill })}/>`)
  }

  if (options.grid) {
    const lines: string[] = []
    const stroke = 1 / cellPx
    for (let x = Math.ceil(x0); x <= Math.floor(x0 + widthCells); x++) {
      lines.push(`<line ${attrs({ x1: x, y1: y0, x2: x, y2: y0 + heightCells })}/>`)
    }
    for (let y = Math.ceil(y0); y <= Math.floor(y0 + heightCells); y++) {
      lines.push(`<line ${attrs({ x1: x0, y1: y, x2: x0 + widthCells, y2: y })}/>`)
    }
    parts.push(`<g ${attrs({ stroke: '#d8dee4', 'stroke-width': stroke })}>${lines.join('')}</g>`)
  }

  const connectivity = computeConnectivity(project.wires, projectPins(project))
  const freeEndsByWire = new Map<string, FreeEnd[]>()
  for (const end of connectivity.freeEnds) {
    const list = freeEndsByWire.get(end.wireId) ?? []
    list.push(end)
    freeEndsByWire.set(end.wireId, list)
  }

  const wires = [...project.wires].sort((a, b) => a.stack - b.stack)
  const wireParts: string[] = []
  for (const wire of wires) {
    wireParts.push(
      `<path ${attrs({
        d: wirePathData(wire.points, profile.cornerRadius),
        fill: 'none',
        stroke: wire.color,
        'stroke-width': profile.wireWidth,
        'stroke-linecap': 'butt',
        'stroke-linejoin': 'round'
      })}/>`
    )
    if (wire.freeEnds === 'arrow') {
      for (const end of freeEndsByWire.get(wire.id) ?? []) {
        wireParts.push(arrowHead(wire.points, end.endIndex, profile.wireWidth, wire.color))
      }
    }
  }
  parts.push(`<g class="wires">${wireParts.join('')}</g>`)

  // Croisements : le fil du dessus est redessiné sur une demi-cellule de part et d'autre, avec un
  // liseré couleur de fond qui rend l'ordre lisible même entre deux fils de même couleur.
  const colorOfWire = new Map(project.wires.map((wire) => [wire.id, wire.color]))
  const haloColor =
    options.background === 'transparent'
      ? null
      : options.background === 'white'
        ? '#ffffff'
        : options.background
  const haloWidth = profile.wireWidth * 2.2
  const crossingParts = crossingPieces(project.wires, project.crossingOverrides).map((piece) => {
    const [x, y] = piece.point
    const x1 = piece.horizontal ? x - 0.5 : x
    const x2 = piece.horizontal ? x + 0.5 : x
    const y1 = piece.horizontal ? y : y - 0.5
    const y2 = piece.horizontal ? y : y + 0.5
    const halo = haloColor
      ? `<line ${attrs({ x1, y1, x2, y2, stroke: haloColor, 'stroke-width': haloWidth })}/>`
      : ''
    const top = `<line ${attrs({
      x1,
      y1,
      x2,
      y2,
      stroke: colorOfWire.get(piece.topWireId) ?? '#000000',
      'stroke-width': profile.wireWidth
    })}/>`
    return halo + top
  })
  if (crossingParts.length > 0) parts.push(`<g class="crossings">${crossingParts.join('')}</g>`)

  const colorById = new Map(project.wires.map((wire) => [wire.id, wire.color]))
  const radius = (profile.wireWidth * profile.junctionScale) / 2
  const junctionParts = connectivity.junctions.map((junction) => {
    const fill =
      profile.junctionColor === 'wire'
        ? (colorById.get(junction.carrierWireId) ?? '#000000')
        : profile.junctionColor
    return `<circle ${attrs({ cx: junction.point[0], cy: junction.point[1], r: radius, fill })}/>`
  })
  parts.push(`<g class="junctions">${junctionParts.join('')}</g>`)

  const instanceParts: string[] = []
  const labelParts: string[] = []
  const labelSize = profile.labelFont.size / profile.cellPx
  for (const instance of project.components) {
    const def = project.embeddedDefs[instance.defId]
    if (!def) continue
    instanceParts.push(
      `<g ${attrs({ transform: matrixToSvg(instanceMatrix(instance, def)) })}>${componentSvg(def, profile.componentStroke, instance.fields)}</g>`
    )
    if (options.labels && instance.label.length > 0) {
      const box = instanceBounds(instance, def)
      labelParts.push(
        `<text ${attrs({ x: box.x, y: box.y - 0.25, 'font-size': labelSize, fill: '#1f2328' })}>${escapeXml(instance.label)}</text>`
      )
    }
  }
  parts.push(`<g class="components">${instanceParts.join('')}</g>`)
  if (labelParts.length > 0) parts.push(`<g class="labels">${labelParts.join('')}</g>`)

  if (project.labels.length > 0) {
    const textParts = project.labels.map(
      (label) =>
        `<text ${attrs({ x: label.x, y: label.y, 'font-size': label.size / profile.cellPx, fill: '#1f2328' })}>${escapeXml(label.text)}</text>`
    )
    parts.push(`<g class="texts">${textParts.join('')}</g>`)
  }

  const widthPx = Math.round(widthCells * cellPx)
  const heightPx = Math.round(heightCells * cellPx)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `${attrs({
      width: widthPx,
      height: heightPx,
      viewBox: `${fmt(x0)} ${fmt(y0)} ${fmt(widthCells)} ${fmt(heightCells)}`,
      'font-family': `${profile.labelFont.family}, sans-serif`
    })}>` +
    parts.join('') +
    '</svg>'
  return { svg, widthPx, heightPx, widthCells, heightCells }
}
