// Vue d'un canevas infini (montage, diagramme) : zoom et position de l'origine de la grille.
// Fonctions pures : les stores tiennent l'état, les canevas dessinent.

/** Rectangle en cellules visé par l'ajustement ; même forme que `GridRect` du placement. */
interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewState {
  /** Facteur appliqué à la taille de cellule de base. */
  zoom: number
  /** Position, en pixels d'écran, de l'origine de la grille. */
  panX: number
  panY: number
}

export interface ViewportSize {
  width: number
  height: number
}

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 6
export const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 80, panY: 80 }
/** Marge laissée autour du contenu par l'ajustement, en cellules. */
export const FIT_MARGIN_CELLS = 2
/** En dessous de cette taille de cellule à l'écran, la grille n'est plus dessinée. */
export const MIN_GRID_PX = 6

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * Vue zoomée d'un facteur autour d'un point d'écran, qui reste sur le même point de la grille ;
 * la même vue si le zoom est déjà en butée. `baseCellPx` est la cellule à 100 %.
 */
export function zoomedView(
  view: ViewState,
  factor: number,
  anchorX: number,
  anchorY: number,
  baseCellPx: number
): ViewState {
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom) return view
  const worldX = (anchorX - view.panX) / (baseCellPx * view.zoom)
  const worldY = (anchorY - view.panY) / (baseCellPx * view.zoom)
  return {
    zoom,
    panX: anchorX - worldX * baseCellPx * zoom,
    panY: anchorY - worldY * baseCellPx * zoom
  }
}

export function pannedView(view: ViewState, dx: number, dy: number): ViewState {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy }
}

/** Vue qui montre tout `bounds`, centré, avec une marge ; la vue par défaut s'il n'y a rien. */
export function fittingView(
  bounds: ViewBounds | null,
  viewport: ViewportSize,
  baseCellPx: number
): ViewState {
  if (!bounds) return { ...DEFAULT_VIEW }
  const width = bounds.width + 2 * FIT_MARGIN_CELLS
  const height = bounds.height + 2 * FIT_MARGIN_CELLS
  const zoom = clampZoom(
    Math.min(viewport.width / (width * baseCellPx), viewport.height / (height * baseCellPx))
  )
  const scale = baseCellPx * zoom
  return {
    zoom,
    panX: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    panY: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale
  }
}

export interface GridLine {
  /** Position à l'écran, en pixels. */
  px: number
  /** Une ligne sur cinq est plus marquée. */
  major: boolean
}

/** Lignes de la grille visibles dans la fenêtre, en pixels d'écran ; aucune si la cellule est trop petite. */
export function gridLines(
  view: ViewState,
  cellPx: number,
  viewport: ViewportSize
): { xs: GridLine[]; ys: GridLine[] } {
  if (cellPx < MIN_GRID_PX) return { xs: [], ys: [] }
  const xs: GridLine[] = []
  for (
    let i = Math.floor(-view.panX / cellPx);
    i <= Math.ceil((viewport.width - view.panX) / cellPx);
    i++
  ) {
    xs.push({ px: view.panX + i * cellPx, major: i % 5 === 0 })
  }
  const ys: GridLine[] = []
  for (
    let j = Math.floor(-view.panY / cellPx);
    j <= Math.ceil((viewport.height - view.panY) / cellPx);
    j++
  ) {
    ys.push({ px: view.panY + j * cellPx, major: j % 5 === 0 })
  }
  return { xs, ys }
}

/** Point de la grille (cellules, flottant) sous un point d'écran. */
export function screenToWorld(
  view: ViewState,
  cellPx: number,
  screenX: number,
  screenY: number
): { x: number; y: number } {
  return { x: (screenX - view.panX) / cellPx, y: (screenY - view.panY) / cellPx }
}
