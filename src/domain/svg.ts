import { arrowHeadPoints, middleArrowHead, pointsAttribute, trimForArrows } from './arrows'
import { wireEndLabelPlacement, wireRenderParts } from './wireEnds'
import {
  dotRadiusCells,
  strokeWidthCells,
  type ComponentDefinition,
  type FieldValues,
  type Primitive,
  NO_ARROWS,
  layoutText,
  layoutTextBox,
  textContent,
  textStyleAttrs,
  textTransform
} from './component'
import { computeConnectivity, projectPins, type FreeEnd } from './connectivity'
import { crossingPieces } from './crossings'
import { QUARTERS_PER_CELL, type LocalPoint } from './grid'
import {
  instanceBounds,
  instanceMatrix,
  matrixToSvg,
  projectBounds,
  unionRects,
  layoutLabel,
  instanceTextPlacements,
  textPlacementTransform
} from './placement'
import type { Project } from './project'
import { roundedPathData } from './roundedPath'
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
  /** Coin supérieur gauche du cadre exporté, en cellules : l'origine du viewBox. */
  originX: number
  originY: number
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
  if (primitive.arrows.middle) {
    const head = middleArrowHead(points, width)
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
    const layout = layoutText(primitive, fields)
    const spans = layout.lines
      .map(
        (line) =>
          `<tspan ${attrs({ x: q(layout.x), y: q(line.y) })}>${escapeXml(line.text)}</tspan>`
      )
      .join('')
    return `<text ${attrs({
      'font-size': primitive.size,
      'text-anchor': primitive.anchor,
      fill: primitive.color,
      ...textStyleAttrs(primitive),
      transform: textTransform(primitive, 1 / QUARTERS_PER_CELL)
    })}>${spans}</text>`
  }
  if (primitive.kind === 'dot') {
    return `<circle ${attrs({ cx: q(primitive.x), cy: q(primitive.y), r: dotRadiusCells(primitive.scale, componentStroke), fill: primitive.color })}/>`
  }
  const width = strokeWidthCells(primitive.style, componentStroke)
  const style = {
    stroke: primitive.style.stroke,
    'stroke-width': width,
    fill: primitive.style.fill,
    'fill-opacity': primitive.style.fillOpacity < 1 ? primitive.style.fillOpacity : undefined,
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
      const trimmed = trimForArrows(cells, heads, width)
      if (primitive.radius > 0) {
        const d = roundedPathData(trimmed, q(primitive.radius), primitive.closed)
        return `<path ${attrs({ d, ...style })}/>` + arrowsSvg(primitive, width)
      }
      const points = pointsAttribute(trimmed)
      const tag = primitive.closed ? 'polygon' : 'polyline'
      return `<${tag} ${attrs({ points, ...style })}/>` + arrowsSvg(primitive, width)
    }
  }
}

/** Contenu d'un composant dans son repère local (cellules), PNG ou formes. */
export function componentSvg(
  def: ComponentDefinition,
  componentStroke: number,
  fields?: FieldValues,
  options: { skipTexts?: boolean } = {}
): string {
  const { widthCells, heightCells } = def.size
  if (def.visual.kind === 'drawing') {
    return def.visual.primitives
      .filter((primitive) => !(options.skipTexts && primitive.kind === 'text'))
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
  const endLabelParts: string[] = []
  const endFontCells = profile.endLabelFont.size / profile.cellPx
  for (const wire of wires) {
    const free = freeEndsByWire.get(wire.id) ?? []
    const flags = {
      start: free.some((end) => end.endIndex === 0),
      end: free.some((end) => end.endIndex === wire.points.length - 1)
    }
    const shown = wireRenderParts(wire.points, wire.freeEnds, flags, profile.wireWidth)
    if (shown.body.length >= 2) {
      wireParts.push(
        `<path ${attrs({
          d: wirePathData(shown.body, profile.cornerRadius),
          fill: 'none',
          stroke: wire.color,
          'stroke-width': profile.wireWidth,
          'stroke-linecap': 'butt',
          'stroke-linejoin': 'round'
        })}/>`
      )
    }
    for (const tail of shown.dotted) {
      wireParts.push(
        `<path ${attrs({
          d: wirePathData(tail, profile.cornerRadius),
          fill: 'none',
          stroke: wire.color,
          'stroke-width': profile.wireWidth,
          'stroke-linecap': 'round',
          'stroke-dasharray': `0 ${fmt(profile.wireWidth * 2)}`
        })}/>`
      )
    }
    for (const head of shown.heads) {
      wireParts.push(`<polygon ${attrs({ points: pointsAttribute(head), fill: wire.color })}/>`)
    }
    // Étiquettes d'extrémité : un point sur le bout libre, le texte dans le prolongement du fil.
    for (const end of free) {
      const text = end.endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
      const placement = text.length > 0 ? wireEndLabelPlacement(wire.points, end.endIndex) : null
      if (!placement) continue
      endLabelParts.push(
        `<circle ${attrs({ cx: end.point[0], cy: end.point[1], r: profile.wireWidth, fill: wire.color })}/>`
      )
      endLabelParts.push(
        `<text ${attrs({
          x: placement.x,
          y: placement.y,
          'font-family': profile.endLabelFont.family,
          'font-size': endFontCells,
          'font-weight': 'bold',
          'text-anchor': placement.anchor,
          'dominant-baseline': placement.baseline,
          fill: '#1f2328'
        })}>${escapeXml(text)}</text>`
      )
    }
  }
  parts.push(`<g class="wires">${wireParts.join('')}</g>`)
  if (endLabelParts.length > 0) parts.push(`<g class="end-labels">${endLabelParts.join('')}</g>`)

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
  const componentTextParts: string[] = []
  const labelParts: string[] = []
  const labelSize = profile.labelFont.size / profile.cellPx
  for (const instance of project.components) {
    const def = project.embeddedDefs[instance.defId]
    if (!def) continue
    instanceParts.push(
      `<g ${attrs({ transform: matrixToSvg(instanceMatrix(instance, def)) })}>${componentSvg(def, profile.componentStroke, instance.fields, { skipTexts: true })}</g>`
    )
    // Textes : hors de la transformation, droits ou tournés avec le composant, jamais en miroir.
    for (const placement of instanceTextPlacements(instance, def)) {
      const { primitive, box } = placement
      const layout = layoutTextBox(
        box,
        textContent(primitive, instance.fields),
        primitive.size,
        placement.anchor
      )
      const spans = layout.lines
        .map(
          (line) => `<tspan ${attrs({ x: layout.x, y: line.y })}>${escapeXml(line.text)}</tspan>`
        )
        .join('')
      componentTextParts.push(
        `<text ${attrs({ 'font-size': primitive.size, 'text-anchor': placement.anchor, fill: primitive.color, ...textStyleAttrs(primitive), transform: textPlacementTransform(placement) })}>${spans}</text>`
      )
    }
    if (options.labels && instance.label.length > 0) {
      const box = instanceBounds(instance, def)
      labelParts.push(
        `<text ${attrs({ x: box.x, y: box.y - 0.25, 'font-size': labelSize, fill: '#1f2328' })}>${escapeXml(instance.label)}</text>`
      )
    }
  }
  parts.push(`<g class="components">${instanceParts.join('')}</g>`)
  if (componentTextParts.length > 0) {
    parts.push(`<g class="component-texts">${componentTextParts.join('')}</g>`)
  }
  if (labelParts.length > 0) parts.push(`<g class="labels">${labelParts.join('')}</g>`)

  if (project.labels.length > 0) {
    const textParts = project.labels.map((label) => {
      const layout = layoutLabel(label, profile.cellPx)
      const spans = layout.lines
        .map(
          (line) => `<tspan ${attrs({ x: layout.x, y: line.y })}>${escapeXml(line.text)}</tspan>`
        )
        .join('')
      return `<text ${attrs({ 'font-size': label.size / profile.cellPx, 'font-weight': label.bold ? 'bold' : undefined, 'text-anchor': label.anchor, fill: '#1f2328' })}>${spans}</text>`
    })
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
  return { svg, widthPx, heightPx, widthCells, heightCells, originX: x0, originY: y0 }
}
