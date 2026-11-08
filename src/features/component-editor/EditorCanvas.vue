<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  DEFAULT_SHAPE_STYLE,
  dragHandle,
  nearestBorderPoint,
  nearestHandle,
  NO_ARROWS,
  primitiveBounds,
  primitiveHandles,
  QUARTERS_PER_CELL,
  translatePrimitive,
  type ComponentDefinition,
  type LocalPoint,
  type Pin,
  type PinKind,
  type Primitive
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import { useComponentEditorStore } from './store'

// Canevas SVG de l'éditeur de composants : grille, formes, broches, poignées, lasso, copies
// fantômes (Alt+glisser), aperçus de tracé. Les coordonnées souris sont converties en cellules
// puis en quarts de cellule ; le domaine ne reçoit que des entiers.

const store = useComponentEditorStore()
const library = useLibraryStore()
const svg = ref<SVGSVGElement | null>(null)
const scroller = ref<HTMLDivElement | null>(null)

const MARGIN_CELLS = 1
const SCROLL_PADDING_PX = 24
const PIN_SNAP_CELLS = 0.75
const ZOOM_STEP = 1.1
const BAND_MIN_CELLS = 0.05
const PIN_COLORS: Record<PinKind, string> = {
  in: '#15803d',
  out: '#ea580c',
  io: '#1d4ed8',
  power: '#d62828'
}

const cell = computed(() => store.cellPx)
const quarter = computed(() => cell.value / QUARTERS_PER_CELL)
const origin = computed(() => MARGIN_CELLS * cell.value)
const size = computed(() => store.doc.size)
const boxWidth = computed(() => size.value.widthCells * cell.value)
const boxHeight = computed(() => size.value.heightCells * cell.value)
const svgWidth = computed(() => boxWidth.value + 2 * origin.value)
const svgHeight = computed(() => boxHeight.value + 2 * origin.value)
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
      start: QPoint
      current: QPoint
      /** Alt+glisser : les originaux restent, une copie se dépose à l'arrivée. */
      duplicate: boolean
    }
  | { kind: 'move-pin'; id: string; current: LocalPoint }
  | { kind: 'handle'; index: number; handleId: string; original: Primitive; preview: Primitive }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; base: number[] }

type Preview =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline'; points: string }

const drag = ref<Drag | null>(null)
/** Position du pointeur en cellules (flottant), null hors du canevas. */
const hover = ref<LocalPoint | null>(null)

let observer: ResizeObserver | null = null

onMounted(() => {
  const element = scroller.value
  if (!element) return
  const update = (): void => {
    store.viewport = { width: element.clientWidth, height: element.clientHeight }
  }
  update()
  observer = new ResizeObserver(update)
  observer.observe(element)
})

onUnmounted(() => observer?.disconnect())

function pointerCells(event: PointerEvent | WheelEvent): LocalPoint {
  const element = svg.value
  if (!element) return { x: 0, y: 0 }
  const rect = element.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - origin.value) / cell.value,
    y: (event.clientY - rect.top - origin.value) / cell.value
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

const borderTargets = computed<LocalPoint[]>(() => {
  const w = size.value.widthCells
  const h = size.value.heightCells
  const points: LocalPoint[] = []
  for (let x = 0; x <= w; x++) points.push({ x, y: 0 }, { x, y: h })
  for (let y = 1; y < h; y++) points.push({ x: 0, y }, { x: w, y })
  return points
})

const pinTarget = computed<LocalPoint | null>(() => {
  if (store.tool !== 'pin' || !hover.value) return null
  const nearest = nearestBorderPoint(hover.value, size.value)
  return nearest.distance <= PIN_SNAP_CELLS ? nearest.point : null
})

function isSelectedPin(id: string): boolean {
  return store.selection?.kind === 'pin' && store.selection.id === id
}

function pinPosition(pin: Pin): LocalPoint {
  const current = drag.value
  return current?.kind === 'move-pin' && current.id === pin.id
    ? current.current
    : { x: pin.x, y: pin.y }
}

function pinLabel(pin: Pin): { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' } {
  const { x, y } = pinPosition(pin)
  const inside = y > 0 && y < size.value.heightCells
  if (x === 0 && inside) return { dx: -12, dy: 0, anchor: 'end' }
  if (x === size.value.widthCells && inside) return { dx: 12, dy: 0, anchor: 'start' }
  if (y === 0) return { dx: 0, dy: -14, anchor: 'middle' }
  return { dx: 0, dy: 16, anchor: 'middle' }
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
  if ((dx === 0 && dy === 0) || store.doc.visual.kind !== 'drawing') return null
  const list = store.doc.visual.primitives
  const copies = current.indexes.flatMap((index) => {
    const primitive = list[index]
    return primitive ? [translatePrimitive(primitive, dx, dy)] : []
  })
  return { ...store.doc, visual: { kind: 'drawing', primitives: copies } }
})

const handlePreview = computed(() => {
  const current = drag.value
  return current?.kind === 'handle' ? { index: current.index, primitive: current.preview } : null
})

function primitiveAt(index: number): Primitive | null {
  return store.doc.visual.kind === 'drawing' ? (store.doc.visual.primitives[index] ?? null) : null
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

/** Poignées : seulement pour une forme seule, hors déplacement. */
const handles = computed(() => {
  const indexes = store.selectedIndexes
  const index = indexes[0]
  if (indexes.length !== 1 || index === undefined || store.tool !== 'select' || drag.value) {
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
const band = computed(() => {
  const current = drag.value
  if (current?.kind !== 'band') return null
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
  if (!store.selectedIndexes.includes(index)) store.selectPrimitives([index])
  const start = toQuarters(pointerCells(event))
  drag.value = {
    kind: 'move-primitives',
    indexes: [...store.selectedIndexes],
    start,
    current: start,
    duplicate: event.altKey
  }
  capture(event)
}

function onHandleDown(handleId: string, event: PointerEvent): void {
  const index = store.selectedIndexes[0]
  if (event.button !== 0 || index === undefined || store.selectedIndexes.length !== 1) return
  event.stopPropagation()
  startHandleDrag(index, handleId, event)
}

function onPinDown(id: string, event: PointerEvent): void {
  if (store.tool !== 'select' || event.button !== 0) return
  event.stopPropagation()
  const pin = store.doc.pins.find((candidate) => candidate.id === id)
  if (!pin) return
  store.selection = { kind: 'pin', id }
  drag.value = { kind: 'move-pin', id, current: { x: pin.x, y: pin.y } }
  capture(event)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const tool = store.tool
  const cells = pointerCells(event)
  const q = toQuarters(cells)

  switch (tool) {
    case 'select': {
      // Clic dans le vide : lasso ; Maj garde la sélection et y ajoute.
      const base = event.shiftKey ? [...store.selectedIndexes] : []
      if (!event.shiftKey) store.selection = null
      drag.value = { kind: 'band', start: cells, current: cells, base }
      capture(event)
      break
    }
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
    case 'text':
      store.addPrimitive(
        {
          kind: 'text',
          x: q.x,
          y: q.y,
          text: 'Texte',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: false,
          defaultValue: '',
          unit: '',
          bold: false
        },
        'Ajouter un texte'
      )
      break
    case 'pin': {
      const nearest = nearestBorderPoint(cells, size.value)
      if (nearest.distance > PIN_SNAP_CELLS) {
        store.status = 'Clique une intersection du bord du composant.'
        break
      }
      const taken = store.doc.pins.some(
        (pin) => pin.x === nearest.point.x && pin.y === nearest.point.y
      )
      if (taken) {
        store.status = 'Il y a déjà une broche sur cette intersection.'
        break
      }
      store.addPin(nearest.point)
      break
    }
  }
}

function onPointerMove(event: PointerEvent): void {
  const cells = pointerCells(event)
  hover.value = cells
  const current = drag.value
  if (!current) return
  switch (current.kind) {
    case 'move-pin':
      current.current = nearestBorderPoint(cells, size.value).point
      break
    case 'handle': {
      const q = toQuarters(cells)
      current.preview = dragHandle(current.original, current.handleId, [q.x, q.y])
      break
    }
    case 'band':
      current.current = cells
      break
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
  if (store.doc.visual.kind !== 'drawing') return []
  const x1 = Math.min(bandDrag.start.x, bandDrag.current.x) * QUARTERS_PER_CELL
  const y1 = Math.min(bandDrag.start.y, bandDrag.current.y) * QUARTERS_PER_CELL
  const x2 = Math.max(bandDrag.start.x, bandDrag.current.x) * QUARTERS_PER_CELL
  const y2 = Math.max(bandDrag.start.y, bandDrag.current.y) * QUARTERS_PER_CELL
  return store.doc.visual.primitives.flatMap((primitive, index) => {
    const b = primitiveBounds(primitive)
    return b.x1 <= x2 && x1 <= b.x2 && b.y1 <= y2 && y1 <= b.y2 ? [index] : []
  })
}

function samePrimitive(a: Primitive, b: Primitive): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function onPointerUp(event: PointerEvent): void {
  const current = drag.value
  if (!current || current.kind === 'polyline') return
  drag.value = null
  switch (current.kind) {
    case 'box':
      commitBox(current)
      break
    case 'move-primitives': {
      const dx = current.current.x - current.start.x
      const dy = current.current.y - current.start.y
      if (current.duplicate) store.duplicatePrimitivesAt(current.indexes, dx, dy)
      else store.movePrimitives(current.indexes, dx, dy)
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
    case 'band': {
      const wide = Math.abs(current.current.x - current.start.x) > BAND_MIN_CELLS
      const tall = Math.abs(current.current.y - current.start.y) > BAND_MIN_CELLS
      if (wide || tall) store.selectPrimitives([...current.base, ...primitivesInBand(current)])
      break
    }
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
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

/** Ctrl+molette : zoom centré sur le curseur ; la molette seule fait défiler. */
async function onWheel(event: WheelEvent): Promise<void> {
  if (!event.ctrlKey) return
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
  const newX = world.x * cell.value + origin.value
  const newY = world.y * cell.value + origin.value
  container.scrollLeft = containerRect.left + SCROLL_PADDING_PX - event.clientX + newX
  container.scrollTop = containerRect.top + SCROLL_PADDING_PX - event.clientY + newY
}

defineExpose({ cancel, finishPolyline })
</script>

<template>
  <div class="canvas-wrap">
    <div ref="scroller" class="canvas-scroll" @wheel="onWheel">
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
        @contextmenu.prevent
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

        <g :transform="`translate(${origin} ${origin})`">
          <rect :width="boxWidth" :height="boxHeight" fill="url(#cell-grid)" />
          <rect
            :width="boxWidth"
            :height="boxHeight"
            fill="none"
            stroke="var(--paper-border)"
            stroke-width="1.5"
          />

          <ComponentGraphic
            :def="store.doc"
            :cell-px="cell"
            :stroke-base="strokeBase"
            interactive
            :moving="moving"
            :preview="handlePreview"
            @primitive-down="onPrimitiveDown"
          />

          <ComponentGraphic
            v-if="ghostDef"
            class="ghost-copy"
            :def="ghostDef"
            :cell-px="cell"
            :stroke-base="strokeBase"
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
              v-if="pinTarget"
              class="pin-target-active"
              :cx="pinTarget.x * cell"
              :cy="pinTarget.y * cell"
              r="9"
            />
          </g>

          <g
            v-for="(pin, index) in store.doc.pins"
            :key="pin.id"
            class="pin"
            :class="{ selected: isSelectedPin(pin.id), hovered: store.hoverPinId === pin.id }"
            :transform="`translate(${pinPosition(pin).x * cell} ${pinPosition(pin).y * cell})`"
            @pointerdown="onPinDown(pin.id, $event)"
            @pointerenter="store.hoverPinId = pin.id"
            @pointerleave="store.hoverPinId = null"
          >
            <circle r="12" fill="transparent" />
            <circle
              v-if="isSelectedPin(pin.id) || store.hoverPinId === pin.id"
              r="10"
              fill="none"
              stroke="#1f6feb"
              stroke-width="2"
            />
            <circle r="6" :fill="PIN_COLORS[pin.kind]" stroke="var(--paper)" stroke-width="2" />
            <text
              :x="pinLabel(pin).dx"
              :y="pinLabel(pin).dy"
              :text-anchor="pinLabel(pin).anchor"
              dominant-baseline="middle"
              font-size="11"
              fill="var(--paper-text)"
            >
              {{ index + 1 }}{{ pin.name !== String(index + 1) ? ` · ${pin.name}` : '' }}
            </text>
          </g>

          <g class="handles">
            <rect
              v-for="handle in handles"
              :key="handle.id"
              class="handle"
              :x="handle.px - 4"
              :y="handle.py - 4"
              width="8"
              height="8"
              @pointerdown="onHandleDown(handle.id, $event)"
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
  background: var(--paper-margin);
}

.canvas-scroll {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.canvas {
  display: block;
  background: var(--paper);
  box-shadow: 0 1px 4px var(--shadow);
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
  stroke: #1f6feb;
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.handle {
  fill: #ffffff;
  stroke: #1f6feb;
  stroke-width: 1.5;
  cursor: move;
}

.pin-targets circle {
  fill: none;
  stroke: #1f6feb;
  stroke-opacity: 0.45;
  pointer-events: none;
}

.pin-targets .pin-target-active {
  fill: #1f6feb;
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

.preview > * {
  fill: rgba(31, 111, 235, 0.08);
  stroke: #1f6feb;
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
  stroke: #1f6feb;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

.canvas-status {
  display: flex;
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
