import {
  pinLabelSide,
  type Box,
  type ComponentDefinition,
  type LabelSide,
  type LocalPoint,
  type Pin
} from '@/domain'

// Repères des broches dans l'éditeur de composants : texte, côté, boîte estimée, et ce qui en
// découle pour le canevas. Un repère a une taille fixe à l'écran : quand il dépasse de la boîte du
// composant, la marge du canevas s'élargit pour le contenir, et l'ajustement à la fenêtre en tient
// compte. Partagé par le canevas (dessin) et le store (ajustement).

export interface LabelOffset {
  dx: number
  dy: number
  anchor: 'start' | 'middle' | 'end'
}

export const PIN_LABEL_FONT_PX = 22

/** Décalage du repère en pixels, par côté, depuis le centre de la broche. */
export const PIN_LABEL_OFFSETS: Record<LabelSide, LabelOffset> = {
  left: { dx: -16, dy: 0, anchor: 'end' },
  right: { dx: 16, dy: 0, anchor: 'start' },
  top: { dx: 0, dy: -22, anchor: 'middle' },
  bottom: { dx: 0, dy: 24, anchor: 'middle' }
}

/** Marge du canevas autour de la boîte du composant : au moins une cellule. */
const CANVAS_MARGIN_CELLS = 1
/** Espace gardé entre un repère et le bord du canevas, en pixels. */
const LABEL_CLEARANCE_PX = 8

export function pinLabelText(pin: Pin, index: number): string {
  return `${index + 1}${pin.name !== String(index + 1) ? ` · ${pin.name}` : ''}`
}

/** Boîte du repère pour un côté, en cellules, d'après une largeur de caractère moyenne. */
export function pinLabelBox(point: LocalPoint, text: string, side: LabelSide, cellPx: number): Box {
  const width = (text.length * 0.55 * PIN_LABEL_FONT_PX) / cellPx
  const height = (PIN_LABEL_FONT_PX * 1.1) / cellPx
  const offset = PIN_LABEL_OFFSETS[side]
  const centerX = point.x + offset.dx / cellPx
  const centerY = point.y + offset.dy / cellPx
  const x =
    offset.anchor === 'start'
      ? centerX
      : offset.anchor === 'end'
        ? centerX - width
        : centerX - width / 2
  return { x, y: centerY - height / 2, w: width, h: height }
}

/**
 * Côté du repère d'une broche placée en `point` : le côté libre le plus proche du bord, sinon le
 * bord le plus proche (`pinLabelSide`).
 */
export function pinLabelSideAt(
  def: ComponentDefinition,
  pin: Pin,
  index: number,
  point: LocalPoint,
  cellPx: number
): LabelSide {
  const text = pinLabelText(pin, index)
  const primitives = def.visual.kind === 'drawing' ? def.visual.primitives : []
  return pinLabelSide(point, def.size, primitives, (side) => pinLabelBox(point, text, side, cellPx))
}

/** Débord des repères hors de la boîte du composant, en pixels, horizontalement et verticalement. */
export function pinLabelOverhang(
  def: ComponentDefinition,
  cellPx: number
): { x: number; y: number } {
  let x = 0
  let y = 0
  def.pins.forEach((pin, index) => {
    const side = pinLabelSideAt(def, pin, index, pin, cellPx)
    const box = pinLabelBox(pin, pinLabelText(pin, index), side, cellPx)
    x = Math.max(x, -box.x * cellPx, (box.x + box.w - def.size.widthCells) * cellPx)
    y = Math.max(y, -box.y * cellPx, (box.y + box.h - def.size.heightCells) * cellPx)
  })
  return { x: Math.ceil(x), y: Math.ceil(y) }
}

/** Marges du canevas autour de la boîte, en pixels : une cellule, ou la place des repères. */
export function canvasMargins(def: ComponentDefinition, cellPx: number): { x: number; y: number } {
  const overhang = pinLabelOverhang(def, cellPx)
  return {
    x: Math.max(CANVAS_MARGIN_CELLS * cellPx, overhang.x + LABEL_CLEARANCE_PX),
    y: Math.max(CANVAS_MARGIN_CELLS * cellPx, overhang.y + LABEL_CLEARANCE_PX)
  }
}

/**
 * Taille de cellule qui fait tenir la boîte du composant et ses marges (`canvasMargins`) dans la
 * zone donnée, arrondie vers le bas. Le côté choisi par un repère dépend un peu de l'échelle : on
 * recalcule à l'échelle trouvée jusqu'à ce qu'elle ne bouge plus.
 */
export function fittingCellPx(
  def: ComponentDefinition,
  width: number,
  height: number,
  currentCellPx: number
): number {
  const columns = def.size.widthCells
  const rows = def.size.heightCells
  const fit = (reference: number): number => {
    const overhang = pinLabelOverhang(def, reference)
    const marginX = overhang.x + LABEL_CLEARANCE_PX
    const marginY = overhang.y + LABEL_CLEARANCE_PX
    return Math.floor(
      Math.min(
        width / (columns + 2 * CANVAS_MARGIN_CELLS),
        (width - 2 * marginX) / columns,
        height / (rows + 2 * CANVAS_MARGIN_CELLS),
        (height - 2 * marginY) / rows
      )
    )
  }
  let cellPx = Math.max(1, currentCellPx)
  for (let pass = 0; pass < 4; pass++) {
    const next = Math.max(1, fit(cellPx))
    if (next === cellPx) break
    cellPx = next
  }
  return cellPx
}
