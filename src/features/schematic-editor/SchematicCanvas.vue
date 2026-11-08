<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  absolutePinPosition,
  dragVertex,
  instanceBounds,
  instanceMatrix,
  locateOnWire,
  matrixToSvg,
  moveSegment,
  nearestSegmentIndex,
  rectsIntersect,
  rotatedSize,
  routeLAuto,
  textLabelBounds,
  wireIntersectsRect,
  wirePathData,
  wiresFollowingPins,
  type ComponentInstance,
  type GridPoint,
  type GridRect,
  type LocalPoint,
  type PinKind,
  type PinRef,
  type TextLabel,
  type Wire
} from '@/domain'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import type { MenuRequest, MenuTarget } from './menu'
import { useSchematicStore, type PlacedInstance } from './store'

// Canevas infini du montage. Tout le contenu est dessiné en unités de cellule dans un groupe
// mis à l'échelle (zoom) et translaté (pan) ; seule la grille est calculée en pixels d'écran.
// Ordre d'empilement : grille, fils, croisements (fil du dessus avec liseré), points de jonction,
// composants, repères, étiquettes, broches, surcouches de sélection et d'édition, fantôme de pose,
// tracé en cours, rectangle de sélection.

const store = useSchematicStore()
const emit = defineEmits<{
  openMenu: [request: MenuRequest]
  editInstance: [id: string]
  editLabel: [id: string]
}>()
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
const PIN_SNAP_CELLS = 0.5

const cell = computed(() => store.cellPx)
const view = computed(() => store.view)
const profile = computed(() => store.doc.profile)
const wireWidth = computed(() => profile.value.wireWidth)
const cornerRadius = computed(() => profile.value.cornerRadius)

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | {
      kind: 'move'
      ids: string[]
      wireIds: string[]
      labelIds: string[]
      start: LocalPoint
      dx: number
      dy: number
    }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; additive: boolean }
  | {
      kind: 'wire-segment'
      wireId: string
      index: number
      original: readonly GridPoint[]
      preview: GridPoint[]
    }
  | {
      kind: 'wire-vertex'
      wireId: string
      index: number
      original: readonly GridPoint[]
      preview: GridPoint[]
    }

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

function snapGrid(point: LocalPoint): GridPoint {
  return [Math.round(point.x), Math.round(point.y)]
}

function nearestPin(point: LocalPoint): PinRef | null {
  let best: PinRef | null = null
  let bestDistance = PIN_SNAP_CELLS
  for (const pin of store.pinRefs) {
    const distance = Math.hypot(pin.point[0] - point.x, pin.point[1] - point.y)
    if (distance <= bestDistance) {
      best = pin
      bestDistance = distance
    }
  }
  return best
}

/** Point de départ ou d'arrivée d'un fil : une broche proche l'emporte sur la grille. */
function wireSnap(point: LocalPoint): { point: GridPoint; pinKey: string | null } {
  const pin = nearestPin(point)
  return pin ? { point: pin.point, pinKey: pin.key } : { point: snapGrid(point), pinKey: null }
}

function wireAt(point: GridPoint): Wire | null {
  return store.doc.wires.find((wire) => locateOnWire(wire.points, point) !== null) ?? null
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

// Déplacement en cours

const selectedSet = computed(() => new Set(store.selection))
const selectedWireSet = computed(() => new Set(store.selectedWires))
const selectedLabelSet = computed(() => new Set(store.selectedLabels))

const moveOffset = computed(() => {
  const current = drag.value
  return current?.kind === 'move'
    ? {
        ids: new Set(current.ids),
        labelIds: new Set(current.labelIds),
        dx: current.dx,
        dy: current.dy
      }
    : null
})

function offsetOf(id: string): { dx: number; dy: number } {
  const offset = moveOffset.value
  return offset && offset.ids.has(id) ? { dx: offset.dx, dy: offset.dy } : { dx: 0, dy: 0 }
}

function labelOffsetOf(id: string): { dx: number; dy: number } {
  const offset = moveOffset.value
  return offset && offset.labelIds.has(id) ? { dx: offset.dx, dy: offset.dy } : { dx: 0, dy: 0 }
}

/**
 * Fils pendant un déplacement : les fils sélectionnés suivent le vecteur, les extrémités posées
 * sur une broche d'un composant déplacé suivent leur broche (même règle que la commande finale).
 */
const previewWires = computed<Map<string, readonly GridPoint[]> | null>(() => {
  const current = drag.value
  if (current?.kind !== 'move' || (current.dx === 0 && current.dy === 0)) return null
  const { dx, dy } = current
  const moving = new Set(current.ids)
  const pinsAfter = store.pinRefs.map((pin) =>
    moving.has(pin.instanceId)
      ? { ...pin, point: [pin.point[0] + dx, pin.point[1] + dy] as GridPoint }
      : pin
  )
  const translated = new Map<string, GridPoint>(
    current.wireIds.map((id) => [id, [dx, dy] as GridPoint])
  )
  const adjusted = wiresFollowingPins(store.doc.wires, store.pinRefs, pinsAfter, translated)
  return new Map(adjusted.map((wire) => [wire.id, wire.points]))
})

// Instances

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
  if (!store.showPins && !store.showUnconnected) return []
  const unconnected = store.connectivity.unconnectedPinKeys
  return store.placed.flatMap((item) => {
    const { dx, dy } = offsetOf(item.instance.id)
    return item.def.pins.map((pin) => {
      const point = absolutePinPosition(item.instance, item.def, pin)
      const key = `${item.instance.id}:${pin.id}`
      return {
        key,
        x: point.x + dx,
        y: point.y + dy,
        kind: pin.kind,
        unconnected: unconnected.has(key)
      }
    })
  })
})

const labelFontCells = computed(() => profile.value.labelFont.size / profile.value.cellPx)

// Étiquettes texte

const labels = computed(() =>
  store.doc.labels.map((label) => {
    const { dx, dy } = labelOffsetOf(label.id)
    const bounds = textLabelBounds(label, profile.value.cellPx)
    return {
      label,
      x: label.x + dx,
      y: label.y + dy,
      fontCells: label.size / profile.value.cellPx,
      box: { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
      selected: selectedLabelSet.value.has(label.id)
    }
  })
)

// Fils

function wirePoints(wire: Wire): readonly GridPoint[] {
  const current = drag.value
  if (
    (current?.kind === 'wire-segment' || current?.kind === 'wire-vertex') &&
    current.wireId === wire.id
  ) {
    return current.preview
  }
  return previewWires.value?.get(wire.id) ?? wire.points
}

const renderedWires = computed(() =>
  store.sortedWires.map((wire) => {
    const points = wirePoints(wire)
    return {
      wire,
      points,
      d: wirePathData(points, cornerRadius.value),
      selected: selectedWireSet.value.has(wire.id),
      inHoverNet:
        store.hoverNet !== null && store.connectivity.wireNet.get(wire.id) === store.hoverNet
    }
  })
)

const hitWidth = computed(() => Math.max(wireWidth.value, 10 / cell.value))

const wireColorById = computed(() => new Map(store.doc.wires.map((wire) => [wire.id, wire.color])))

/** Croisements : le fil du dessus, redessiné sur une demi-cellule avec un liseré blanc. */
const crossingMarks = computed(() =>
  store.pieces.map((piece) => {
    const [x, y] = piece.point
    return {
      key: `${x},${y}`,
      x1: piece.horizontal ? x - 0.5 : x,
      y1: piece.horizontal ? y : y - 0.5,
      x2: piece.horizontal ? x + 0.5 : x,
      y2: piece.horizontal ? y : y + 0.5,
      color: wireColorById.value.get(piece.topWireId) ?? '#000000'
    }
  })
)

const junctions = computed(() => {
  const radius = (wireWidth.value * profile.value.junctionScale) / 2
  const fixed = profile.value.junctionColor
  return store.connectivity.junctions.map((junction) => ({
    key: `${junction.point[0]},${junction.point[1]}`,
    x: junction.point[0],
    y: junction.point[1],
    r: radius,
    fill: fixed === 'wire' ? (wireColorById.value.get(junction.carrierWireId) ?? '#000000') : fixed
  }))
})

const freeEnds = computed(() =>
  store.connectivity.freeEnds.map((end) => ({
    key: `${end.wireId}:${end.endIndex}`,
    x: end.point[0],
    y: end.point[1]
  }))
)

const vertexHandles = computed(() =>
  store.doc.wires
    .filter((wire) => selectedWireSet.value.has(wire.id))
    .flatMap((wire) =>
      wirePoints(wire).map(([x, y], index) => ({
        key: `${wire.id}:${index}`,
        wireId: wire.id,
        index,
        x,
        y
      }))
    )
)

const drawingPreview = computed(() => {
  const current = store.drawing
  const point = hover.value
  if (!current) return null
  const last = current.points.at(-1)
  if (!last) return null
  const committed = wirePathData(current.points, cornerRadius.value)
  if (!point) return { committed, pending: '', end: null as GridPoint | null, onPin: false }
  const snap = wireSnap(point)
  const route = routeLAuto(last, snap.point, store.shiftHeld)
  return {
    committed,
    pending: wirePathData([...current.points, ...route.slice(1)], cornerRadius.value),
    end: snap.point,
    onPin: snap.pinKey !== null
  }
})

const wireStartTarget = computed(() => {
  if (store.tool !== 'wire' || store.drawing || !hover.value) return null
  return wireSnap(hover.value)
})

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
    label: '',
    fields: {}
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

function startMove(event: PointerEvent): void {
  drag.value = {
    kind: 'move',
    ids: [...store.selection],
    wireIds: [...store.selectedWires],
    labelIds: [...store.selectedLabels],
    start: toWorld(screenPoint(event)),
    dx: 0,
    dy: 0
  }
  capture(event)
}

function onInstanceDown(id: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  if (event.shiftKey) {
    store.selection = selectedSet.value.has(id)
      ? store.selection.filter((selected) => selected !== id)
      : [...store.selection, id]
    return
  }
  if (!selectedSet.value.has(id)) {
    store.clearSelection()
    store.selection = [id]
  }
  startMove(event)
}

function onLabelDown(label: TextLabel, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  if (event.shiftKey) {
    store.selectedLabels = selectedLabelSet.value.has(label.id)
      ? store.selectedLabels.filter((selected) => selected !== label.id)
      : [...store.selectedLabels, label.id]
    return
  }
  if (!selectedLabelSet.value.has(label.id)) {
    store.clearSelection()
    store.selectedLabels = [label.id]
  }
  startMove(event)
}

function onWireDown(wireId: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const world = toWorld(screenPoint(event))
  if (event.altKey) {
    if (!store.toggleCrossing(world.x, world.y)) store.status = 'Aucun croisement ici.'
    return
  }
  if (event.shiftKey) {
    store.selectedWires = selectedWireSet.value.has(wireId)
      ? store.selectedWires.filter((selected) => selected !== wireId)
      : [...store.selectedWires, wireId]
    return
  }
  if (!selectedWireSet.value.has(wireId)) {
    store.clearSelection()
    store.selectedWires = [wireId]
  }
  // Plusieurs éléments sélectionnés : le glisser déplace tout ; un fil seul : on déplace le segment.
  if (
    store.selection.length > 0 ||
    store.selectedLabels.length > 0 ||
    store.selectedWires.length > 1
  ) {
    startMove(event)
    return
  }
  const wire = store.doc.wires.find((candidate) => candidate.id === wireId)
  if (!wire) return
  drag.value = {
    kind: 'wire-segment',
    wireId,
    index: nearestSegmentIndex(wire.points, world),
    original: wire.points,
    preview: [...wire.points]
  }
  capture(event)
}

function onVertexDown(wireId: string, index: number, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const wire = store.doc.wires.find((candidate) => candidate.id === wireId)
  if (!wire) return
  drag.value = {
    kind: 'wire-vertex',
    wireId,
    index,
    original: wire.points,
    preview: [...wire.points]
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
  const world = toWorld(screenPoint(event))

  if (store.tool === 'place') {
    const current = ghost.value
    if (current) store.placeAt(current.instance.x, current.instance.y)
    return
  }

  if (store.tool === 'text') {
    const [x, y] = snapGrid(world)
    store.addLabel(x, y)
    return
  }

  if (store.tool === 'wire') {
    const snap = wireSnap(world)
    const current = store.drawing
    if (!current) {
      store.beginWire(snap.point)
      return
    }
    const last = current.points.at(-1)
    if (!last) return
    store.appendWirePoints(routeLAuto(last, snap.point, store.shiftHeld).slice(1))
    if (snap.pinKey !== null || wireAt(snap.point)) store.finishWire()
    return
  }

  if (!event.shiftKey) store.clearSelection()
  drag.value = { kind: 'band', start: world, current: world, additive: event.shiftKey }
  capture(event)
}

function onPointerMove(event: PointerEvent): void {
  const world = toWorld(screenPoint(event))
  hover.value = world
  const current = drag.value
  if (!current) return
  switch (current.kind) {
    case 'pan':
      store.panBy(event.clientX - current.lastX, event.clientY - current.lastY)
      current.lastX = event.clientX
      current.lastY = event.clientY
      break
    case 'move':
      current.dx = Math.round(world.x - current.start.x)
      current.dy = Math.round(world.y - current.start.y)
      break
    case 'band':
      current.current = world
      break
    case 'wire-segment': {
      const a = current.original[current.index]
      const b = current.original[current.index + 1]
      if (!a || !b) break
      const horizontal = a[1] === b[1]
      current.preview = moveSegment(
        current.original,
        current.index,
        Math.round(horizontal ? world.y : world.x)
      )
      break
    }
    case 'wire-vertex':
      current.preview = dragVertex(current.original, current.index, snapGrid(world))
      break
  }
}

function samePoints(a: readonly GridPoint[], b: readonly GridPoint[]): boolean {
  return (
    a.length === b.length && a.every((point, i) => b[i]?.[0] === point[0] && b[i]?.[1] === point[1])
  )
}

function onPointerUp(event: PointerEvent): void {
  const current = drag.value
  if (!current) return
  drag.value = null
  if (current.kind === 'move') {
    store.moveSelection(current.dx, current.dy)
  } else if (current.kind === 'band') {
    const rect = normalizeRect(current.start, current.current)
    if (rect.width > 0.05 || rect.height > 0.05) {
      const instances = store.placed
        .filter((item) => rectsIntersect(instanceBounds(item.instance, item.def), rect))
        .map((item) => item.instance.id)
      const wires = store.doc.wires
        .filter((wire) => wireIntersectsRect(wire.points, rect))
        .map((wire) => wire.id)
      const texts = store.doc.labels
        .filter((label) => rectsIntersect(textLabelBounds(label, profile.value.cellPx), rect))
        .map((label) => label.id)
      store.selection = current.additive
        ? [...new Set([...store.selection, ...instances])]
        : instances
      store.selectedWires = current.additive
        ? [...new Set([...store.selectedWires, ...wires])]
        : wires
      store.selectedLabels = current.additive
        ? [...new Set([...store.selectedLabels, ...texts])]
        : texts
    }
  } else if (current.kind === 'wire-segment' || current.kind === 'wire-vertex') {
    if (!samePoints(current.original, current.preview)) {
      store.setWirePoints(current.wireId, current.preview)
    }
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
}

function onDoubleClick(): void {
  if (store.tool === 'wire') store.finishWire()
}

function onInstanceDoubleClick(id: string, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  emit('editInstance', id)
}

function onLabelDoubleClick(id: string, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  emit('editLabel', id)
}

/**
 * Clic droit : termine le fil en cours ou arrête la pose ; sinon l'élément visé entre dans la
 * sélection (s'il n'y est pas déjà) et le menu contextuel s'ouvre.
 */
function onContextMenu(event: MouseEvent, target: MenuTarget): void {
  event.preventDefault()
  event.stopPropagation()
  if (drag.value) {
    drag.value = null
    return
  }
  if (store.tool === 'wire' && store.drawing) {
    store.finishWire()
    return
  }
  if (store.tool === 'place') {
    store.stopPlacing()
    return
  }
  if (target.kind === 'instance' && !selectedSet.value.has(target.id)) {
    store.clearSelection()
    store.selection = [target.id]
  } else if (target.kind === 'wire' && !selectedWireSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedWires = [target.id]
  } else if (target.kind === 'label' && !selectedLabelSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedLabels = [target.id]
  }
  const world = toWorld(screenPoint(event))
  emit('openMenu', { x: event.clientX, y: event.clientY, cell: snapGrid(world), target })
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
  if (store.tool === 'place') return 'placing'
  if (store.tool === 'text') return 'texting'
  return store.tool === 'wire' ? 'wiring' : ''
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
        @dblclick="onDoubleClick"
        @wheel.prevent="onWheel"
        @contextmenu="onContextMenu($event, { kind: 'empty' })"
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
          <g class="wires">
            <template v-for="item in renderedWires" :key="item.wire.id">
              <path
                v-if="item.inHoverNet"
                class="net-glow"
                :d="item.d"
                :stroke-width="wireWidth * 4"
              />
              <path
                v-if="item.selected"
                class="wire-selected"
                :d="item.d"
                :stroke-width="wireWidth + 6 / cell"
              />
              <path class="wire" :d="item.d" :stroke="item.wire.color" :stroke-width="wireWidth" />
              <path
                class="wire-hit"
                :d="item.d"
                :stroke-width="hitWidth"
                @pointerdown="onWireDown(item.wire.id, $event)"
                @pointerenter="store.hoverWireId = item.wire.id"
                @pointerleave="store.hoverWireId = null"
                @contextmenu="onContextMenu($event, { kind: 'wire', id: item.wire.id })"
              />
            </template>
          </g>

          <g class="crossings">
            <template v-for="mark in crossingMarks" :key="mark.key">
              <line
                class="halo"
                :x1="mark.x1"
                :y1="mark.y1"
                :x2="mark.x2"
                :y2="mark.y2"
                :stroke-width="wireWidth * 2.2"
              />
              <line
                :x1="mark.x1"
                :y1="mark.y1"
                :x2="mark.x2"
                :y2="mark.y2"
                :stroke="mark.color"
                :stroke-width="wireWidth"
              />
            </template>
          </g>

          <g class="junctions">
            <circle
              v-for="dot in junctions"
              :key="dot.key"
              :cx="dot.x"
              :cy="dot.y"
              :r="dot.r"
              :fill="dot.fill"
            />
          </g>

          <g
            v-for="item in store.placed"
            :key="item.instance.id"
            class="instance"
            :transform="transformOf(item)"
            @pointerdown="onInstanceDown(item.instance.id, $event)"
            @dblclick="onInstanceDoubleClick(item.instance.id, $event)"
            @contextmenu="onContextMenu($event, { kind: 'instance', id: item.instance.id })"
          >
            <ComponentGraphic
              :def="item.def"
              :cell-px="1"
              :stroke-base="profile.componentStroke"
              :fields="item.instance.fields"
            />
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

          <g class="texts">
            <g
              v-for="entry in labels"
              :key="entry.label.id"
              class="text-label"
              @pointerdown="onLabelDown(entry.label, $event)"
              @dblclick="onLabelDoubleClick(entry.label.id, $event)"
              @contextmenu="onContextMenu($event, { kind: 'label', id: entry.label.id })"
            >
              <text
                :x="entry.x"
                :y="entry.y"
                :font-size="entry.fontCells"
                :font-family="profile.labelFont.family"
              >
                {{ entry.label.text }}
              </text>
              <rect
                class="hit"
                :x="entry.box.x"
                :y="entry.box.y"
                :width="entry.box.width"
                :height="entry.box.height"
                fill="transparent"
              />
              <rect
                v-if="entry.selected"
                class="selection"
                :x="entry.box.x - 0.15"
                :y="entry.box.y - 0.15"
                :width="entry.box.width + 0.3"
                :height="entry.box.height + 0.3"
                vector-effect="non-scaling-stroke"
              />
            </g>
          </g>

          <g class="pins">
            <template v-for="pin in pins" :key="pin.key">
              <circle
                v-if="store.showPins"
                :cx="pin.x"
                :cy="pin.y"
                :r="3 / cell"
                :fill="PIN_COLORS[pin.kind]"
              />
              <circle
                v-if="store.showUnconnected && pin.unconnected"
                class="unconnected"
                :cx="pin.x"
                :cy="pin.y"
                :r="7 / cell"
                vector-effect="non-scaling-stroke"
              />
            </template>
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

          <g class="edit-marks">
            <rect
              v-for="end in freeEnds"
              :key="end.key"
              class="free-end"
              :x="end.x - 4 / cell"
              :y="end.y - 4 / cell"
              :width="8 / cell"
              :height="8 / cell"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-for="handle in vertexHandles"
              :key="handle.key"
              class="vertex-handle"
              :cx="handle.x"
              :cy="handle.y"
              :r="4.5 / cell"
              vector-effect="non-scaling-stroke"
              @pointerdown="onVertexDown(handle.wireId, handle.index, $event)"
              @contextmenu="onContextMenu($event, { kind: 'wire', id: handle.wireId })"
            />
          </g>

          <g v-if="ghost" class="ghost" :transform="ghost.transform">
            <ComponentGraphic
              :def="ghost.def"
              :cell-px="1"
              :stroke-base="profile.componentStroke"
            />
            <rect
              class="ghost-box"
              :width="ghost.def.size.widthCells"
              :height="ghost.def.size.heightCells"
              vector-effect="non-scaling-stroke"
            />
          </g>

          <g v-if="drawingPreview" class="drawing">
            <path class="pending" :d="drawingPreview.pending" :stroke-width="wireWidth" />
            <path
              class="committed"
              :d="drawingPreview.committed"
              :stroke="store.currentColor"
              :stroke-width="wireWidth"
            />
            <circle
              v-if="drawingPreview.end"
              class="end"
              :class="{ 'on-pin': drawingPreview.onPin }"
              :cx="drawingPreview.end[0]"
              :cy="drawingPreview.end[1]"
              :r="5 / cell"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <circle
            v-if="wireStartTarget"
            class="wire-start"
            :class="{ 'on-pin': wireStartTarget.pinKey !== null }"
            :cx="wireStartTarget.point[0]"
            :cy="wireStartTarget.point[1]"
            :r="5 / cell"
            vector-effect="non-scaling-stroke"
          />

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

.schematic.wiring {
  cursor: crosshair;
}

.schematic.texting {
  cursor: text;
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

.wires path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wire-hit {
  stroke: transparent;
  pointer-events: stroke;
  cursor: pointer;
}

.wire-selected {
  stroke: #1f6feb;
  stroke-opacity: 0.35;
  pointer-events: none;
}

.net-glow {
  stroke: #ffd33d;
  stroke-opacity: 0.45;
  pointer-events: none;
}

.crossings line {
  pointer-events: none;
  stroke-linecap: butt;
}

.crossings .halo {
  stroke: #ffffff;
}

.junctions circle {
  pointer-events: none;
}

.instance {
  cursor: move;
}

.labels text {
  fill: #1f2328;
  pointer-events: none;
}

.text-label {
  cursor: move;
}

.text-label text {
  fill: #1f2328;
  pointer-events: none;
}

.pins circle {
  pointer-events: none;
}

.pins .unconnected {
  fill: none;
  stroke: #cf222e;
  stroke-width: 1.5;
}

.selection {
  fill: none;
  stroke: #1f6feb;
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.free-end {
  fill: #ffffff;
  stroke: #cf222e;
  stroke-width: 1.5;
  pointer-events: none;
}

.vertex-handle {
  fill: #ffffff;
  stroke: #1f6feb;
  stroke-width: 1.5;
  cursor: move;
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

.drawing path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.drawing .pending {
  stroke: #1f6feb;
  stroke-opacity: 0.6;
}

.drawing .end,
.wire-start {
  fill: rgba(31, 111, 235, 0.15);
  stroke: #1f6feb;
  stroke-width: 1.5;
  pointer-events: none;
}

.drawing .end.on-pin,
.wire-start.on-pin {
  fill: rgba(26, 127, 55, 0.25);
  stroke: #1a7f37;
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
