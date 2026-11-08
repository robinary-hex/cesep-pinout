<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  absolutePinPosition,
  instanceBounds,
  instanceMatrix,
  matrixToSvg,
  rectsIntersect,
  rotatedSize,
  type ComponentInstance,
  type GridRect,
  type LocalPoint,
  type PinKind
} from '@/domain'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import { useSchematicStore, type PlacedInstance } from './store'

// Canevas infini du montage. Tout le contenu est dessiné en unités de cellule dans un groupe
// mis à l'échelle (zoom) et translaté (pan) ; seule la grille est calculée en pixels d'écran.

const store = useSchematicStore()
const host = ref<HTMLDivElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)

const PIN_COLORS: Record<PinKind, string> = {
  in: '#15803d',
  out: '#ea580c',
  io: '#1d4ed8',
  power: '#d62828'
}
const MIN_GRID_PX = 6
const ZOOM_STEP = 1.1

const cell = computed(() => store.cellPx)
const view = computed(() => store.view)
const profile = computed(() => store.doc.profile)

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move'; ids: string[]; start: LocalPoint; dx: number; dy: number }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; additive: boolean }

const drag = ref<Drag | null>(null)
/** Pointeur en cellules (flottant), null hors du canevas. */
const hover = ref<LocalPoint | null>(null)

let observer: ResizeObserver | null = null

onMounted(() => {
  const element = host.value
  if (!element) return
  const update = (): void => {
    store.viewport = { width: element.clientWidth, height: element.clientHeight }
  }
  update()
  observer = new ResizeObserver(update)
  observer.observe(element)
})

onUnmounted(() => observer?.disconnect())

function screenPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const rect = svg.value?.getBoundingClientRect()
  return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 }
}

function toWorld(screen: { x: number; y: number }): LocalPoint {
  return {
    x: (screen.x - view.value.panX) / cell.value,
    y: (screen.y - view.value.panY) / cell.value
  }
}

// Grille, en pixels d'écran

interface GridLine {
  px: number
  major: boolean
}

const gridLines = computed<{ xs: GridLine[]; ys: GridLine[] }>(() => {
  const c = cell.value
  if (c < MIN_GRID_PX) return { xs: [], ys: [] }
  const { width, height } = store.viewport
  const { panX, panY } = view.value
  const xs: GridLine[] = []
  for (let i = Math.floor(-panX / c); i <= Math.ceil((width - panX) / c); i++) {
    xs.push({ px: panX + i * c, major: i % 5 === 0 })
  }
  const ys: GridLine[] = []
  for (let j = Math.floor(-panY / c); j <= Math.ceil((height - panY) / c); j++) {
    ys.push({ px: panY + j * c, major: j % 5 === 0 })
  }
  return { xs, ys }
})

// Instances

const selectedSet = computed(() => new Set(store.selection))

const moveOffset = computed(() => {
  const current = drag.value
  return current?.kind === 'move'
    ? { ids: new Set(current.ids), dx: current.dx, dy: current.dy }
    : null
})

function offsetOf(id: string): { dx: number; dy: number } {
  const offset = moveOffset.value
  return offset && offset.ids.has(id) ? { dx: offset.dx, dy: offset.dy } : { dx: 0, dy: 0 }
}

function transformOf(item: PlacedInstance): string {
  const matrix = instanceMatrix(item.instance, item.def)
  const { dx, dy } = offsetOf(item.instance.id)
  return matrixToSvg({ ...matrix, e: matrix.e + dx, f: matrix.f + dy })
}

function boundsOf(item: PlacedInstance): GridRect {
  const bounds = instanceBounds(item.instance, item.def)
  const { dx, dy } = offsetOf(item.instance.id)
  return { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
}

const selectedBoxes = computed(() =>
  store.placed
    .filter((item) => selectedSet.value.has(item.instance.id))
    .map((item) => ({ id: item.instance.id, ...boundsOf(item) }))
)

const pins = computed(() => {
  if (!store.showPins) return []
  return store.placed.flatMap((item) => {
    const { dx, dy } = offsetOf(item.instance.id)
    return item.def.pins.map((pin) => {
      const point = absolutePinPosition(item.instance, item.def, pin)
      return {
        key: `${item.instance.id}:${pin.id}`,
        x: point.x + dx,
        y: point.y + dy,
        kind: pin.kind
      }
    })
  })
})

const labelFontCells = computed(() => profile.value.labelFont.size / profile.value.cellPx)

// Fantôme de pose

const ghost = computed(() => {
  const current = store.placement
  const point = hover.value
  if (!current || !point || store.tool !== 'place') return null
  const size = rotatedSize(current.def.size, current.rotation)
  const instance: ComponentInstance = {
    id: 'ghost',
    defId: current.def.id,
    x: Math.round(point.x - size.widthCells / 2),
    y: Math.round(point.y - size.heightCells / 2),
    rotation: current.rotation,
    mirror: current.mirror,
    label: ''
  }
  return {
    instance,
    def: current.def,
    transform: matrixToSvg(instanceMatrix(instance, current.def))
  }
})

function normalizeRect(a: LocalPoint, b: LocalPoint): GridRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

const band = computed(() => {
  const current = drag.value
  return current?.kind === 'band' ? normalizeRect(current.start, current.current) : null
})

// Interactions

function capture(event: PointerEvent): void {
  svg.value?.setPointerCapture(event.pointerId)
}

function onInstanceDown(id: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool === 'place') return
  event.stopPropagation()
  if (event.shiftKey) {
    store.selection = selectedSet.value.has(id)
      ? store.selection.filter((selected) => selected !== id)
      : [...store.selection, id]
    return
  }
  if (!selectedSet.value.has(id)) store.selection = [id]
  drag.value = {
    kind: 'move',
    ids: [...store.selection],
    start: toWorld(screenPoint(event)),
    dx: 0,
    dy: 0
  }
  capture(event)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button === 1 || (event.button === 0 && store.panKeyHeld)) {
    drag.value = { kind: 'pan', lastX: event.clientX, lastY: event.clientY }
    capture(event)
    event.preventDefault()
    return
  }
  if (event.button !== 0) return
  if (store.tool === 'place') {
    const current = ghost.value
    if (current) store.placeAt(current.instance.x, current.instance.y)
    return
  }
  const world = toWorld(screenPoint(event))
  if (!event.shiftKey) store.selection = []
  drag.value = { kind: 'band', start: world, current: world, additive: event.shiftKey }
  capture(event)
}

function onPointerMove(event: PointerEvent): void {
  const world = toWorld(screenPoint(event))
  hover.value = world
  const current = drag.value
  if (!current) return
  if (current.kind === 'pan') {
    store.panBy(event.clientX - current.lastX, event.clientY - current.lastY)
    current.lastX = event.clientX
    current.lastY = event.clientY
  } else if (current.kind === 'move') {
    current.dx = Math.round(world.x - current.start.x)
    current.dy = Math.round(world.y - current.start.y)
  } else {
    current.current = world
  }
}

function onPointerUp(event: PointerEvent): void {
  const current = drag.value
  if (!current) return
  drag.value = null
  if (current.kind === 'move') {
    store.moveInstances(current.ids, current.dx, current.dy)
  } else if (current.kind === 'band') {
    const rect = normalizeRect(current.start, current.current)
    if (rect.width > 0.05 || rect.height > 0.05) {
      const hit = store.placed
        .filter((item) => rectsIntersect(instanceBounds(item.instance, item.def), rect))
        .map((item) => item.instance.id)
      store.selection = current.additive ? [...new Set([...store.selection, ...hit])] : hit
    }
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
}

function onWheel(event: WheelEvent): void {
  const screen = screenPoint(event)
  store.zoomAround(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, screen.x, screen.y)
}

/** Annule le glisser en cours ; vrai s'il y en avait un. */
function cancel(): boolean {
  if (!drag.value) return false
  drag.value = null
  return true
}

defineExpose({ cancel })

const hoverText = computed(() =>
  hover.value ? `x ${Math.round(hover.value.x)}   y ${Math.round(hover.value.y)}` : ''
)

const cursorClass = computed(() => {
  if (store.panKeyHeld || drag.value?.kind === 'pan') return 'panning'
  return store.tool === 'place' ? 'placing' : ''
})
</script>

<template>
  <div class="schematic-wrap">
    <div ref="host" class="canvas-area">
      <svg
        ref="svg"
        class="schematic"
        :class="cursorClass"
        :width="store.viewport.width"
        :height="store.viewport.height"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="hover = null"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
      >
        <g class="grid">
          <line
            v-for="(line, i) in gridLines.xs"
            :key="`x${i}`"
            :x1="line.px"
            :x2="line.px"
            y1="0"
            :y2="store.viewport.height"
            :class="{ major: line.major }"
          />
          <line
            v-for="(line, j) in gridLines.ys"
            :key="`y${j}`"
            x1="0"
            :x2="store.viewport.width"
            :y1="line.px"
            :y2="line.px"
            :class="{ major: line.major }"
          />
        </g>

        <g :transform="`translate(${view.panX} ${view.panY}) scale(${cell})`">
          <g
            v-for="item in store.placed"
            :key="item.instance.id"
            class="instance"
            :transform="transformOf(item)"
            @pointerdown="onInstanceDown(item.instance.id, $event)"
          >
            <ComponentGraphic :def="item.def" :cell-px="1" />
            <rect
              class="hit"
              :width="item.def.size.widthCells"
              :height="item.def.size.heightCells"
              fill="transparent"
            />
          </g>

          <g class="labels">
            <text
              v-for="item in store.placed"
              :key="item.instance.id"
              :x="boundsOf(item).x"
              :y="boundsOf(item).y - 0.25"
              :font-size="labelFontCells"
              :font-family="profile.labelFont.family"
            >
              {{ item.instance.label }}
            </text>
          </g>

          <g v-if="store.showPins" class="pins">
            <circle
              v-for="pin in pins"
              :key="pin.key"
              :cx="pin.x"
              :cy="pin.y"
              :r="3 / cell"
              :fill="PIN_COLORS[pin.kind]"
            />
          </g>

          <rect
            v-for="box in selectedBoxes"
            :key="box.id"
            class="selection"
            :x="box.x - 0.15"
            :y="box.y - 0.15"
            :width="box.width + 0.3"
            :height="box.height + 0.3"
            vector-effect="non-scaling-stroke"
          />

          <g v-if="ghost" class="ghost" :transform="ghost.transform">
            <ComponentGraphic :def="ghost.def" :cell-px="1" />
            <rect
              class="ghost-box"
              :width="ghost.def.size.widthCells"
              :height="ghost.def.size.heightCells"
              vector-effect="non-scaling-stroke"
            />
          </g>

          <rect v-if="band" class="band" v-bind="band" vector-effect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
    <footer class="canvas-status">
      <span class="coords">{{ hoverText }}</span>
      <span class="zoom">{{ Math.round(view.zoom * 100) }} %</span>
      <span class="message">{{ store.status }}</span>
    </footer>
  </div>
</template>

<style scoped>
.schematic-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.canvas-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.schematic {
  display: block;
  touch-action: none;
  user-select: none;
  cursor: default;
}

.schematic.placing {
  cursor: copy;
}

.schematic.panning {
  cursor: grab;
}

.grid line {
  stroke: #eceff2;
}

.grid line.major {
  stroke: #d8dee4;
}

.instance {
  cursor: move;
}

.labels text {
  fill: #1f2328;
  pointer-events: none;
}

.pins circle {
  pointer-events: none;
}

.selection {
  fill: none;
  stroke: #1f6feb;
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.ghost {
  opacity: 0.55;
  pointer-events: none;
}

.ghost-box {
  fill: none;
  stroke: #1f6feb;
  stroke-width: 1;
  stroke-dasharray: 4 3;
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
  gap: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: #57606a;
  background: #ffffff;
  border-top: 1px solid #d0d7de;
}

.coords {
  min-width: 90px;
  font-variant-numeric: tabular-nums;
  white-space: pre;
}

.zoom {
  min-width: 48px;
}

.message {
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
