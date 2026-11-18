import { arrowHeadPoints, middleArrowHead, pointsAttribute, trimForArrows } from './arrows'
import { wireEndLabelPlacement, wireRenderParts } from './wireEnds'
import {
  abuttingImages,
  discsPathData,
  dotRadiusCells,
  HOLE_COLOR,
  HOLE_OPACITY,
  HOLE_PAD_RADIUS_CELLS,
  HOLE_RADIUS_CELLS,
  holeCells,
  isFootprint,
  strokeWidthCells,
  type ComponentDefinition,
  type FieldValues,
  type Primitive,
  NO_ARROWS,
  layoutText,
  layoutTextBox,
  textContent,
  textEmphasisAttrs,
  textStyleAttrs,
  textTransform
} from './component'
import { boardFootprints } from './boardCarry'
import {
  boardFaces,
  THROUGH_MARK_COLOR,
  THROUGH_MARK_EDGE,
  THROUGH_MARK_EDGE_WIDTH,
  THROUGH_MARK_RADIUS,
  throughMarks,
  unsolderedMarks
} from './boardFaces'
import { computeConnectivity, projectPins, type FreeEnd } from './connectivity'
import { CROSSING_OVERLAP, crossingPieceEnds, crossingPieces } from './crossings'
import { FOOTPRINT_STYLE, footprintDashArray, footprintDrawing } from './footprint'
import { QUARTERS_PER_CELL, type GridPoint, type LocalPoint } from './grid'
import {
  facesFlip,
  facesGap,
  facesHinge,
  HINGE_STYLE,
  instanceBounds,
  instanceMatrix,
  matrixToSvg,
  projectBounds,
  showsUnderside,
  unionRects,
  layoutLabel,
  instanceTextPlacements,
  textPlacementTransform
} from './placement'
import { instanceDefinition, type Project } from './project'
import { roundedPathData } from './roundedPath'
import type { ExportSettings } from './settings'
import { junctionDot, projectStyleSheet, styleOf } from './styles'
import {
  jumperPathData,
  jointRadius,
  SOLDER_GLINT,
  SOLDER_SCALE,
  SOLDER_SHADE,
  solderMark,
  wireBorder
} from './wireKinds'
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

/** Attributs SVG d'un élément : les valeurs indéfinies sont omises, les nombres arrondis. */
export function svgAttrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${key}="${escapeXml(typeof value === 'number' ? fmt(value) : String(value))}"`
    )
    .join(' ')
}

const attrs = svgAttrs

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

/**
 * Débord d'une image sur sa voisine de droite ou du dessous, en cellules (`abuttingImages`) : un
 * demi-pixel d'une image exportée à ×1, assez pour qu'aucun filet de fond ne passe entre les
 * tranches d'un composant étiré quand le SVG est regardé à une autre échelle.
 */
const IMAGE_LAP = 0.025

/**
 * Une forme du mini-éditeur, en unités de cellule. `lap` agrandit une image vers la droite et
 * vers le bas, quand une autre la suit de ce côté.
 */
export function primitiveSvg(
  primitive: Primitive,
  componentStroke: number,
  fields?: FieldValues,
  lap: { right: number; below: number } = { right: 0, below: 0 }
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
  if (primitive.kind === 'holes') {
    // Une plaque : toutes ses pastilles en un tracé, tous ses trous en un autre.
    const cells = holeCells(primitive)
    if (cells.length === 0) return ''
    return (
      `<path ${attrs({ d: discsPathData(cells, HOLE_PAD_RADIUS_CELLS), fill: primitive.color })}/>` +
      `<path ${attrs({ d: discsPathData(cells, HOLE_RADIUS_CELLS), fill: HOLE_COLOR, 'fill-opacity': HOLE_OPACITY })}/>`
    )
  }
  if (primitive.kind === 'image') {
    const box = {
      x: q(primitive.x),
      y: q(primitive.y),
      width: q(primitive.w),
      height: q(primitive.h)
    }
    // Sans son image (fichier perdu) : un cadre gris à sa place.
    if (!primitive.dataUrl) {
      return `<rect ${attrs({ ...box, fill: '#eef1f4', stroke: '#8c959f', 'stroke-width': 0.05 })}/>`
    }
    box.width += lap.right
    box.height += lap.below
    const crop = primitive.crop
    if (crop) {
      // Une tranche de l'image (composant étiré) : l'image remplit un carré d'une unité, dont
      // la fenêtre de ce petit SVG ne montre que la tranche voulue.
      const whole = attrs({
        href: primitive.dataUrl,
        'xlink:href': primitive.dataUrl,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        preserveAspectRatio: 'none'
      })
      return `<svg ${attrs({
        ...box,
        viewBox: `${crop.x} ${crop.y ?? 0} ${crop.w} ${crop.h ?? 1}`,
        preserveAspectRatio: 'none'
      })}><image ${whole}/></svg>`
    }
    return `<image ${attrs({
      href: primitive.dataUrl,
      'xlink:href': primitive.dataUrl,
      ...box,
      preserveAspectRatio: 'none'
    })}/>`
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

/**
 * Contenu d'un composant dans son repère local (cellules) : ses formes, images comprises, sans
 * ses empreintes, qui ne se dessinent que sur l'autre face d'une plaque (`footprintSvg`).
 */
export function componentSvg(
  def: ComponentDefinition,
  componentStroke: number,
  fields?: FieldValues,
  options: { skipTexts?: boolean } = {}
): string {
  const shown = def.visual.primitives.filter(
    (primitive) => !(options.skipTexts && primitive.kind === 'text') && !isFootprint(primitive)
  )
  const lapped = abuttingImages(shown)
  return shown
    .map((primitive, index) =>
      primitiveSvg(primitive, componentStroke, fields, {
        right: lapped.right.has(index) ? IMAGE_LAP : 0,
        below: lapped.below.has(index) ? IMAGE_LAP : 0
      })
    )
    .join('')
}

/**
 * L'empreinte d'un composant, dans son repère local (cellules) : la silhouette de toutes ses
 * formes d'empreinte réunies, dans l'allure commune aux empreintes (footprint.ts). Un voile
 * sombre la remplit ; un filet sombre que recouvrent des tirets clairs la cerne. Les traits sont
 * tracés deux fois trop épais et le masque en retire tout ce qui tombe dans une forme : il n'en
 * reste que la moitié extérieure, le contour de l'ensemble, sans les côtés que deux formes
 * partagent ni ce qu'une forme en recouvre d'une autre. Vide si le dessin n'a pas d'empreinte.
 */
export function footprintSvg(primitives: readonly Primitive[], maskId: string): string {
  const drawing = footprintDrawing(primitives)
  if (!drawing) return ''
  const look = FOOTPRINT_STYLE
  const closed = drawing.shapes.filter((shape) => shape.closed)
  const solid = (color: string): string =>
    closed
      .map(
        (shape) =>
          `<path ${attrs({ d: shape.d, fill: color, stroke: color, 'stroke-width': look.seam })}/>`
      )
      .join('')
  // Une forme ouverte (une ligne) n'a pas d'intérieur : son trait reste entier.
  const stroked = (extra: Record<string, string | number>): string =>
    drawing.shapes
      .map(
        (shape) =>
          `<path ${attrs({ d: shape.d, 'stroke-width': shape.closed ? 2 * look.width : look.width, ...extra })}/>`
      )
      .join('')
  const mask = `<mask ${attrs({ id: maskId, maskUnits: 'userSpaceOnUse', ...drawing.box })}><rect ${attrs({ ...drawing.box, fill: '#ffffff' })}/>${solid('#000000')}</mask>`
  return (
    `<g ${attrs({ opacity: look.shadowOpacity })}>${solid(look.dark)}</g>` +
    mask +
    `<g ${attrs({ mask: `url(#${maskId})`, fill: 'none' })}>` +
    stroked({ stroke: look.dark, 'stroke-opacity': look.darkOpacity }) +
    stroked({ stroke: look.light, 'stroke-dasharray': footprintDashArray() }) +
    '</g>'
  )
}

/** Petite flèche au bout d'une extrémité libre « prolongée », dans la direction du dernier segment. */
export function buildProjectSvg(project: Project, options: ExportSettings): SvgExport | null {
  let bounds = projectBounds(project)
  if (!bounds) return null
  if (options.labels) {
    // Les repères s'écrivent juste au-dessus des boîtes : on leur réserve une cellule.
    for (const instance of project.components) {
      const def = instanceDefinition(project, instance)
      if (!def || instance.label.length === 0) continue
      const box = instanceBounds(instance, def)
      bounds = unionRects(bounds, { x: box.x, y: box.y - 1, width: 1, height: 1 })
    }
  }
  // Plaques à deux faces, et les composants qui montrent leur empreinte sur l'autre face de la
  // leur : l'image garde la place de ces empreintes.
  const faces = boardFaces(project)
  const footprints = boardFootprints(project, faces)
  for (const instance of project.components) {
    const carrier = footprints.get(instance.id)
    const def = carrier ? instanceDefinition(project, instance) : undefined
    if (!carrier || !def) continue
    const box = instanceBounds(instance, def)
    bounds = unionRects(bounds, { ...box, x: carrier.flip - box.x - box.width })
  }
  const margin = options.marginCells
  const x0 = bounds.x - margin
  const y0 = bounds.y - margin
  const widthCells = bounds.width + 2 * margin
  const heightCells = bounds.height + 2 * margin
  const profile = project.profile
  // Un élément qui a son propre style se dessine avec lui ; les autres, avec celui du montage.
  const sheet = projectStyleSheet(project)
  /** Police à écrire sur un texte : rien si c'est celle du montage, que porte la racine du SVG. */
  const ownFamily = (family: string): { 'font-family'?: string } =>
    family === profile.labelFont.family ? {} : { 'font-family': `${family}, sans-serif` }
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

  // Plaques à deux faces : ce qui relie leurs faces, et ce qui ressort de l'une sur l'autre.
  const pins = projectPins(project, faces)
  const connectivity = computeConnectivity(project.wires, pins, faces.twins)
  // Une patte soudée à un fil nu montre la goutte de soudure du fil, pas sa marque.
  const through = unsolderedMarks(throughMarks(project.wires, pins, faces), connectivity.solders)

  // Composants : dans l'ordre du montage, ceux qu'on a mis derrière les fils avant les fils, les
  // autres après. Leurs textes les suivent ; les libellés (R1, U2) restent au-dessus de tout.
  const labelParts: string[] = []
  const componentLayer = (behind: boolean): string[] => {
    // Chaque composant puis ses textes, dans l'ordre du montage : le dernier est au-dessus, et
    // un composant posé sur un autre cache aussi ses textes.
    const instanceParts: string[] = []
    for (const instance of project.components) {
      const def = instanceDefinition(project, instance)
      if (!def || instance.behindWires !== behind) continue
      const style = styleOf(sheet, instance)
      const drawing = `<g ${attrs({ transform: matrixToSvg(instanceMatrix(instance, def)) })}>${componentSvg(def, style.componentStroke, instance.fields, { skipTexts: true })}</g>`
      instanceParts.push(drawing)
      if (showsUnderside(instance, def)) {
        // Le dessous d'une plaque, à sa droite : le même dessin retourné, sans ses textes.
        const flip = facesFlip(instanceBounds(instance, def), facesGap(instance))
        instanceParts.push(
          `<g ${attrs({ class: 'underside', transform: `matrix(-1 0 0 1 ${fmt(flip)} 0)` })}>${drawing}</g>`
        )
        // Sur l'autre face, l'empreinte des composants que la plaque porte : une silhouette par
        // composant, sous les pattes qui y ressortent.
        for (const part of project.components) {
          if (footprints.get(part.id)?.id !== instance.id) continue
          const partDef = instanceDefinition(project, part)
          if (!partDef) continue
          const shadow = footprintSvg(partDef.visual.primitives, `empreinte-${part.id}`)
          instanceParts.push(
            `<g ${attrs({ class: 'footprint', transform: `matrix(-1 0 0 1 ${fmt(flip)} 0)` })}><g ${attrs({ transform: matrixToSvg(instanceMatrix(part, partDef)) })}>${shadow}</g></g>`
          )
        }
      }
      // Sur ses pastilles, ce qui ressort de l'autre face : un point de couleur vive.
      const marks = through.filter((mark) => mark.board === instance.id)
      if (marks.length > 0) {
        const drops = marks.map(
          (mark) =>
            `<circle ${attrs({
              cx: mark.point[0],
              cy: mark.point[1],
              r: THROUGH_MARK_RADIUS,
              fill: THROUGH_MARK_COLOR,
              stroke: THROUGH_MARK_EDGE,
              'stroke-width': THROUGH_MARK_EDGE_WIDTH
            })}/>`
        )
        instanceParts.push(`<g class="through">${drops.join('')}</g>`)
      }
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
        instanceParts.push(
          `<text ${attrs({ 'font-size': primitive.size, 'text-anchor': placement.anchor, fill: primitive.color, ...textStyleAttrs(primitive), transform: textPlacementTransform(placement) })}>${spans}</text>`
        )
      }
      if (options.labels && instance.label.length > 0) {
        const box = instanceBounds(instance, def)
        labelParts.push(
          `<text ${attrs({ x: box.x, y: box.y - 0.25, 'font-size': style.labelFont.size / style.cellPx, ...ownFamily(style.labelFont.family), fill: '#1f2328' })}>${escapeXml(instance.label)}</text>`
        )
      }
    }
    const suffix = behind ? '-behind' : ''
    const layer: string[] = []
    if (instanceParts.length > 0 || !behind) {
      layer.push(`<g class="components${suffix}">${instanceParts.join('')}</g>`)
    }
    return layer
  }
  // Le pli entre les deux faces de chaque plaque qui montre son dessous : un trait pointillé,
  // et la flèche qui dit que la plaque de droite est celle de gauche, retournée. Sous tout le reste.
  const hingeParts = project.components.flatMap((instance) => {
    const def = instanceDefinition(project, instance)
    if (!def || !showsUnderside(instance, def)) return []
    const hinge = facesHinge(instanceBounds(instance, def), facesGap(instance))
    const lines = hinge.spans.map(
      ([y1, y2]) =>
        `<line ${attrs({ x1: hinge.x, y1, x2: hinge.x, y2, 'stroke-width': HINGE_STYLE.width, 'stroke-dasharray': HINGE_STYLE.dash })}/>`
    )
    return [
      ...lines,
      `<path ${attrs({ d: hinge.arc, 'stroke-width': HINGE_STYLE.arrowWidth, 'stroke-linecap': 'round' })}/>`,
      `<polygon ${attrs({ points: hinge.head, fill: HINGE_STYLE.color, stroke: 'none' })}/>`
    ]
  })
  if (hingeParts.length > 0) {
    parts.push(
      `<g ${attrs({ class: 'faces-hinge', fill: 'none', stroke: HINGE_STYLE.color })}>${hingeParts.join('')}</g>`
    )
  }

  parts.push(...componentLayer(true))

  const freeEndsByWire = new Map<string, FreeEnd[]>()
  for (const end of connectivity.freeEnds) {
    const list = freeEndsByWire.get(end.wireId) ?? []
    list.push(end)
    freeEndsByWire.set(end.wireId, list)
  }

  const wires = [...project.wires].sort((a, b) => a.stack - b.stack)
  const wireById = new Map(project.wires.map((wire) => [wire.id, wire]))
  const wireParts: string[] = []
  const endLabelParts: string[] = []
  // Gouttes de soudure des fils nus, par fil : leur cerne se dessine avec la bordure du fil.
  const soldersByWire = new Map<string, GridPoint[]>()
  for (const solder of connectivity.solders) {
    const list = soldersByWire.get(solder.wireId) ?? []
    list.push(solder.point)
    soldersByWire.set(solder.wireId, list)
  }
  /** Le trait d'un fil, seul : ce qu'on repeint à un raccord, par-dessus les bordures. */
  const bodyOf = new Map<string, string>()
  for (const wire of wires) {
    const style = styleOf(sheet, wire)
    const width = style.wireWidth
    const border = wireBorder(style, wire)
    const outer = border ? width + 2 * border.width : width
    const free = freeEndsByWire.get(wire.id) ?? []
    const flags = {
      start: free.some((end) => end.endIndex === 0),
      end: free.some((end) => end.endIndex === wire.points.length - 1)
    }
    const ink = wire.color
    // Sa bordure d'abord, juste sous lui : un fil qui passe sur un autre la garde.
    const under: string[] = []
    const over: string[] = []
    if (wire.kind === 'jumper') {
      // Un pont : une courbe de A à B, sans flèche ni pointillés.
      const d = jumperPathData(wire.points)
      if (border) {
        under.push(
          `<path ${attrs({ d, fill: 'none', stroke: border.color, 'stroke-width': outer, 'stroke-linecap': 'round' })}/>`
        )
      }
      const body = `<path ${attrs({
        d,
        fill: 'none',
        stroke: ink,
        'stroke-width': width,
        'stroke-linecap': 'round'
      })}/>`
      over.push(body)
      bodyOf.set(wire.id, body)
      wireParts.push(...under, ...over)
      continue
    }
    const shown = wireRenderParts(wire.points, wire.freeEnds, flags, width)
    if (shown.body.length >= 2) {
      const d = wirePathData(shown.body, style.cornerRadius)
      // Bordé, un fil a les bouts ronds, comme à l'écran : sa bordure en fait le tour.
      const cap = border ? 'round' : 'butt'
      if (border) {
        under.push(
          `<path ${attrs({
            d,
            fill: 'none',
            stroke: border.color,
            'stroke-width': outer,
            'stroke-linecap': cap,
            'stroke-linejoin': 'round'
          })}/>`
        )
      }
      const body = `<path ${attrs({
        d,
        fill: 'none',
        stroke: ink,
        'stroke-width': width,
        'stroke-linecap': cap,
        'stroke-linejoin': 'round'
      })}/>`
      over.push(body)
      bodyOf.set(wire.id, body)
    }
    for (const tail of shown.dotted) {
      const d = wirePathData(tail, style.cornerRadius)
      const dots = {
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-dasharray': `0 ${fmt(width * 2)}`
      }
      if (border) {
        under.push(`<path ${attrs({ d, stroke: border.color, 'stroke-width': outer, ...dots })}/>`)
      }
      over.push(`<path ${attrs({ d, stroke: ink, 'stroke-width': width, ...dots })}/>`)
    }
    for (const head of shown.heads) {
      if (border) {
        under.push(
          `<polygon ${attrs({
            points: pointsAttribute(head),
            fill: border.color,
            stroke: border.color,
            'stroke-width': border.width * 2,
            'stroke-linejoin': 'round'
          })}/>`
        )
      }
      over.push(`<polygon ${attrs({ points: pointsAttribute(head), fill: ink })}/>`)
    }
    if (border) {
      // Le cerne de ses gouttes de soudure et de ses points d'étiquette, avec sa bordure.
      for (const [cx, cy] of soldersByWire.get(wire.id) ?? []) {
        under.push(
          `<circle ${attrs({ cx, cy, r: width * SOLDER_SCALE + border.width, fill: border.color })}/>`
        )
      }
      for (const end of free) {
        const text = end.endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
        if (text.length === 0 || !wireEndLabelPlacement(wire.points, end.endIndex)) continue
        under.push(
          `<circle ${attrs({ cx: end.point[0], cy: end.point[1], r: width + border.width, fill: border.color })}/>`
        )
      }
    }
    wireParts.push(...under, ...over)
    // Étiquettes d'extrémité : un point sur le bout libre, le texte dans le prolongement du fil.
    for (const end of free) {
      const text = end.endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
      const placement = text.length > 0 ? wireEndLabelPlacement(wire.points, end.endIndex) : null
      if (!placement) continue
      endLabelParts.push(
        `<circle ${attrs({ cx: end.point[0], cy: end.point[1], r: width, fill: ink })}/>`
      )
      endLabelParts.push(
        `<text ${attrs({
          x: placement.x,
          y: placement.y,
          'font-family': style.endLabelFont.family,
          'font-size': style.endLabelFont.size / style.cellPx,
          'font-weight': 'bold',
          'text-anchor': placement.anchor,
          'dominant-baseline': placement.baseline,
          fill: '#1f2328'
        })}>${escapeXml(text)}</text>`
      )
    }
  }
  // Points de jonction, et gouttes de soudure des fils nus sur chaque broche de leur trajet.
  const junctionDots = new Map(
    connectivity.junctions.map((junction) => [
      `${junction.point[0]},${junction.point[1]}`,
      junctionDot(junction, project.wires, sheet)
    ])
  )
  const junctionParts = connectivity.junctions.map((junction) => {
    const dot = junctionDots.get(`${junction.point[0]},${junction.point[1]}`)
    const [cx, cy] = junction.point
    return `<circle ${attrs({ cx, cy, r: dot?.radius ?? 0, fill: dot?.color ?? '#000000' })}/>`
  })
  const solderParts = connectivity.solders.map((solder) => {
    const wire = wireById.get(solder.wireId)
    const style = wire ? styleOf(sheet, wire) : profile
    const radius = style.wireWidth * SOLDER_SCALE
    const [cx, cy] = solder.point
    const mark = solderMark(cx, cy, radius)
    return (
      `<circle ${attrs({ cx, cy, r: radius, fill: wire ? wire.color : '#000000' })}/>` +
      `<path ${attrs({
        d: mark.shade,
        fill: 'none',
        stroke: SOLDER_SHADE.color,
        'stroke-opacity': SOLDER_SHADE.opacity,
        'stroke-width': mark.shadeWidth,
        'stroke-linecap': 'round'
      })}/>` +
      `<circle ${attrs({ ...mark.glint, fill: SOLDER_GLINT.color, 'fill-opacity': SOLDER_GLINT.opacity })}/>`
    )
  })

  // Raccords : là où des fils bordés se touchent, leurs traits sont repeints dans un petit
  // disque, par-dessus les bordures qui les couperaient ; le point de jonction y a la sienne.
  const stackOrder = new Map(wires.map((wire, index) => [wire.id, index]))
  const jointParts: string[] = []
  connectivity.joints.forEach((joint, index) => {
    const joined = joint.wireIds
      .flatMap((id) => {
        const wire = wireById.get(id)
        return wire ? [wire] : []
      })
      .sort((a, b) => (stackOrder.get(a.id) ?? 0) - (stackOrder.get(b.id) ?? 0))
    const borders = joined.map((wire) => wireBorder(styleOf(sheet, wire), wire))
    if (!borders.some((border) => border !== null)) return
    const [cx, cy] = joint.point
    const dot = junctionDots.get(`${cx},${cy}`)
    const ring = dot?.border ? dot.radius + dot.border.width : 0
    const outers = joined.map(
      (wire, rank) => styleOf(sheet, wire).wireWidth + 2 * (borders[rank]?.width ?? 0)
    )
    const id = `raccord-${index}`
    jointParts.push(
      `<clipPath ${attrs({ id })}><circle ${attrs({ cx, cy, r: jointRadius(outers, ring) })}/></clipPath>`
    )
    if (dot?.border) {
      jointParts.push(`<circle ${attrs({ cx, cy, r: ring, fill: dot.border.color })}/>`)
    }
    const bodies = joined.map((wire) => bodyOf.get(wire.id) ?? '').join('')
    jointParts.push(`<g ${attrs({ 'clip-path': `url(#${id})` })}>${bodies}</g>`)
  })

  parts.push(`<g class="wires">${wireParts.join('')}</g>`)
  if (jointParts.length > 0) parts.push(`<g class="wire-joints">${jointParts.join('')}</g>`)
  if (endLabelParts.length > 0) parts.push(`<g class="end-labels">${endLabelParts.join('')}</g>`)

  // Croisements : le fil du dessus est redessiné sur une demi-cellule de part et d'autre, avec sa
  // bordure, ou un liseré couleur de fond s'il n'en a pas : l'ordre reste lisible même entre
  // deux fils de même couleur.
  const haloColor =
    options.background === 'transparent'
      ? null
      : options.background === 'white'
        ? '#ffffff'
        : options.background
  const crossingParts = crossingPieces(project.wires, project.crossingOverrides).map((piece) => {
    // Le fil du dessus se redessine dans son épaisseur à lui, avec sa bordure.
    const top = wireById.get(piece.topWireId)
    const style = top ? styleOf(sheet, top) : profile
    const width = style.wireWidth
    const border = top ? wireBorder(style, top) : null
    const outer = border ? width + 2 * border.width : width
    const span = (reach: number): Record<string, number> => {
      const [[x1, y1], [x2, y2]] = crossingPieceEnds(piece, reach)
      return { x1, y1, x2, y2 }
    }
    // Sans bordure, un liseré de la couleur du fond détache le fil du dessus ; bordé, sa
    // bordure le fait, et le fil du dessous va jusqu'à elle.
    const halo =
      haloColor && !border
        ? `<line ${attrs({ ...span(0.5), stroke: haloColor, 'stroke-width': width * 2.2 })}/>`
        : ''
    // Le fil dépasse un peu sa bordure à chaque bout : pas de filet en travers.
    const edge = border
      ? `<line ${attrs({ ...span(0.5), stroke: border.color, 'stroke-width': outer })}/>`
      : ''
    const line = `<line ${attrs({
      ...span(border ? 0.5 + CROSSING_OVERLAP : 0.5),
      stroke: top ? top.color : '#000000',
      'stroke-width': width
    })}/>`
    return halo + edge + line
  })
  if (crossingParts.length > 0) parts.push(`<g class="crossings">${crossingParts.join('')}</g>`)

  parts.push(`<g class="junctions">${junctionParts.join('')}</g>`)
  if (solderParts.length > 0) parts.push(`<g class="solders">${solderParts.join('')}</g>`)

  parts.push(...componentLayer(false))
  if (labelParts.length > 0) parts.push(`<g class="labels">${labelParts.join('')}</g>`)

  if (project.labels.length > 0) {
    // Couleur du fond de l'image ; blanc si elle est transparente.
    const paper =
      options.background === 'transparent' || options.background === 'white'
        ? '#ffffff'
        : options.background
    const textParts = project.labels.map((label) => {
      const layout = layoutLabel(label, profile.cellPx)
      const spans = layout.lines
        .map(
          (line) => `<tspan ${attrs({ x: layout.x, y: line.y })}>${escapeXml(line.text)}</tspan>`
        )
        .join('')
      // Fond optionnel : la boîte de l'étiquette, de la couleur du fond de l'image.
      const back = label.background
        ? `<rect ${attrs({ x: label.x, y: label.y, width: label.w, height: label.h, fill: paper })}/>`
        : ''
      return `${back}<text ${attrs({ 'font-size': label.size / profile.cellPx, ...ownFamily(styleOf(sheet, label).labelFont.family), 'text-anchor': label.anchor, fill: label.color, ...textEmphasisAttrs(label), transform: textTransform(label) })}>${spans}</text>`
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
