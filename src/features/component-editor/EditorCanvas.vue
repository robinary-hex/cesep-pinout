<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  DEFAULT_SHAPE_STYLE,
  dragHandle,
  groupOutline,
  nearestInsidePoint,
  nearestHandle,
  NO_ARROWS,
  primitiveBounds,
  primitiveHandles,
  boxHandles,
  resizeBox,
  QUARTERS_PER_CELL,
  translatePrimitive,
  type ComponentDefinition,
  type Box,
  type LocalPoint,
  type Pin,
  type PinKind,
  type Primitive
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import {
  canvasMargins,
  PIN_LABEL_FONT_PX,
  PIN_LABEL_OFFSETS,
  PIN_NUMBER_FONT_PX,
  pinLabelParts,
  pinLabelSideAt,
  pinNumberText,
  type LabelOffset
} from './pinLabelLayout'
import type { EditorMenuRequest, EditorMenuTarget } from './menu'
import { useComponentEditorStore } from './store'

// Canevas SVG de l'éditeur de composants : grille, formes, broches, contours des groupes,
// poignées, lasso, copies
// fantômes (Alt+glisser), aperçus de tracé. Les coordonnées souris sont converties en cellules
// puis en quarts de cellule ; le domaine ne reçoit que des entiers.

const store = useComponentEditorStore()
const emit = defineEmits<{ openMenu: [request: EditorMenuRequest] }>()
const library = useLibraryStore()
const svg = ref<SVGSVGElement | null>(null)
const scroller = ref<HTMLDivElement | null>(null)

const SCROLL_PADDING_PX = 24
const PIN_SNAP_CELLS = 0.75
const ZOOM_STEP = 1.1
const BAND_MIN_CELLS = 0.05
/** En deçà, à l'outil Broche, un appui relâché est un clic (une broche), pas une zone. */
const PIN_ZONE_MIN_CELLS = 0.4
/** Une intersection à moins de ça du bord de la zone tracée en fait partie. */
const PIN_ZONE_REACH_CELLS = 0.3
const PIN_COLORS: Record<PinKind, string> = {
  in: '#15803d',
  out: '#ea580c',
  io: '#1d4ed8',
  power: '#d62828'
}

const cell = computed(() => store.cellPx)
const quarter = computed(() => cell.value / QUARTERS_PER_CELL)
/** Marges autour de la boîte du composant : une cellule, ou la place des repères de broche. */
const margins = computed(() => canvasMargins(store.shown, cell.value))
const originX = computed(() => margins.value.x)
const originY = computed(() => margins.value.y)
const size = computed(() => store.shown.size)
const boxWidth = computed(() => size.value.widthCells * cell.value)
const boxHeight = computed(() => size.value.heightCells * cell.value)
const svgWidth = computed(() => boxWidth.value + 2 * originX.value)
const svgHeight = computed(() => boxHeight.value + 2 * originY.value)
const strokeBase = computed(() => library.defaultProfile.componentStroke)

interface QPoint {
  x: number
  y: number
}

type Drag =
  | {
      kind: 'box'
      tool: 'rect' | 'ellipse' | 'line'
      start: QPoint
      current: QPoint
      /** Maj enfoncée : carré ou cercle plutôt que rectangle ou ellipse. */
      square: boolean
    }
  | { kind: 'polyline'; points: QPoint[]; current: QPoint }
  | {
      kind: 'move-primitives'
      indexes: number[]
      /** Broches emmenées avec les formes : le déplacement se fait alors par cellules entières. */
      pinIds: string[]
      start: QPoint
      current: QPoint
      /** Alt+glisser : les originaux restent, une copie se dépose à l'arrivée. */
      duplicate: boolean
    }
  | { kind: 'move-pin'; id: string; current: LocalPoint }
  | { kind: 'handle'; index: number; handleId: string; original: Primitive; preview: Primitive }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; base: number[]; basePins: string[] }
  // Outil Broche : un simple clic pose une broche, un glisser trace la zone à en couvrir.
  | { kind: 'pin-zone'; start: LocalPoint; current: LocalPoint }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'text-box'; start: QPoint; current: QPoint }
  | { kind: 'resize-box'; handleId: string; preview: Box }

type Preview =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline'; points: string }

const drag = ref<Drag | null>(null)
/** Position du pointeur en cellules (flottant), null hors du canevas. */
const hover = ref<LocalPoint | null>(null)
/** Instant du dernier appui du bouton du milieu : deux appuis rapprochés ajustent le composant à la fenêtre. */
let lastMiddleDown = 0
const DOUBLE_CLICK_MS = 400

let observer: ResizeObserver | null = null

onMounted(() => {
  const element = scroller.value
  if (!element) return
  const update = (): void => {
    store.viewport = { width: element.clientWidth, height: element.clientHeight }
  }
  update()
  // Première ouverture de l'éditeur : le composant prend toute la zone disponible.
  store.fitToViewport()
  observer = new ResizeObserver(update)
  observer.observe(element)
})

onUnmounted(() => observer?.disconnect())

// Changer d'outil abandonne une boîte de texte dont le second coin n'est pas encore donné.
watch(
  () => store.tool,
  () => {
    if (drag.value?.kind === 'text-box') drag.value = null
  }
)

/** Ctrl enfoncée : sans sélection, les poignées de la boîte du composant apparaissent. */
const ctrlHeld = ref(false)
/** Espace enfoncée : glisser déplace la vue, comme sur le montage et le diagramme. */
const spaceHeld = ref(false)

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function onModifierKey(event: KeyboardEvent): void {
  ctrlHeld.value = event.ctrlKey
  if (event.key !== ' ') return
  if (event.type === 'keyup') {
    spaceHeld.value = false
  } else if (!isEditable(event.target)) {
    spaceHeld.value = true
    // Sans ceci, Espace ferait défiler la zone ou cliquerait le bouton qui a le focus.
    event.preventDefault()
  }
}

function onWindowBlur(): void {
  ctrlHeld.value = false
  spaceHeld.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onModifierKey)
  window.addEventListener('keyup', onModifierKey)
  window.addEventListener('blur', onWindowBlur)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onModifierKey)
  window.removeEventListener('keyup', onModifierKey)
  window.removeEventListener('blur', onWindowBlur)
})

function pointerCells(event: MouseEvent): LocalPoint {
  const element = svg.value
  if (!element) return { x: 0, y: 0 }
  const rect = element.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - originX.value) / cell.value,
    y: (event.clientY - rect.top - originY.value) / cell.value
  }
}

function toQuarters(point: LocalPoint): QPoint {
  return {
    x: Math.round(point.x * QUARTERS_PER_CELL),
    y: Math.round(point.y * QUARTERS_PER_CELL)
  }
}

const px = (quarters: number): number => quarters * quarter.value

const quarterDots = computed(() => {
  const dots: LocalPoint[] = []
  for (let i = 0; i < QUARTERS_PER_CELL; i++) {
    for (let j = 0; j < QUARTERS_PER_CELL; j++) {
      if (i !== 0 || j !== 0) dots.push({ x: i * quarter.value, y: j * quarter.value })
    }
  }
  return dots
})

/** Intersections de la boîte du composant, bord compris : cibles de l'outil Broche. */
const borderTargets = computed<LocalPoint[]>(() => {
  const points: LocalPoint[] = []
  for (let x = 0; x <= size.value.widthCells; x++) {
    for (let y = 0; y <= size.value.heightCells; y++) points.push({ x, y })
  }
  return points
})

const pinTarget = computed<LocalPoint | null>(() => {
  if (store.tool !== 'pin' || !hover.value) return null
  const nearest = nearestInsidePoint(hover.value, size.value)
  return nearest.distance <= PIN_SNAP_CELLS ? nearest.point : null
})

function isSelectedPin(id: string): boolean {
  return store.selectedPinIds.includes(id)
}

function pinPosition(pin: Pin): LocalPoint {
  const current = drag.value
  if (current?.kind === 'move-pin' && current.id === pin.id) return current.current
  if (
    current?.kind === 'move-primitives' &&
    !current.duplicate &&
    current.pinIds.includes(pin.id)
  ) {
    return {
      x: pin.x + (current.current.x - current.start.x) / QUARTERS_PER_CELL,
      y: pin.y + (current.current.y - current.start.y) / QUARTERS_PER_CELL
    }
  }
  return { x: pin.x, y: pin.y }
}

// Repère d'une broche : du côté libre le plus proche du bord, sinon du bord le plus proche
// (mise en page dans pinLabelLayout.ts, partagée avec l'ajustement à la fenêtre).

function pinLabel(pin: Pin, index: number): LabelOffset {
  return PIN_LABEL_OFFSETS[pinLabelSideAt(store.shown, pin, index, pinPosition(pin), cell.value)]
}

const pinLabels = computed(() => store.shown.pins.map((pin, index) => pinLabel(pin, index)))

function labelOf(index: number): LabelOffset {
  return pinLabels.value[index] ?? PIN_LABEL_OFFSETS.bottom
}

/** Décalage des originaux pendant un déplacement (pas pendant une copie). */
const moving = computed(() => {
  const current = drag.value
  return current?.kind === 'move-primitives' && !current.duplicate
    ? {
        indexes: current.indexes,
        dx: current.current.x - current.start.x,
        dy: current.current.y - current.start.y
      }
    : null
})

/** Copies fantômes pendant un Alt+glisser : les formes sélectionnées, décalées, en transparence. */
const ghostDef = computed<ComponentDefinition | null>(() => {
  const current = drag.value
  if (current?.kind !== 'move-primitives' || !current.duplicate) return null
  const dx = current.current.x - current.start.x
  const dy = current.current.y - current.start.y
  if (dx === 0 && dy === 0) return null
  const list = store.shown.visual.primitives
  const copies = current.indexes.flatMap((index) => {
    const primitive = list[index]
    return primitive ? [translatePrimitive(primitive, dx, dy)] : []
  })
  return { ...store.shown, visual: { kind: 'drawing', primitives: copies } }
})

const handlePreview = computed(() => {
  const current = drag.value
  return current?.kind === 'handle' ? { index: current.index, primitive: current.preview } : null
})

function primitiveAt(index: number): Primitive | null {
  return store.shown.visual.primitives[index] ?? null
}

/** Une forme telle qu'affichée (aperçu de poignée compris). */
function shownPrimitive(index: number): Primitive | null {
  const preview = handlePreview.value
  if (preview && preview.index === index) return preview.primitive
  return primitiveAt(index)
}

/** Cadres en pointillés des formes sélectionnées, décalés pendant un déplacement. */
const selectionBoxes = computed(() => {
  const offset = moving.value
  return store.selectedIndexes.flatMap((index) => {
    const primitive = shownPrimitive(index)
    if (!primitive) return []
    const bounds = primitiveBounds(primitive)
    const dx = offset && offset.indexes.includes(index) ? offset.dx : 0
    const dy = offset && offset.indexes.includes(index) ? offset.dy : 0
    return [
      {
        index,
        x: px(bounds.x1 + dx) - 4,
        y: px(bounds.y1 + dy) - 4,
        width: px(bounds.x2 - bounds.x1) + 8,
        height: px(bounds.y2 - bounds.y1) + 8
      }
    ]
  })
})

/** Marge du contour d'un groupe autour de ses membres, en pixels. */
const GROUP_MARGIN_PX = 9

/** Contours des groupes : la boîte de leurs formes et de leurs broches, telles qu'affichées. */
const groupOutlines = computed(() => {
  if (!store.showGroups) return []
  const offset = moving.value
  return store.groups.flatMap((group) => {
    const rects = group.indexes.flatMap((index) => {
      const primitive = shownPrimitive(index)
      if (!primitive) return []
      const bounds = primitiveBounds(primitive)
      const dx = offset && offset.indexes.includes(index) ? offset.dx : 0
      const dy = offset && offset.indexes.includes(index) ? offset.dy : 0
      return [
        {
          x: px(bounds.x1 + dx),
          y: px(bounds.y1 + dy),
          width: px(bounds.x2 - bounds.x1),
          height: px(bounds.y2 - bounds.y1)
        }
      ]
    })
    for (const pin of store.shown.pins) {
      if (!group.pinIds.includes(pin.id)) continue
      const at = pinPosition(pin)
      rects.push({ x: at.x * cell.value, y: at.y * cell.value, width: 0, height: 0 })
    }
    const outline = groupOutline(rects, GROUP_MARGIN_PX)
    return outline ? [{ id: group.id, ...outline }] : []
  })
})

/** Poignées : seulement pour une forme seule, hors déplacement. */
const handles = computed(() => {
  const indexes = store.selectedIndexes
  const index = indexes[0]
  if (
    indexes.length !== 1 ||
    index === undefined ||
    store.selectedPinIds.length > 0 ||
    store.tool !== 'select' ||
    drag.value
  ) {
    return []
  }
  const primitive = shownPrimitive(index)
  if (!primitive) return []
  return primitiveHandles(primitive).map((handle) => ({
    ...handle,
    px: px(handle.x),
    py: px(handle.y)
  }))
})

/** Boîte du composant, en cellules. */
const componentBox = computed<Box>(() => ({
  x: 0,
  y: 0,
  w: size.value.widthCells,
  h: size.value.heightCells
}))

/** Poignées de la boîte du composant : outil Sélection, rien de sélectionné, Ctrl enfoncée. */
const boxHandlesShown = computed(() => {
  const current = drag.value
  if (current?.kind !== 'resize-box') {
    if (store.tool !== 'select' || store.selection !== null || !ctrlHeld.value || current) return []
  }
  const box = current?.kind === 'resize-box' ? current.preview : componentBox.value
  return boxHandles(box).map((handle) => ({
    ...handle,
    px: handle.x * cell.value,
    py: handle.y * cell.value
  }))
})

/** Curseur d'une poignée : double flèche selon le coin ou le côté ; déplacement pour un sommet. */
function handleCursor(id: string): string {
  if (id === 'nw' || id === 'se') return 'nwse-resize'
  if (id === 'ne' || id === 'sw') return 'nesw-resize'
  if (id === 'e' || id === 'w') return 'ew-resize'
  if (id === 'n' || id === 's') return 'ns-resize'
  return 'move'
}

/** Arrivée d'un tracé rectangle/ellipse ; avec Maj, le côté le plus long s'impose aux deux axes. */
function boxEnd(box: Extract<Drag, { kind: 'box' }>): QPoint {
  if (!box.square || box.tool === 'line') return box.current
  const dx = box.current.x - box.start.x
  const dy = box.current.y - box.start.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: box.start.x + (dx >= 0 ? side : -side),
    y: box.start.y + (dy >= 0 ? side : -side)
  }
}

const preview = computed<Preview | null>(() => {
  const current = drag.value
  if (!current) return null
  if (current.kind === 'polyline') {
    return {
      kind: 'polyline',
      points: [...current.points, current.current].map((p) => `${px(p.x)},${px(p.y)}`).join(' ')
    }
  }
  if (current.kind === 'text-box') {
    const x1 = Math.min(current.start.x, current.current.x)
    const y1 = Math.min(current.start.y, current.current.y)
    const w = Math.max(1, Math.abs(current.current.x - current.start.x))
    const h = Math.max(1, Math.abs(current.current.y - current.start.y))
    return { kind: 'rect', x: px(x1), y: px(y1), width: px(w), height: px(h) }
  }
  if (current.kind === 'resize-box') {
    const box = current.preview
    return {
      kind: 'rect',
      x: box.x * cell.value,
      y: box.y * cell.value,
      width: box.w * cell.value,
      height: box.h * cell.value
    }
  }
  if (current.kind !== 'box') return null
  const end = boxEnd(current)
  if (current.tool === 'line') {
    return {
      kind: 'line',
      x1: px(current.start.x),
      y1: px(current.start.y),
      x2: px(end.x),
      y2: px(end.y)
    }
  }
  const x1 = Math.min(current.start.x, end.x)
  const y1 = Math.min(current.start.y, end.y)
  const x2 = Math.max(current.start.x, end.x)
  const y2 = Math.max(current.start.y, end.y)
  if (current.tool === 'rect') {
    return { kind: 'rect', x: px(x1), y: px(y1), width: px(x2 - x1), height: px(y2 - y1) }
  }
  return {
    kind: 'ellipse',
    cx: px((x1 + x2) / 2),
    cy: px((y1 + y2) / 2),
    rx: px((x2 - x1) / 2),
    ry: px((y2 - y1) / 2)
  }
})

/** Rectangle du lasso, en pixels du repère du composant. */
/** Le glisser de l'outil Broche a-t-il assez bougé pour être une zone ? */
function isPinZone(zone: { start: LocalPoint; current: LocalPoint }): boolean {
  return (
    Math.abs(zone.current.x - zone.start.x) > PIN_ZONE_MIN_CELLS ||
    Math.abs(zone.current.y - zone.start.y) > PIN_ZONE_MIN_CELLS
  )
}

/**
 * Intersections de la boîte prises dans une zone tracée à l'outil Broche, ligne par ligne ;
 * celles qui portent déjà une broche n'en font pas partie.
 */
function pinZonePoints(zone: { start: LocalPoint; current: LocalPoint }): LocalPoint[] {
  const reach = PIN_ZONE_REACH_CELLS
  const x1 = Math.max(0, Math.ceil(Math.min(zone.start.x, zone.current.x) - reach))
  const x2 = Math.min(
    size.value.widthCells,
    Math.floor(Math.max(zone.start.x, zone.current.x) + reach)
  )
  const y1 = Math.max(0, Math.ceil(Math.min(zone.start.y, zone.current.y) - reach))
  const y2 = Math.min(
    size.value.heightCells,
    Math.floor(Math.max(zone.start.y, zone.current.y) + reach)
  )
  const taken = new Set(store.shown.pins.map((pin) => `${pin.x},${pin.y}`))
  const points: LocalPoint[] = []
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) if (!taken.has(`${x},${y}`)) points.push({ x, y })
  }
  return points
}

/** Broches qu'une zone en cours de tracé poserait. */
const pinZoneTargets = computed<LocalPoint[]>(() => {
  const current = drag.value
  return current?.kind === 'pin-zone' && isPinZone(current) ? pinZonePoints(current) : []
})

/** Outil Broche, simple clic : une broche sur l'intersection la plus proche de la boîte. */
function placePin(cells: LocalPoint): void {
  const nearest = nearestInsidePoint(cells, size.value)
  if (nearest.distance > PIN_SNAP_CELLS) {
    store.status = 'Clique une intersection de la boîte du composant.'
    return
  }
  const taken = store.shown.pins.some(
    (pin) => pin.x === nearest.point.x && pin.y === nearest.point.y
  )
  if (taken) {
    store.status = 'Il y a déjà une broche sur cette intersection.'
    return
  }
  store.addPin(nearest.point)
}

const band = computed(() => {
  const current = drag.value
  if (current?.kind === 'pin-zone' && !isPinZone(current)) return null
  if (current?.kind !== 'band' && current?.kind !== 'pin-zone') return null
  const x1 = Math.min(current.start.x, current.current.x)
  const y1 = Math.min(current.start.y, current.current.y)
  const x2 = Math.max(current.start.x, current.current.x)
  const y2 = Math.max(current.start.y, current.current.y)
  return {
    x: x1 * cell.value,
    y: y1 * cell.value,
    width: (x2 - x1) * cell.value,
    height: (y2 - y1) * cell.value
  }
})

const hoverText = computed(() =>
  hover.value ? `x ${hover.value.x.toFixed(2)}   y ${hover.value.y.toFixed(2)}` : ''
)

// Interactions

function capture(event: PointerEvent): void {
  svg.value?.setPointerCapture(event.pointerId)
}

function startHandleDrag(index: number, handleId: string, event: PointerEvent): void {
  const primitive = primitiveAt(index)
  if (!primitive) return
  store.selectPrimitives([index])
  store.revealInspector()
  drag.value = { kind: 'handle', index, handleId, original: primitive, preview: primitive }
  capture(event)
}

function onPrimitiveDown(index: number, event: PointerEvent): void {
  if (store.tool !== 'select' || event.button !== 0) return
  event.stopPropagation()
  if (event.ctrlKey) {
    // Ctrl+glisser : on saisit la poignée la plus proche du point cliqué.
    const primitive = primitiveAt(index)
    const cells = pointerCells(event)
    const handle = primitive
      ? nearestHandle(primitive, cells.x * QUARTERS_PER_CELL, cells.y * QUARTERS_PER_CELL)
      : null
    if (handle) {
      startHandleDrag(index, handle.id, event)
      return
    }
  }
  if (event.shiftKey) {
    store.togglePrimitive(index)
    return
  }
  // Une forme groupée emmène son groupe ; Ctrl, sans poignée à saisir, la laisse seule.
  if (event.ctrlKey) store.selectPrimitives([index])
  else if (!store.selectedIndexes.includes(index)) store.selectElement({ kind: 'primitive', index })
  else store.expandSelectionToGroups()
  store.revealInspector()
  const start = toQuarters(pointerCells(event))
  drag.value = {
    kind: 'move-primitives',
    indexes: [...store.selectedIndexes],
    pinIds: [...store.selectedPinIds],
    start,
    current: start,
    duplicate: event.altKey
  }
  capture(event)
}

function onBoxHandleDown(handleId: string, event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  drag.value = { kind: 'resize-box', handleId, preview: componentBox.value }
  capture(event)
}

/** Texte dans la boîte entre deux coins ; deux clics au même point donnent la boîte par défaut. */
function commitTextBox(start: QPoint, end: QPoint): void {
  const same = start.x === end.x && start.y === end.y
  const box = same
    ? { x: start.x - 4, y: start.y - 1, w: 8, h: 2 }
    : {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.max(1, Math.abs(end.x - start.x)),
        h: Math.max(1, Math.abs(end.y - start.y))
      }
  store.addPrimitive(
    {
      kind: 'text',
      ...box,
      text: 'Texte',
      size: 0.5,
      anchor: 'middle',
      color: '#000000',
      variable: false,
      defaultValue: '',
      unit: '',
      bold: false,
      followsRotation: false,
      italic: false,
      underline: false,
      strike: false,
      vertical: false
    },
    'Ajouter un texte'
  )
  store.tool = 'select'
}

function onHandleDown(handleId: string, event: PointerEvent): void {
  const index = store.selectedIndexes[0]
  if (event.button !== 0 || index === undefined || store.selectedIndexes.length !== 1) return
  if (store.selectedPinIds.length > 0) return
  event.stopPropagation()
  startHandleDrag(index, handleId, event)
}

function onPinDown(id: string, event: PointerEvent): void {
  if (store.tool !== 'select' || event.button !== 0) return
  event.stopPropagation()
  const pin = store.shown.pins.find((candidate) => candidate.id === id)
  if (!pin) return
  if (event.shiftKey) {
    store.togglePin(id)
    return
  }
  // Une broche groupée emmène son groupe ; Ctrl la laisse seule.
  if (!event.ctrlKey) {
    if (!store.selectedPinIds.includes(id)) store.selectElement({ kind: 'pin', id })
    else store.expandSelectionToGroups()
  }
  const grouped =
    !event.ctrlKey &&
    store.selectedPinIds.includes(id) &&
    store.selectedPinIds.length + store.selectedIndexes.length > 1
  if (grouped) {
    // La broche fait partie d'une sélection : tout se déplace ensemble, par cellules entières.
    const start = toQuarters(pointerCells(event))
    drag.value = {
      kind: 'move-primitives',
      indexes: [...store.selectedIndexes],
      pinIds: [...store.selectedPinIds],
      start,
      current: start,
      duplicate: false
    }
  } else {
    store.selectPin(id)
    drag.value = { kind: 'move-pin', id, current: { x: pin.x, y: pin.y } }
  }
  store.revealInspector()
  capture(event)
}

async function fitAndCenter(): Promise<void> {
  store.fitToViewport()
  await nextTick()
  scroller.value?.scrollTo({ left: 0, top: 0 })
}

/** Espace + glisser : déplacement de la vue, avant tout autre geste (forme, broche, poignée). */
function onPanDown(event: PointerEvent): void {
  if (event.button !== 0 || !spaceHeld.value) return
  event.stopImmediatePropagation()
  event.preventDefault()
  drag.value = { kind: 'pan', lastX: event.clientX, lastY: event.clientY }
  capture(event)
}

/**
 * Lasso, depuis le vide : il part du point pressé, sur la feuille ou autour d'elle (le pointeur
 * est capturé par le dessin, qui suit donc le geste où qu'il aille). Maj garde la sélection et
 * y ajoute ; sinon elle tombe, et un simple clic désélectionne.
 */
function startBand(event: PointerEvent): void {
  const cells = pointerCells(event)
  const base = event.shiftKey ? [...store.selectedIndexes] : []
  const basePins = event.shiftKey ? [...store.selectedPinIds] : []
  if (!event.shiftKey) store.selection = null
  drag.value = { kind: 'band', start: cells, current: cells, base, basePins }
  capture(event)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button === 1) {
    event.preventDefault()
    if (event.timeStamp - lastMiddleDown < DOUBLE_CLICK_MS) {
      lastMiddleDown = 0
      void fitAndCenter()
      return
    }
    lastMiddleDown = event.timeStamp
    // Bouton du milieu maintenu : déplacement de la vue, comme sur le montage (les ascenseurs suivent).
    drag.value = { kind: 'pan', lastX: event.clientX, lastY: event.clientY }
    capture(event)
    return
  }
  if (event.button !== 0) return
  const tool = store.tool
  const cells = pointerCells(event)
  const q = toQuarters(cells)

  switch (tool) {
    case 'select':
      startBand(event)
      break
    case 'rect':
    case 'ellipse':
    case 'line':
      drag.value = { kind: 'box', tool, start: q, current: q, square: event.shiftKey }
      capture(event)
      break
    case 'polyline': {
      const current = drag.value
      if (current?.kind === 'polyline') {
        const last = current.points.at(-1)
        if (!last || last.x !== q.x || last.y !== q.y) current.points.push(q)
      } else {
        drag.value = { kind: 'polyline', points: [q], current: q }
      }
      break
    }
    case 'text': {
      const pending = drag.value
      if (pending?.kind === 'text-box') {
        drag.value = null
        commitTextBox(pending.start, q)
      } else {
        // Premier coin de la boîte ; le second vient au relâchement (glisser) ou au clic suivant.
        drag.value = { kind: 'text-box', start: q, current: q }
        capture(event)
      }
      break
    }
    case 'dot':
      // L'outil reste actif : plusieurs points se posent à la suite.
      store.addPrimitive(
        { kind: 'dot', x: q.x, y: q.y, scale: 1, color: '#000000' },
        'Ajouter un point'
      )
      break
    case 'pin':
      // La broche se pose au relâchement : sur place pour un clic, dans toute la zone pour un
      // glisser.
      drag.value = { kind: 'pin-zone', start: cells, current: cells }
      capture(event)
      break
  }
}

function onPointerMove(event: PointerEvent): void {
  const cells = pointerCells(event)
  hover.value = cells
  const current = drag.value
  if (!current) return
  switch (current.kind) {
    case 'move-pin':
      current.current = nearestInsidePoint(cells, size.value).point
      break
    case 'handle': {
      const q = toQuarters(cells)
      current.preview = dragHandle(current.original, current.handleId, [q.x, q.y])
      break
    }
    case 'band':
    case 'pin-zone':
      current.current = cells
      break
    case 'resize-box':
      current.preview = resizeBox(componentBox.value, current.handleId, [
        Math.round(cells.x),
        Math.round(cells.y)
      ])
      break
    case 'pan': {
      const container = scroller.value
      if (container) {
        container.scrollLeft -= event.clientX - current.lastX
        container.scrollTop -= event.clientY - current.lastY
      }
      current.lastX = event.clientX
      current.lastY = event.clientY
      break
    }
    case 'move-primitives': {
      // Avec des broches, tout se déplace par cellules entières : elles restent sur la grille.
      const q = toQuarters(cells)
      const step = current.pinIds.length > 0 ? QUARTERS_PER_CELL : 1
      current.current = {
        x: current.start.x + Math.round((q.x - current.start.x) / step) * step,
        y: current.start.y + Math.round((q.y - current.start.y) / step) * step
      }
      break
    }
    default:
      current.current = toQuarters(cells)
      if (current.kind === 'box') current.square = event.shiftKey
  }
}

function commitBox(box: Extract<Drag, { kind: 'box' }>): void {
  const style = { ...DEFAULT_SHAPE_STYLE }
  const end = boxEnd(box)
  if (box.tool === 'line') {
    if (box.start.x === end.x && box.start.y === end.y) return
    store.addPrimitive(
      {
        kind: 'line',
        x1: box.start.x,
        y1: box.start.y,
        x2: end.x,
        y2: end.y,
        arrows: { ...NO_ARROWS },
        style
      },
      'Ajouter une ligne'
    )
    return
  }
  const x1 = Math.min(box.start.x, end.x)
  const y1 = Math.min(box.start.y, end.y)
  const w = Math.abs(end.x - box.start.x)
  const h = Math.abs(end.y - box.start.y)
  if (w === 0 || h === 0) return
  if (box.tool === 'rect') {
    store.addPrimitive({ kind: 'rect', x: x1, y: y1, w, h, rx: 0, style }, 'Ajouter un rectangle')
    return
  }
  const rx = Math.max(1, Math.round(w / 2))
  const ry = Math.max(1, Math.round(h / 2))
  store.addPrimitive(
    { kind: 'ellipse', cx: x1 + rx, cy: y1 + ry, rx, ry, style },
    'Ajouter une ellipse'
  )
}

/** Formes dont la boîte touche le lasso (lasso en cellules, boîtes en quarts). */
function primitivesInBand(bandDrag: Extract<Drag, { kind: 'band' }>): number[] {
  const x1 = Math.min(bandDrag.start.x, bandDrag.current.x) * QUARTERS_PER_CELL
  const y1 = Math.min(bandDrag.start.y, bandDrag.current.y) * QUARTERS_PER_CELL
  const x2 = Math.max(bandDrag.start.x, bandDrag.current.x) * QUARTERS_PER_CELL
  const y2 = Math.max(bandDrag.start.y, bandDrag.current.y) * QUARTERS_PER_CELL
  return store.shown.visual.primitives.flatMap((primitive, index) => {
    const b = primitiveBounds(primitive)
    return b.x1 <= x2 && x1 <= b.x2 && b.y1 <= y2 && y1 <= b.y2 ? [index] : []
  })
}

/** Broches posées dans le lasso (en cellules). */
function pinsInBand(bandDrag: Extract<Drag, { kind: 'band' }>): string[] {
  const x1 = Math.min(bandDrag.start.x, bandDrag.current.x)
  const y1 = Math.min(bandDrag.start.y, bandDrag.current.y)
  const x2 = Math.max(bandDrag.start.x, bandDrag.current.x)
  const y2 = Math.max(bandDrag.start.y, bandDrag.current.y)
  return store.shown.pins
    .filter((pin) => pin.x >= x1 && pin.x <= x2 && pin.y >= y1 && pin.y <= y2)
    .map((pin) => pin.id)
}

/**
 * Clic droit : un tracé en cours se termine d'abord (la polyligne est gardée, le reste
 * abandonné) ; sinon la forme ou la broche visée entre dans la sélection, si elle n'y est pas, et
 * le menu contextuel s'ouvre.
 */
function onContextMenu(event: MouseEvent, target: EditorMenuTarget): void {
  event.preventDefault()
  event.stopPropagation()
  if (drag.value) {
    finishPolyline()
    drag.value = null
    return
  }
  if (target.kind === 'primitive' && !store.selectedIndexes.includes(target.index)) {
    store.selectElement({ kind: 'primitive', index: target.index })
  } else if (target.kind === 'pin' && !store.selectedPinIds.includes(target.id)) {
    store.selectElement({ kind: 'pin', id: target.id })
  }
  emit('openMenu', {
    x: event.clientX,
    y: event.clientY,
    point: toQuarters(pointerCells(event)),
    target
  })
}

function onPrimitiveMenu(index: number, event: MouseEvent): void {
  onContextMenu(event, { kind: 'primitive', index })
}

/**
 * Appui dans l'espace de travail, hors de la feuille. En sélection, un lasso part de là comme
 * il partirait de la feuille (décision du 11 novembre 2026) : pas besoin de viser la feuille pour
 * entourer ce qui touche son bord ; un simple clic désélectionne. Avec un outil de dessin, on le
 * quitte : le tracé en cours se termine (une polyligne d'au moins deux points est gardée) et
 * l'éditeur revient à l'outil Sélection.
 */
function onOutsideDown(event: PointerEvent): void {
  if (event.button !== 0) return
  if (store.tool === 'select') {
    startBand(event)
    return
  }
  finishPolyline()
  drag.value = null
  store.tool = 'select'
}

function samePrimitive(a: Primitive, b: Primitive): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function onPointerUp(event: PointerEvent): void {
  const current = drag.value
  if (!current || current.kind === 'polyline') return
  if (current.kind === 'text-box') {
    // Relâché sans bouger : on attend le second clic pour le coin opposé.
    if (current.start.x === current.current.x && current.start.y === current.current.y) return
    drag.value = null
    commitTextBox(current.start, current.current)
    return
  }
  drag.value = null
  switch (current.kind) {
    case 'resize-box': {
      const box = current.preview
      const before = componentBox.value
      if (box.x !== before.x || box.y !== before.y || box.w !== before.w || box.h !== before.h) {
        store.setBox(box)
      }
      break
    }
    case 'box':
      commitBox(current)
      break
    case 'move-primitives': {
      const dx = current.current.x - current.start.x
      const dy = current.current.y - current.start.y
      if (current.duplicate) store.duplicatePrimitivesAt(current.indexes, dx, dy)
      else store.moveSelection(current.indexes, current.pinIds, dx, dy)
      break
    }
    case 'move-pin':
      store.movePin(current.id, { x: current.current.x, y: current.current.y })
      break
    case 'handle':
      if (!samePrimitive(current.original, current.preview)) {
        store.setPrimitive(current.index, current.preview, 'Modifier la forme')
      }
      break
    case 'pin-zone':
      if (!isPinZone(current)) placePin(current.start)
      else if (store.addPins(pinZonePoints(current)).length === 0) {
        store.status = 'Aucune intersection libre dans cette zone.'
      }
      break
    case 'band': {
      const wide = Math.abs(current.current.x - current.start.x) > BAND_MIN_CELLS
      const tall = Math.abs(current.current.y - current.start.y) > BAND_MIN_CELLS
      if (wide || tall) {
        store.select(
          [...current.base, ...primitivesInBand(current)],
          [...current.basePins, ...pinsInBand(current)]
        )
        // Un groupe touché par le lasso est pris en entier.
        store.expandSelectionToGroups()
        if (store.selection) store.revealInspector()
      }
      break
    }
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
}

/** Retire le dernier point d'une polyligne en cours ; vrai s'il y en avait une. */
function popPolylinePoint(): boolean {
  const current = drag.value
  if (current?.kind !== 'polyline') return false
  if (current.points.length <= 1) drag.value = null
  else current.points.pop()
  return true
}

function finishPolyline(): void {
  const current = drag.value
  if (current?.kind !== 'polyline') return
  drag.value = null
  if (current.points.length < 2) return
  store.addPrimitive(
    {
      kind: 'polyline',
      points: current.points.map((p): [number, number] => [p.x, p.y]),
      closed: false,
      radius: 0,
      arrows: { ...NO_ARROWS },
      style: { ...DEFAULT_SHAPE_STYLE }
    },
    'Ajouter une polyligne'
  )
}

/** Annule le tracé ou le déplacement en cours ; vrai s'il y en avait un. */
function cancel(): boolean {
  if (!drag.value) return false
  drag.value = null
  return true
}

/**
 * Molette : zoom centré sur le curseur, comme sur le montage et le diagramme. La vue se déplace
 * avec le bouton du milieu, Espace + glisser ou les ascenseurs.
 */
async function onWheel(event: WheelEvent): Promise<void> {
  event.preventDefault()
  const element = svg.value
  const container = scroller.value
  if (!element || !container) return
  const containerRect = container.getBoundingClientRect()
  const world = pointerCells(event)
  const before = cell.value
  store.zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
  if (cell.value === before) return
  await nextTick()
  const newX = world.x * cell.value + originX.value
  const newY = world.y * cell.value + originY.value
  container.scrollLeft = containerRect.left + SCROLL_PADDING_PX - event.clientX + newX
  container.scrollTop = containerRect.top + SCROLL_PADDING_PX - event.clientY + newY
}

defineExpose({ cancel, finishPolyline, popPolylinePoint, fitAndCenter })
</script>

<template>
  <div class="canvas-wrap">
    <div
      ref="scroller"
      class="canvas-scroll"
      :class="{ panning: spaceHeld || drag?.kind === 'pan' }"
      @wheel="onWheel"
      @pointerdown.capture="onPanDown"
      @pointerdown.self="onOutsideDown"
      @contextmenu.self="onContextMenu($event, { kind: 'empty' })"
    >
      <svg
        ref="svg"
        class="canvas"
        :class="`tool-${store.tool}`"
        :width="svgWidth"
        :height="svgHeight"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="hover = null"
        @dblclick="finishPolyline"
        @contextmenu="onContextMenu($event, { kind: 'empty' })"
      >
        <defs>
          <pattern id="cell-grid" :width="cell" :height="cell" patternUnits="userSpaceOnUse">
            <path
              :d="`M ${cell} 0 L 0 0 0 ${cell}`"
              fill="none"
              stroke="var(--grid-cell)"
              stroke-width="1"
            />
            <circle
              v-for="(dot, i) in quarterDots"
              :key="i"
              :cx="dot.x"
              :cy="dot.y"
              r="1"
              fill="var(--grid-dot)"
            />
          </pattern>
        </defs>

        <g :transform="`translate(${originX} ${originY})`">
          <rect :width="boxWidth" :height="boxHeight" fill="url(#cell-grid)" />
          <rect
            :width="boxWidth"
            :height="boxHeight"
            fill="none"
            stroke="var(--paper-border)"
            stroke-width="1.5"
          />

          <ComponentGraphic
            :def="store.shown"
            :cell-px="cell"
            :stroke-base="strokeBase"
            interactive
            :moving="moving"
            :preview="handlePreview"
            @primitive-down="onPrimitiveDown"
            @primitive-menu="onPrimitiveMenu"
          />

          <ComponentGraphic
            v-if="ghostDef"
            class="ghost-copy"
            :def="ghostDef"
            :cell-px="cell"
            :stroke-base="strokeBase"
          />

          <rect
            v-for="outline in groupOutlines"
            :key="`group:${outline.id}`"
            class="group-outline"
            :x="outline.x"
            :y="outline.y"
            :width="outline.width"
            :height="outline.height"
            :rx="6"
          />

          <rect
            v-for="box in selectionBoxes"
            :key="box.index"
            class="selection-box"
            :x="box.x"
            :y="box.y"
            :width="box.width"
            :height="box.height"
          />

          <g v-if="store.tool === 'pin'" class="pin-targets">
            <circle
              v-for="target in borderTargets"
              :key="`${target.x},${target.y}`"
              :cx="target.x * cell"
              :cy="target.y * cell"
              r="4"
            />
            <circle
              v-for="target in pinZoneTargets"
              :key="`zone:${target.x},${target.y}`"
              class="pin-target-active"
              :cx="target.x * cell"
              :cy="target.y * cell"
              r="6"
            />
            <circle
              v-if="pinTarget && pinZoneTargets.length === 0"
              class="pin-target-active"
              :cx="pinTarget.x * cell"
              :cy="pinTarget.y * cell"
              r="9"
            />
          </g>

          <g
            v-for="(pin, index) in store.shown.pins"
            :key="pin.id"
            class="pin"
            :class="{ selected: isSelectedPin(pin.id), hovered: store.hoverPinId === pin.id }"
            :transform="`translate(${pinPosition(pin).x * cell} ${pinPosition(pin).y * cell})`"
            @pointerdown="onPinDown(pin.id, $event)"
            @contextmenu="onContextMenu($event, { kind: 'pin', id: pin.id })"
            @pointerenter="store.hoverPinId = pin.id"
            @pointerleave="store.hoverPinId = null"
          >
            <circle r="12" fill="transparent" />
            <circle
              v-if="isSelectedPin(pin.id) || store.hoverPinId === pin.id"
              r="10"
              fill="none"
              stroke="var(--selection)"
              stroke-width="2"
            />
            <circle r="6" :fill="PIN_COLORS[pin.kind]" stroke="var(--paper)" stroke-width="2" />
            <text
              :x="labelOf(index).dx"
              :y="labelOf(index).dy"
              :text-anchor="labelOf(index).anchor"
              dominant-baseline="middle"
              :font-size="PIN_LABEL_FONT_PX"
              fill="var(--paper-text)"
            >
              <tspan class="pin-number" :font-size="PIN_NUMBER_FONT_PX">
                {{ pinNumberText(pin, index) }}
              </tspan>
              <tspan v-if="pinLabelParts(pin, index).name">
                {{ pinLabelParts(pin, index).name }}
              </tspan>
            </text>
          </g>

          <g class="handles">
            <rect
              v-for="handle in handles"
              :key="handle.id"
              class="handle"
              :style="{ cursor: handleCursor(handle.id) }"
              :x="handle.px - 4"
              :y="handle.py - 4"
              width="8"
              height="8"
              @pointerdown="onHandleDown(handle.id, $event)"
            />
          </g>

          <g class="handles">
            <rect
              v-for="handle in boxHandlesShown"
              :key="`box-${handle.id}`"
              class="handle"
              :style="{ cursor: handleCursor(handle.id) }"
              :x="handle.px - 4"
              :y="handle.py - 4"
              width="8"
              height="8"
              @pointerdown="onBoxHandleDown(handle.id, $event)"
            />
          </g>

          <g v-if="preview" class="preview">
            <rect
              v-if="preview.kind === 'rect'"
              :x="preview.x"
              :y="preview.y"
              :width="preview.width"
              :height="preview.height"
            />
            <ellipse
              v-else-if="preview.kind === 'ellipse'"
              :cx="preview.cx"
              :cy="preview.cy"
              :rx="preview.rx"
              :ry="preview.ry"
            />
            <line
              v-else-if="preview.kind === 'line'"
              :x1="preview.x1"
              :y1="preview.y1"
              :x2="preview.x2"
              :y2="preview.y2"
            />
            <polyline v-else :points="preview.points" />
          </g>

          <rect
            v-if="band"
            class="band"
            :x="band.x"
            :y="band.y"
            :width="band.width"
            :height="band.height"
          />
        </g>
      </svg>
    </div>
    <footer class="canvas-status">
      <span class="coords">{{ hoverText }}</span>
      <span class="message">{{ store.status }}</span>
    </footer>
  </div>
</template>

<style scoped>
.canvas-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* Tout l'espace de travail a la couleur du papier : les repères des broches débordent sans
     coupure visible autour de la boîte du composant. */
  background: var(--paper);
}

/* Espace enfoncée ou vue en cours de déplacement : la main, par-dessus le curseur des formes. */
.canvas-scroll.panning,
.canvas-scroll.panning :deep(*) {
  cursor: grab;
}

.canvas-scroll {
  flex: 1;
  overflow: auto;
  padding: 24px;
  /* Flex + marges automatiques : le canevas est centré quand il est plus petit que la zone, et
     reste accessible par les ascenseurs quand il est plus grand. */
  display: flex;
}

.canvas {
  display: block;
  /* Enfant de flex : sans ceci il se laisserait comprimer en largeur et l'ascenseur horizontal
     n'apparaîtrait jamais ; la hauteur, elle, débordait déjà. */
  flex: none;
  margin: auto;
  overflow: visible;
  background: var(--paper);
  touch-action: none;
  user-select: none;
}

.canvas.tool-select {
  cursor: default;
}

.canvas:not(.tool-select) {
  cursor: crosshair;
}

.ghost-copy {
  opacity: 0.5;
  pointer-events: none;
}

.selection-box {
  fill: none;
  stroke: var(--selection);
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.handle {
  fill: #ffffff;
  stroke: var(--selection);
  stroke-width: 1.5;
}

.pin-targets circle {
  fill: none;
  stroke: var(--selection);
  stroke-opacity: 0.45;
  pointer-events: none;
}

.pin-targets .pin-target-active {
  fill: var(--selection);
  fill-opacity: 0.2;
  stroke-opacity: 1;
}

.pin {
  cursor: pointer;
}

.pin text {
  pointer-events: none;
  font-family: 'Segoe UI', sans-serif;
}

/* Le numéro (et le point médian qui le sépare du nom) s'efface devant le nom de la broche. */
.pin .pin-number {
  fill-opacity: 0.6;
}

.preview > * {
  fill: rgba(31, 111, 235, 0.08);
  stroke: var(--selection);
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.preview line,
.preview polyline {
  fill: none;
}

.band {
  fill: rgba(31, 111, 235, 0.08);
  stroke: var(--selection);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

.canvas-status {
  /* Hauteur fixe : la barre ne se replie pas quand elle est vide, le canevas ne bouge pas. */
  flex: none;
  min-height: var(--status-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.coords {
  font-variant-numeric: tabular-nums;
  white-space: pre;
}
</style>
