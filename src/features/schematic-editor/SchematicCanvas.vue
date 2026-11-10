<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  absolutePinPosition,
  boxHandles,
  componentImages,
  crossingPieceEnds,
  dragVertex,
  gridLines,
  instanceBounds,
  instanceMatrix,
  instanceTextPlacements,
  textPlacementTransform,
  layoutLabel,
  layoutTextBox,
  locateOnWire,
  matrixToSvg,
  moveSegment,
  nearestSegmentIndex,
  pointsAttribute,
  rectsIntersect,
  resizeBox,
  rotatedSize,
  routeWire,
  screenToWorld,
  segmentCoordinate,
  textContent,
  textEmphasisAttrs,
  textStyleAttrs,
  textTransform,
  textLabelBounds,
  wireEndLabelPlacement,
  wireIntersectsRect,
  wirePathData,
  wireRenderParts,
  wiresFollowingJunctions,
  wiresFollowingPins,
  computeConnectivity,
  type Junction,
  type Box,
  type ComponentInstance,
  type GridPoint,
  type GridRect,
  type LocalPoint,
  type PinKind,
  type PinRef,
  type TextLabel,
  type Wire,
  type WireEndFlags
} from '@/domain'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import { screenColor } from '@/render/ink'
import type { MenuRequest, MenuTarget } from './menu'
import { useSchematicStore, type PlacedInstance } from './store'

// Canevas infini du montage. Tout le contenu est dessiné en unités de cellule dans un groupe
// mis à l'échelle (zoom) et translaté (pan) ; seule la grille est calculée en pixels d'écran.
// Ordre d'empilement : grille, composants mis derrière les fils, fils (corps, queues
// pointillées, pointes), croisements (fil du dessus avec liseré), points de jonction, les
// autres composants, repères, étiquettes, étiquettes
// d'extrémité, broches (et anneau de saisie de la broche survolée), surcouches de sélection et
// d'édition, copies fantômes (Alt+glisser),
// fantôme de pose, tracé en cours, rectangle de sélection.

const store = useSchematicStore()
const emit = defineEmits<{
  openMenu: [request: MenuRequest]
  editInstance: [id: string]
  editLabel: [id: string]
  editWireEnd: [wireId: string, endIndex: number]
}>()
const host = ref<HTMLDivElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)

const PIN_COLORS: Record<PinKind, string> = {
  in: '#15803d',
  out: '#ea580c',
  io: '#1d4ed8',
  power: '#d62828'
}
const ZOOM_STEP = 1.1
const PIN_SNAP_CELLS = 0.5
/** Anneau de la broche qu'un Ctrl+glisser saisirait : 8 px de rayon, 0,4 cellule au plus de loin. */
const PIN_GRAB_PX = 8
const PIN_GRAB_CELLS = 0.4
/** Déplacement du pointeur, en pixels, à partir duquel un appui sur une broche devient un fil. */
const PIN_DRAG_PX = 4
const END_PICK_CELLS = 0.5
const NO_FREE_ENDS: WireEndFlags = { start: false, end: false }

const cell = computed(() => store.cellPx)
const view = computed(() => store.view)
const profile = computed(() => store.profile)
const wireWidth = computed(() => profile.value.wireWidth)
const cornerRadius = computed(() => profile.value.cornerRadius)
const labelFontCells = computed(() => profile.value.labelFont.size / profile.value.cellPx)
const endLabelFontCells = computed(() => profile.value.endLabelFont.size / profile.value.cellPx)

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
      /** Alt+glisser : les originaux restent, une copie se dépose à l'arrivée. */
      duplicate: boolean
    }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; additive: boolean }
  | { kind: 'text-box'; start: GridPoint; current: GridPoint }
  | { kind: 'label-handle'; id: string; handleId: string; original: Box; preview: Box }
  | {
      /** Fil tiré d'une broche par Ctrl+glisser en mode sélection : relâcher le pose. */
      kind: 'pin-wire'
      instanceId: string
      pinKey: string
      origin: GridPoint
      downX: number
      downY: number
      /** Faux tant que le pointeur n'a pas quitté la broche : un simple clic sélectionne le composant. */
      moved: boolean
    }
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
/** Instant du dernier appui du bouton du milieu : deux appuis rapprochés ajustent la vue au contenu. */
let lastMiddleDown = 0
const DOUBLE_CLICK_MS = 400

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
  return screenToWorld(view.value, cell.value, screen.x, screen.y)
}

function snapGrid(point: LocalPoint): GridPoint {
  return [Math.round(point.x), Math.round(point.y)]
}

/** Broche la plus proche à portée ; `instanceId` ne regarde que celles d'un composant. */
function nearestPin(
  point: LocalPoint,
  reach = PIN_SNAP_CELLS,
  instanceId: string | null = null
): PinRef | null {
  let best: PinRef | null = null
  let bestDistance = reach
  for (const pin of store.pinRefs) {
    if (instanceId !== null && pin.instanceId !== instanceId) continue
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

const grid = computed(() => gridLines(view.value, cell.value, store.viewport))

// Déplacement en cours

const selectedSet = computed(() => new Set(store.selection))
const selectedWireSet = computed(() => new Set(store.selectedWires))
const selectedLabelSet = computed(() => new Set(store.selectedLabels))

/** Décalage appliqué aux originaux pendant un déplacement (pas pendant une copie). */
const moveOffset = computed(() => {
  const current = drag.value
  return current?.kind === 'move' && !current.duplicate
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
 * Aperçu pendant un geste, selon les règles des commandes finales : pendant un déplacement, les
 * fils sélectionnés suivent le vecteur et les extrémités posées sur une broche d'un composant
 * déplacé suivent leur broche ; pendant le glisser d'un segment ou d'un sommet, le fil prend son
 * nouveau tracé. Dans tous les cas, les jonctions suivent le fil qui les porte.
 */
const dragPreview = computed<{
  wires: Map<string, readonly GridPoint[]>
  junctions: Junction[]
} | null>(() => {
  const current = drag.value
  let pins = store.pinRefs
  let after: Wire[]
  if (current?.kind === 'wire-segment' || current?.kind === 'wire-vertex') {
    if (samePoints(current.original, current.preview)) return null
    after = store.doc.wires.map((wire) =>
      wire.id === current.wireId ? { ...wire, points: [...current.preview] } : wire
    )
  } else if (
    current?.kind === 'move' &&
    !current.duplicate &&
    (current.dx !== 0 || current.dy !== 0)
  ) {
    const { dx, dy } = current
    const moving = new Set(current.ids)
    pins = store.pinRefs.map((pin) =>
      moving.has(pin.instanceId)
        ? { ...pin, point: [pin.point[0] + dx, pin.point[1] + dy] as GridPoint }
        : pin
    )
    const translated = new Map<string, GridPoint>(
      current.wireIds.map((id) => [id, [dx, dy] as GridPoint])
    )
    after = wiresFollowingPins(store.doc.wires, store.pinRefs, pins, translated)
  } else {
    return null
  }
  const followed = wiresFollowingJunctions(store.doc.wires, after, pins)
  return {
    wires: new Map(followed.map((wire) => [wire.id, wire.points])),
    junctions: computeConnectivity(followed, pins).junctions
  }
})

const previewWires = computed(() => dragPreview.value?.wires ?? null)

/** Copies fantômes pendant un Alt+glisser : la sélection, décalée, en transparence. */
const ghostCopies = computed(() => {
  const current = drag.value
  if (current?.kind !== 'move' || !current.duplicate || (current.dx === 0 && current.dy === 0)) {
    return null
  }
  const ids = new Set(current.ids)
  const wireIds = new Set(current.wireIds)
  const labelIds = new Set(current.labelIds)
  return {
    transform: `translate(${current.dx} ${current.dy})`,
    instances: store.placed.filter((item) => ids.has(item.instance.id)),
    wires: store.doc.wires
      .filter((wire) => wireIds.has(wire.id))
      .map((wire) => ({
        id: wire.id,
        color: wire.color,
        d: wirePathData(wire.points, cornerRadius.value)
      })),
    labels: store.doc.labels
      .filter((label) => labelIds.has(label.id))
      .map((label) => ({
        label,
        transform: textTransform(label),
        layout: layoutLabel(label, profile.value.cellPx)
      }))
  }
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

/** Textes des composants, hors de la transformation : droits, ou tournés avec le composant sans miroir. */
const instanceTexts = computed(() =>
  store.placed.flatMap((item) => {
    const { dx, dy } = offsetOf(item.instance.id)
    const stale = store.staleDefIds.has(item.def.id)
    return instanceTextPlacements(item.instance, item.def).map((placement, index) => {
      const box = { ...placement.box, x: placement.box.x + dx, y: placement.box.y + dy }
      const { primitive, anchor } = placement
      return {
        key: `${item.instance.id}:${index}`,
        behind: item.instance.behindWires,
        primitive,
        anchor,
        fill: stale ? 'var(--stale)' : screenColor(primitive.color),
        transform: textPlacementTransform({ ...placement, box }),
        layout: layoutTextBox(
          box,
          textContent(primitive, item.instance.fields),
          primitive.size,
          anchor
        )
      }
    })
  })
)

/** Empilement du montage : les composants mis derrière les fils, les fils, les autres composants. */
const STACK = ['back', 'wires', 'front'] as const

interface ComponentLayer {
  instances: PlacedInstance[]
  texts: (typeof instanceTexts.value)[number][]
}

/** Composants et textes de composant de chaque couche, dans l'ordre du montage. */
const layers = computed<Record<(typeof STACK)[number], ComponentLayer>>(() => {
  const layer = (behind: boolean): ComponentLayer => ({
    instances: store.placed.filter((item) => item.instance.behindWires === behind),
    texts: instanceTexts.value.filter((entry) => entry.behind === behind)
  })
  return { back: layer(true), wires: { instances: [], texts: [] }, front: layer(false) }
})

// Étiquettes texte

/** Boîte d'une étiquette telle qu'affichée : aperçu de poignée, sinon décalage de déplacement. */
function labelBox(label: TextLabel): Box {
  const current = drag.value
  if (current?.kind === 'label-handle' && current.id === label.id) return current.preview
  const { dx, dy } = labelOffsetOf(label.id)
  return { x: label.x + dx, y: label.y + dy, w: label.w, h: label.h }
}

const labels = computed(() =>
  store.doc.labels.map((label) => {
    const box = labelBox(label)
    const fontCells = label.size / profile.value.cellPx
    return {
      label,
      fontCells,
      box,
      transform: textTransform({ ...box, vertical: label.vertical }),
      layout: layoutLabel(label, profile.value.cellPx, box),
      selected: selectedLabelSet.value.has(label.id)
    }
  })
)

/** Poignées de la boîte d'une étiquette seule sélectionnée, hors déplacement. */
const labelHandles = computed(() => {
  const id = store.selectedLabels[0]
  if (
    id === undefined ||
    store.selectedLabels.length !== 1 ||
    store.selection.length > 0 ||
    store.selectedWires.length > 0 ||
    drag.value?.kind === 'move'
  ) {
    return []
  }
  const label = store.doc.labels.find((candidate) => candidate.id === id)
  if (!label) return []
  return boxHandles(labelBox(label)).map((handle) => ({ ...handle, labelId: label.id }))
})

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

/** Extrémités libres par fil (début, fin), d'après la connectivité du document. */
const freeEndFlags = computed(() => {
  const flags = new Map<string, WireEndFlags>()
  for (const end of store.connectivity.freeEnds) {
    const wire = store.doc.wires.find((candidate) => candidate.id === end.wireId)
    if (!wire) continue
    const current = flags.get(end.wireId) ?? { start: false, end: false }
    if (end.endIndex === 0) current.start = true
    if (end.endIndex === wire.points.length - 1) current.end = true
    flags.set(end.wireId, current)
  }
  return flags
})

const renderedWires = computed(() =>
  store.sortedWires.map((wire) => {
    const points = wirePoints(wire)
    const flags = freeEndFlags.value.get(wire.id) ?? NO_FREE_ENDS
    const shown = wireRenderParts(points, wire.freeEnds, flags, wireWidth.value)
    return {
      wire,
      d: wirePathData(points, cornerRadius.value),
      body: shown.body.length >= 2 ? wirePathData(shown.body, cornerRadius.value) : '',
      dotted: shown.dotted.map((tail) => wirePathData(tail, cornerRadius.value)),
      heads: shown.heads.map((head) => pointsAttribute(head)),
      selected: selectedWireSet.value.has(wire.id),
      inHoverNet:
        store.hoverNet !== null && store.connectivity.wireNet.get(wire.id) === store.hoverNet
    }
  })
)

const hitWidth = computed(() => Math.max(wireWidth.value, 10 / cell.value))

const wireColorById = computed(() => new Map(store.doc.wires.map((wire) => [wire.id, wire.color])))

/** Croisements : le fil du dessus, redessiné sur une demi-cellule avec un liseré couleur papier. */
const crossingMarks = computed(() =>
  store.pieces.map((piece) => {
    const [[x1, y1], [x2, y2]] = crossingPieceEnds(piece)
    return {
      key: `${piece.point[0]},${piece.point[1]}`,
      x1,
      y1,
      x2,
      y2,
      color: wireColorById.value.get(piece.topWireId) ?? '#000000'
    }
  })
)

const junctions = computed(() => {
  const radius = (wireWidth.value * profile.value.junctionScale) / 2
  const fixed = profile.value.junctionColor
  // Pendant un geste, les points de jonction sont ceux de l'aperçu.
  const list = dragPreview.value?.junctions ?? store.connectivity.junctions
  return list.map((junction) => ({
    key: `${junction.point[0]},${junction.point[1]}`,
    x: junction.point[0],
    y: junction.point[1],
    r: radius,
    fill: fixed === 'wire' ? (wireColorById.value.get(junction.carrierWireId) ?? '#000000') : fixed
  }))
})

function endLabelText(wire: Wire, endIndex: number): string {
  return endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
}

/** Étiquettes d'extrémité : point sur le bout libre et texte placé à l'opposé du fil. */
const endLabels = computed(() =>
  store.connectivity.freeEnds.flatMap((end) => {
    const wire = store.doc.wires.find((candidate) => candidate.id === end.wireId)
    if (!wire) return []
    const text = endLabelText(wire, end.endIndex)
    if (text.length === 0) return []
    const points = wirePoints(wire)
    const placement = wireEndLabelPlacement(points, end.endIndex)
    const dot = points[end.endIndex]
    if (!placement || !dot) return []
    return [
      {
        key: `${wire.id}:${end.endIndex}`,
        wireId: wire.id,
        endIndex: end.endIndex,
        text,
        color: wire.color,
        dotX: dot[0],
        dotY: dot[1],
        ...placement
      }
    ]
  })
)

/** Extrémités reliées à rien, sans étiquette : un petit carré rouge d'édition. */
const freeEnds = computed(() =>
  store.connectivity.freeEnds.flatMap((end) => {
    const wire = store.doc.wires.find((candidate) => candidate.id === end.wireId)
    if (!wire || endLabelText(wire, end.endIndex).length > 0) return []
    const point = wirePoints(wire)[end.endIndex] ?? end.point
    return [{ key: `${end.wireId}:${end.endIndex}`, x: point[0], y: point[1] }]
  })
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

/** Rayon de l'anneau montré sur la broche saisie, en cellules. */
const pinGrabReach = computed(() => Math.min(PIN_GRAB_CELLS, PIN_GRAB_PX / cell.value))

/** Composant sous un point : le dernier dessiné dont la boîte le contient. */
function instanceAt(point: LocalPoint): string | null {
  const drawn = [...layers.value.back.instances, ...layers.value.front.instances]
  for (let index = drawn.length - 1; index >= 0; index--) {
    const item = drawn[index]
    if (!item) continue
    const bounds = instanceBounds(item.instance, item.def)
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return item.instance.id
    }
  }
  return null
}

/**
 * Broche qu'un Ctrl+glisser saisirait, en mode sélection : la plus proche du pointeur parmi celles
 * du composant survolé, sinon une broche à portée. Ctrl tient ici le rôle qu'il a dans l'éditeur
 * de composants, où il saisit la poignée la plus proche d'une forme. Sans Ctrl, rien : glisser un
 * composant le déplace. L'anneau reste pendant un simple Ctrl+clic.
 */
const pinGrab = computed<PinRef | null>(() => {
  const current = drag.value
  if (current) {
    if (current.kind !== 'pin-wire' || current.moved) return null
    return store.pinRefs.find((pin) => pin.key === current.pinKey) ?? null
  }
  const point = hover.value
  if (store.tool !== 'select' || !store.ctrlHeld || store.panKeyHeld || !point) return null
  const over = instanceAt(point)
  return over === null ? nearestPin(point) : nearestPin(point, Number.POSITIVE_INFINITY, over)
})

/** Sommets posés du tracé en cours : ceux de l'outil Fil, ou la broche d'où l'on tire un fil. */
const drawingPoints = computed<readonly GridPoint[] | null>(() => {
  const current = drag.value
  if (current?.kind === 'pin-wire') return current.moved ? [current.origin] : null
  return store.drawing?.points ?? null
})

/** Trajet d'un tracé jusqu'à un point : en L, à 45° tant qu'Alt est enfoncée ; Maj change l'ordre. */
function wireRoute(from: GridPoint, to: GridPoint): GridPoint[] {
  return routeWire(from, to, { invert: store.shiftHeld, diagonal: store.altHeld })
}

const drawingPreview = computed(() => {
  const points = drawingPoints.value
  const point = hover.value
  if (!points) return null
  const last = points.at(-1)
  if (!last) return null
  const committed = wirePathData(points, cornerRadius.value)
  if (!point) return { committed, pending: '', end: null as GridPoint | null, onPin: false }
  const snap = wireSnap(point)
  const route = wireRoute(last, snap.point)
  return {
    committed,
    pending: wirePathData([...points, ...route.slice(1)], cornerRadius.value),
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
    fields: {},
    behindWires: false
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

// Changer d'onglet abandonne le geste en cours : il portait sur le montage qu'on quitte.
watch(
  () => store.activeTabId,
  () => {
    drag.value = null
  }
)

// Changer d'outil abandonne une étiquette dont le second coin n'est pas encore donné.
watch(
  () => store.tool,
  () => {
    if (drag.value?.kind === 'text-box') drag.value = null
  }
)

/** Aperçu de la boîte d'une étiquette en cours de pose. */
const textBox = computed(() => {
  const current = drag.value
  if (current?.kind !== 'text-box') return null
  const [x1, y1] = current.start
  const [x2, y2] = current.current
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1))
  }
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
    dy: 0,
    duplicate: event.altKey
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
  store.revealInspector()
  startMove(event)
}

/**
 * Ctrl+appui en mode sélection, avant tout autre geste : glisser trace un fil depuis la broche
 * saisie, relâcher le pose ; un simple Ctrl+clic sélectionne le composant.
 */
function onGrabDown(event: PointerEvent): void {
  if (event.button !== 0 || !event.ctrlKey || store.tool !== 'select' || store.panKeyHeld) return
  const pin = pinGrab.value
  if (!pin) return
  // Ni le composant, ni le fil, ni le canevas ne voient cet appui.
  event.stopImmediatePropagation()
  drag.value = {
    kind: 'pin-wire',
    instanceId: pin.instanceId,
    pinKey: pin.key,
    origin: pin.point,
    downX: event.clientX,
    downY: event.clientY,
    moved: false
  }
  capture(event)
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
  store.revealInspector()
  startMove(event)
}

function onWireDown(wireId: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const world = toWorld(screenPoint(event))
  // Alt+clic sur un croisement : l'autre fil passe au-dessus ; ailleurs, Alt+glisser copie.
  if (event.altKey && store.toggleCrossing(world.x, world.y)) return
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
  store.revealInspector()
  // Plusieurs éléments sélectionnés, ou copie : le glisser déplace tout ; un fil seul : son segment.
  if (
    event.altKey ||
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

function onLabelHandleDown(labelId: string, handleId: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const label = store.doc.labels.find((candidate) => candidate.id === labelId)
  if (!label) return
  const box: Box = { x: label.x, y: label.y, w: label.w, h: label.h }
  drag.value = { kind: 'label-handle', id: labelId, handleId, original: box, preview: box }
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
  if (event.button === 1) {
    if (event.timeStamp - lastMiddleDown < DOUBLE_CLICK_MS) {
      lastMiddleDown = 0
      store.fitToContent()
      event.preventDefault()
      return
    }
    lastMiddleDown = event.timeStamp
  }
  if (event.button === 1 || (event.button === 0 && store.panKeyHeld)) {
    drag.value = { kind: 'pan', lastX: event.clientX, lastY: event.clientY }
    capture(event)
    event.preventDefault()
    return
  }
  if (event.button !== 0) return
  const world = toWorld(screenPoint(event))
  // Alt a pu être enfoncée hors de la fenêtre : l'événement fait foi.
  if (store.altHeld !== event.altKey) store.altHeld = event.altKey

  if (store.tool === 'place') {
    placeGhost()
    return
  }

  if (store.tool === 'text') {
    const point = snapGrid(world)
    const pending = drag.value
    if (pending?.kind === 'text-box') {
      drag.value = null
      commitTextBox(pending.start, point)
    } else {
      // Premier coin de la boîte ; le second vient au relâchement (glisser) ou au clic suivant.
      drag.value = { kind: 'text-box', start: point, current: point }
      capture(event)
    }
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
    store.appendWirePoints(wireRoute(last, snap.point).slice(1))
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
  // Ctrl a pu être enfoncée ou relâchée hors de la fenêtre : l'événement fait foi.
  if (store.ctrlHeld !== event.ctrlKey) store.ctrlHeld = event.ctrlKey
  if (store.altHeld !== event.altKey) store.altHeld = event.altKey
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
    case 'text-box':
      current.current = snapGrid(world)
      break
    case 'wire-segment': {
      current.preview = moveSegment(
        current.original,
        current.index,
        segmentCoordinate(current.original, current.index, world)
      )
      break
    }
    case 'wire-vertex':
      current.preview = dragVertex(current.original, current.index, snapGrid(world))
      break
    case 'label-handle':
      current.preview = resizeBox(current.original, current.handleId, snapGrid(world))
      break
    case 'pin-wire':
      if (Math.hypot(event.clientX - current.downX, event.clientY - current.downY) > PIN_DRAG_PX) {
        current.moved = true
      }
      break
  }
}

function samePoints(a: readonly GridPoint[], b: readonly GridPoint[]): boolean {
  return (
    a.length === b.length && a.every((point, i) => b[i]?.[0] === point[0] && b[i]?.[1] === point[1])
  )
}

/** Étiquette entre deux coins ; deux clics au même point donnent la boîte par défaut. */
function commitTextBox(start: GridPoint, end: GridPoint): void {
  const [x1, y1] = start
  const [x2, y2] = end
  if (x1 === x2 && y1 === y2) store.addLabel(x1, y1)
  else {
    store.addLabelBox({
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(1, Math.abs(x2 - x1)),
      h: Math.max(1, Math.abs(y2 - y1))
    })
  }
  store.selectTool()
}

function onPointerUp(event: PointerEvent): void {
  const current = drag.value
  if (!current) return
  if (current.kind === 'text-box') {
    // Relâché sans bouger : on attend le second clic pour le coin opposé.
    if (current.start[0] === current.current[0] && current.start[1] === current.current[1]) return
    drag.value = null
    commitTextBox(current.start, current.current)
    return
  }
  drag.value = null
  if (current.kind === 'move') {
    if (current.duplicate) store.duplicateSelectionAt(current.dx, current.dy)
    else store.moveSelection(current.dx, current.dy)
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
        .filter((label) => rectsIntersect(textLabelBounds(label), rect))
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
      if (store.hasSelection) store.revealInspector()
    }
  } else if (current.kind === 'wire-segment' || current.kind === 'wire-vertex') {
    if (!samePoints(current.original, current.preview)) {
      store.setWirePoints(current.wireId, current.preview)
    }
  } else if (current.kind === 'label-handle') {
    const { original: a, preview: b } = current
    if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) store.setLabelBox(current.id, b)
  } else if (current.kind === 'pin-wire') {
    if (current.moved) {
      // Relâché sur la broche de départ, le fil n'a qu'un point : `addWire` le refuse.
      const snap = wireSnap(toWorld(screenPoint(event)))
      store.addWire(wireRoute(current.origin, snap.point))
    } else {
      store.clearSelection()
      store.selection = [current.instanceId]
      store.revealInspector()
    }
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
}

/** Pose le fantôme, puis arrête la pose : un clic ou un dépôt = un composant, sélectionné. */
function placeGhost(): void {
  const current = ghost.value
  if (!current) return
  const id = store.placeAt(current.instance.x, current.instance.y)
  store.stopPlacing()
  if (id) {
    store.clearSelection()
    store.selection = [id]
  }
}

/** Glisser-déposer depuis le panneau des composants : le fantôme suit le pointeur. */
function onDragOver(event: DragEvent): void {
  if (!store.placement) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  hover.value = toWorld(screenPoint(event))
}

function onDrop(event: DragEvent): void {
  if (!store.placement) return
  event.preventDefault()
  hover.value = toWorld(screenPoint(event))
  placeGhost()
}

/** Double-clic : termine le fil en cours ; en sélection, sur une extrémité libre, son étiquette. */
function onDoubleClick(event: MouseEvent): void {
  if (store.tool === 'wire') {
    store.finishWire()
    return
  }
  if (store.tool !== 'select') return
  const world = toWorld(screenPoint(event))
  const hit = store.connectivity.freeEnds.find(
    (end) => Math.hypot(end.point[0] - world.x, end.point[1] - world.y) <= END_PICK_CELLS
  )
  if (hit) emit('editWireEnd', hit.wireId, hit.endIndex)
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

function onEndLabelDoubleClick(wireId: string, endIndex: number, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  emit('editWireEnd', wireId, endIndex)
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
  emit('openMenu', {
    x: event.clientX,
    y: event.clientY,
    cell: snapGrid(world),
    point: world,
    target
  })
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
  // Ctrl sur une broche saisissable : le curseur annonce le fil.
  return store.tool === 'wire' || drag.value?.kind === 'pin-wire' || pinGrab.value ? 'wiring' : ''
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
        @pointerdown.capture="onGrabDown"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="hover = null"
        @dblclick="onDoubleClick"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragleave="hover = null"
        @wheel.prevent="onWheel"
        @contextmenu="onContextMenu($event, { kind: 'empty' })"
      >
        <g class="grid">
          <line
            v-for="(line, i) in grid.xs"
            :key="`x${i}`"
            :x1="line.px"
            :x2="line.px"
            y1="0"
            :y2="store.viewport.height"
            :class="{ major: line.major }"
          />
          <line
            v-for="(line, j) in grid.ys"
            :key="`y${j}`"
            x1="0"
            :x2="store.viewport.width"
            :y1="line.px"
            :y2="line.px"
            :class="{ major: line.major }"
          />
        </g>

        <g :transform="`translate(${view.panX} ${view.panY}) scale(${cell})`">
          <template v-for="layer in STACK" :key="layer">
            <template v-if="layer === 'wires'">
              <g class="net-glows">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path v-if="item.inHoverNet" :d="item.d" :stroke-width="wireWidth * 3" />
                </template>
              </g>
              <g class="wire-selections">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path v-if="item.selected" :d="item.d" :stroke-width="wireWidth + 6 / cell" />
                </template>
              </g>

              <g class="wires">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path
                    v-if="item.body"
                    class="wire"
                    :d="item.body"
                    :stroke="screenColor(item.wire.color)"
                    :stroke-width="wireWidth"
                  />
                  <path
                    v-for="(tail, t) in item.dotted"
                    :key="`tail${t}`"
                    class="wire wire-dotted"
                    :d="tail"
                    :stroke="screenColor(item.wire.color)"
                    :stroke-width="wireWidth"
                    :stroke-dasharray="`0 ${wireWidth * 2}`"
                  />
                  <polygon
                    v-for="(head, h) in item.heads"
                    :key="`head${h}`"
                    class="wire-head"
                    :points="head"
                    :fill="screenColor(item.wire.color)"
                  />
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
                    :stroke="screenColor(mark.color)"
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
                  :fill="screenColor(dot.fill)"
                />
              </g>
            </template>

            <template v-else>
              <g
                v-for="item in layers[layer].instances"
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
                  :ink="store.staleDefIds.has(item.def.id) ? 'var(--stale)' : null"
                  skip-texts
                />
                <rect
                  v-if="store.staleDefIds.has(item.def.id) && componentImages(item.def).length > 0"
                  class="stale-frame"
                  :width="item.def.size.widthCells"
                  :height="item.def.size.heightCells"
                />
                <rect
                  class="hit"
                  :width="item.def.size.widthCells"
                  :height="item.def.size.heightCells"
                  fill="transparent"
                />
              </g>

              <g v-if="layers[layer].texts.length > 0" class="instance-texts">
                <text
                  v-for="entry in layers[layer].texts"
                  :key="entry.key"
                  :transform="entry.transform"
                  :font-size="entry.primitive.size"
                  :text-anchor="entry.anchor"
                  :fill="entry.fill"
                  v-bind="textStyleAttrs(entry.primitive)"
                >
                  <tspan
                    v-for="(line, l) in entry.layout.lines"
                    :key="l"
                    :x="entry.layout.x"
                    :y="line.y"
                  >
                    {{ line.text }}
                  </tspan>
                </text>
              </g>
            </template>
          </template>

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
              <rect
                v-if="entry.label.background"
                class="label-back"
                :x="entry.box.x"
                :y="entry.box.y"
                :width="entry.box.w"
                :height="entry.box.h"
              />
              <text
                :transform="entry.transform"
                :font-size="entry.fontCells"
                :font-family="profile.labelFont.family"
                :text-anchor="entry.label.anchor"
                :fill="screenColor(entry.label.color)"
                v-bind="textEmphasisAttrs(entry.label)"
              >
                <tspan
                  v-for="(line, l) in entry.layout.lines"
                  :key="l"
                  :x="entry.layout.x"
                  :y="line.y"
                >
                  {{ line.text }}
                </tspan>
              </text>
              <rect
                class="hit"
                :x="entry.box.x"
                :y="entry.box.y"
                :width="entry.box.w"
                :height="entry.box.h"
                fill="transparent"
              />
              <rect
                v-if="entry.selected"
                class="selection"
                :x="entry.box.x - 0.15"
                :y="entry.box.y - 0.15"
                :width="entry.box.w + 0.3"
                :height="entry.box.h + 0.3"
                vector-effect="non-scaling-stroke"
              />
            </g>
          </g>

          <g class="end-labels">
            <g
              v-for="entry in endLabels"
              :key="entry.key"
              class="end-label"
              @dblclick="onEndLabelDoubleClick(entry.wireId, entry.endIndex, $event)"
            >
              <circle
                :cx="entry.dotX"
                :cy="entry.dotY"
                :r="wireWidth"
                :fill="screenColor(entry.color)"
              />
              <text
                :x="entry.x"
                :y="entry.y"
                :font-size="endLabelFontCells"
                :font-family="profile.endLabelFont.family"
                font-weight="bold"
                :text-anchor="entry.anchor"
                :dominant-baseline="entry.baseline"
              >
                {{ entry.text }}
              </text>
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

          <circle
            v-if="pinGrab"
            class="pin-grab"
            :cx="pinGrab.point[0]"
            :cy="pinGrab.point[1]"
            :r="pinGrabReach"
            vector-effect="non-scaling-stroke"
          />

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
            <rect
              v-for="handle in labelHandles"
              :key="`label:${handle.id}`"
              class="box-handle"
              :x="handle.x - 4 / cell"
              :y="handle.y - 4 / cell"
              :width="8 / cell"
              :height="8 / cell"
              vector-effect="non-scaling-stroke"
              @pointerdown="onLabelHandleDown(handle.labelId, handle.id, $event)"
            />
          </g>

          <g v-if="ghostCopies" class="ghost" :transform="ghostCopies.transform">
            <path
              v-for="wire in ghostCopies.wires"
              :key="wire.id"
              class="ghost-wire"
              :d="wire.d"
              :stroke="screenColor(wire.color)"
              :stroke-width="wireWidth"
            />
            <g
              v-for="item in ghostCopies.instances"
              :key="item.instance.id"
              :transform="matrixToSvg(instanceMatrix(item.instance, item.def))"
            >
              <ComponentGraphic
                :def="item.def"
                :cell-px="1"
                :stroke-base="profile.componentStroke"
                :fields="item.instance.fields"
              />
            </g>
            <text
              v-for="entry in ghostCopies.labels"
              :key="entry.label.id"
              :transform="entry.transform"
              :font-size="entry.label.size / profile.cellPx"
              :font-family="profile.labelFont.family"
              :text-anchor="entry.label.anchor"
              :fill="screenColor(entry.label.color)"
              v-bind="textEmphasisAttrs(entry.label)"
            >
              <tspan
                v-for="(line, l) in entry.layout.lines"
                :key="l"
                :x="entry.layout.x"
                :y="line.y"
              >
                {{ line.text }}
              </tspan>
            </text>
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
              :stroke="screenColor(store.currentColor)"
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
          <rect v-if="textBox" class="band" v-bind="textBox" vector-effect="non-scaling-stroke" />
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
  background: var(--paper);
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

/* Fil en cours ou broche saisissable (Ctrl) : la croix l'emporte sur le curseur des éléments. */
.schematic.wiring .instance,
.schematic.wiring .wire-hit,
.schematic.wiring .text-label {
  cursor: crosshair;
}

.schematic.panning {
  cursor: grab;
}

.grid line {
  stroke: var(--grid-line);
}

.grid line.major {
  stroke: var(--grid-major);
}

.wires path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wire-head {
  pointer-events: none;
}

.wire-hit {
  stroke: transparent;
  pointer-events: stroke;
  cursor: pointer;
}

.net-glows,
.wire-selections {
  pointer-events: none;
}

.net-glows {
  opacity: 0.22;
}

.wire-selections {
  opacity: 0.35;
}

.net-glows path,
.wire-selections path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.net-glows path {
  stroke: #ffd33d;
}

.wire-selections path {
  stroke: #1f6feb;
}

.crossings line {
  pointer-events: none;
  stroke-linecap: butt;
}

.crossings .halo {
  stroke: var(--paper);
}

.junctions circle {
  pointer-events: none;
}

.instance {
  cursor: move;
}

.labels text,
.instance-texts text {
  pointer-events: none;
}

/* Composant PNG dont la bibliothèque a une version plus récente : cadre teinté, ses traits ne
   pouvant pas être recolorés comme ceux d'un dessin. */
.instance .stale-frame {
  fill: none;
  stroke: var(--stale);
  stroke-width: 0.12;
  stroke-dasharray: 0.3 0.2;
}

.labels text {
  fill: var(--paper-text);
}

.text-label {
  cursor: move;
}

/* Fond optionnel d'une étiquette : sa boîte, de la couleur du papier. */
.label-back {
  fill: var(--paper);
}

/* La couleur d'une étiquette vient de son attribut `fill` (noir pur = encre du thème). */
.text-label text {
  pointer-events: none;
}

.end-label text {
  fill: var(--paper-text);
  cursor: text;
}

.pins circle {
  pointer-events: none;
}

.pins .unconnected {
  fill: none;
  stroke: var(--alert);
  stroke-width: 1.5;
}

/* Broche qu'un Ctrl+glisser saisirait : un fil partira d'elle. */
.pin-grab {
  fill: rgba(26, 127, 55, 0.25);
  stroke: #1a7f37;
  stroke-width: 1.5;
  pointer-events: none;
}

.selection {
  fill: none;
  stroke: #1f6feb;
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.free-end {
  fill: var(--paper);
  stroke: var(--alert);
  stroke-width: 1.5;
  pointer-events: none;
}

.vertex-handle {
  fill: #ffffff;
  stroke: #1f6feb;
  stroke-width: 1.5;
  cursor: move;
}

.box-handle {
  fill: #ffffff;
  stroke: #1f6feb;
  stroke-width: 1.5;
  cursor: nwse-resize;
}

.ghost {
  opacity: 0.55;
  pointer-events: none;
}

.ghost-wire {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  /* Hauteur fixe : la barre ne se replie pas quand elle est vide, le canevas ne bouge pas. */
  flex: none;
  min-height: var(--status-height);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface);
  border-top: 1px solid var(--border);
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
