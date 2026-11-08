import type { ComponentDefinition, Primitive } from './component'
import { computeConnectivity, projectPins, type FreeEnd } from './connectivity'
import { QUARTERS_PER_CELL, type GridPoint } from './grid'
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

/** Une forme du mini-éditeur, en unités de cellule. */
export function primitiveSvg(primitive: Primitive): string {
  if (primitive.kind === 'text') {
    return `<text ${attrs({
      x: q(primitive.x),
      y: q(primitive.y),
      'font-size': primitive.size,
      'text-anchor': primitive.anchor,
      fill: primitive.color,
      'dominant-baseline': 'middle',
      'font-family': FONT_STACK
    })}>${escapeXml(primitive.text)}</text>`
  }
  const style = {
    stroke: primitive.style.stroke,
    'stroke-width': primitive.style.strokeWidth,
    fill: primitive.style.fill,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
  switch (primitive.kind) {
    case 'rect':
      return `<rect ${attrs({ x: q(primitive.x), y: q(primitive.y), width: q(primitive.w), height: q(primitive.h), rx: q(primitive.rx), ...style })}/>`
    case 'ellipse':
      return `<ellipse ${attrs({ cx: q(primitive.cx), cy: q(primitive.cy), rx: q(primitive.rx), ry: q(primitive.ry), ...style })}/>`
    case 'line':
      return `<line ${attrs({ x1: q(primitive.x1), y1: q(primitive.y1), x2: q(primitive.x2), y2: q(primitive.y2), ...style })}/>`
    case 'polyline': {
      const points = primitive.points.map(([x, y]) => `${fmt(q(x))},${fmt(q(y))}`).join(' ')
      const tag = primitive.closed ? 'polygon' : 'polyline'
      return `<${tag} ${attrs({ points, ...style })}/>`
    }
  }
}

/** Contenu d'un composant dans son repère local (cellules), PNG ou formes. */
export function componentSvg(def: ComponentDefinition): string {
  const { widthCells, heightCells } = def.size
  if (def.visual.kind === 'drawing') return def.visual.primitives.map(primitiveSvg).join('')
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
      `<g ${attrs({ transform: matrixToSvg(instanceMatrix(instance, def)) })}>${componentSvg(def)}</g>`
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
