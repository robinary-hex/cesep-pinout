<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  absolutePinPosition,
  anchorPins,
  boardFaces,
  boardsCarry,
  boxHandles,
  componentImages,
  crossingPieceEnds,
  distanceToSegment,
  facesFlip,
  facesGap,
  facesHinge,
  formatReadout,
  gridLines,
  groupOutline,
  HINGE_STYLE,
  instanceBounds,
  instanceMatrix,
  instanceTextPlacements,
  isBoard,
  junctionDot,
  textPlacementTransform,
  layoutLabel,
  layoutTextBox,
  locateOnWire,
  matrixToSvg,
  moveSegment,
  nearestSegmentIndex,
  nearestWirePoint,
  pointsAttribute,
  projectPins,
  rectContainsRect,
  rectsIntersect,
  resizeBox,
  rotatedSize,
  routeWire,
  screenToWorld,
  segmentCoordinate,
  showsUnderside,
  spreadBoard,
  textContent,
  textEmphasisAttrs,
  textStyleAttrs,
  textTransform,
  textLabelBounds,
  pulledCount,
  restretch,
  stretchCounts,
  stretchedDefinition,
  stretchHandles,
  THROUGH_MARK_COLOR,
  THROUGH_MARK_EDGE,
  THROUGH_MARK_RADIUS,
  throughMarks,
  undersideBounds,
  variantDefinition,
  wireBounds,
  wireEndLabelPlacement,
  wireIntersectsRect,
  wirePathData,
  wireRenderParts,
  BARE_WIRE_EDGE,
  BARE_WIRE_EDGE_SCALE,
  jumperPathData,
  movedWireVertex,
  SOLDER_COLOR,
  SOLDER_EDGE,
  SOLDER_SCALE,
  wireShapeData,
  wiresFollowingJunctions,
  wiresFollowingPins,
  computeConnectivity,
  type Junction,
  type Box,
  type ComponentDefinition,
  type ComponentInstance,
  type GridPoint,
  type GridRect,
  type LocalPoint,
  type PinKind,
  type PinRef,
  type Project,
  type Solder,
  type StretchAxis,
  type StretchEnd,
  type TextLabel,
  type ThroughMark,
  type Wire,
  type WireEndFlags
} from '@/domain'
import ComponentGraphic from '@/render/ComponentGraphic.vue'
import FootprintGraphic from '@/render/FootprintGraphic.vue'
import { screenColor } from '@/render/ink'
import type { MenuRequest, MenuTarget } from './menu'
import { useSchematicStore, type PlacedInstance } from './store'

// Canevas infini du montage. Tout le contenu est dessiné en unités de cellule dans un groupe
// mis à l'échelle (zoom) et translaté (pan) ; seule la grille est calculée en pixels d'écran.
// Ordre d'empilement : grille, composants mis derrière les fils, fils (corps, queues
// pointillées, pointes), croisements (fil du dessus avec liseré), points de jonction, les
// autres composants, repères, étiquettes, étiquettes
// d'extrémité, broches (et anneau de saisie de la broche survolée), contours des groupes,
// surcouches de sélection et
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
/**
 * Saisie du bout d'un fil (décision du 12 novembre 2026) : un appui dans la dernière
 * demi-cellule d'un fil, ou à moins de 12 px de son bout, saisit ce bout, sans avoir à viser sa
 * poignée ni à sélectionner le fil d'abord. Jamais plus de 45 % du dernier tronçon : le reste
 * du tronçon se glisse toujours.
 */
const END_GRAB_PX = 12
const END_GRAB_CELLS = 0.5
const END_GRAB_SHARE = 0.45
const NO_FREE_ENDS: WireEndFlags = { start: false, end: false }

const cell = computed(() => store.cellPx)
const view = computed(() => store.view)
// Le style du montage : celui du tracé en cours et de tout élément qui n'a pas le sien. Un
// élément qui a son style (`store.styleFor`) se dessine avec lui.
const profile = computed(() => store.profile)
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
      /** Alt+glisser : les originaux restent, une copie se dépose à l'arrivée. */
      duplicate: boolean
      /** Bouts de fil soudés à un trou d'une plaque qu'on déplace : ils suivent leur trou. */
      ends: GridPoint[]
      /**
       * Plaque à deux faces prise seule : tant que Ctrl est enfoncée, elle bouge par rapport à
       * son pli (`spreading`). `bottom` : on l'a saisie par son dessous.
       */
      board: { id: string; bottom: boolean } | null
    }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; additive: boolean }
  | { kind: 'text-box'; start: GridPoint; current: GridPoint }
  | { kind: 'label-handle'; id: string; handleId: string; original: Box; preview: Box }
  // Étirement d'un composant extensible par une de ses poignées, dans un de ses sens.
  | {
      kind: 'stretch'
      id: string
      /** Le sens du dessin qu'on étire : sa largeur, ou sa hauteur. */
      axis: StretchAxis
      /** Le bout qu'on tire ; l'autre reste en place. */
      end: StretchEnd
      /** Où la poignée a été saisie, et le sens dans lequel la tirer allonge. */
      origin: LocalPoint
      dx: number
      dy: number
      original: number
      count: number
    }
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
/**
 * Le pointeur survole un élément qui prend l'appui pour lui (composant, étiquette, poignée) : le
 * bout d'un fil tout proche ne s'y saisit pas.
 */
const hoverBlocked = ref(false)
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

/**
 * Plaque à deux faces qu'on glisse seule, Ctrl enfoncée (décision du 18 novembre 2026) : elle
 * bouge par rapport à son pli, qui reste en place. La face saisie suit le pointeur, l'autre fait
 * le geste en miroir : les deux s'écartent du pli, ou s'en rapprochent, d'autant l'une que
 * l'autre. Ce que la plaque porte suit sa face (`boardsCarry`, comme à la commande). Rend la
 * plaque à sa nouvelle place et ce qu'elle emmène ; null hors de ce geste.
 */
const spreading = computed(() => {
  const current = drag.value
  if (current?.kind !== 'move' || current.duplicate || !current.board || !store.ctrlHeld) {
    return null
  }
  const { id, bottom } = current.board
  const item = store.placed.find((candidate) => candidate.instance.id === id)
  if (!item) return null
  // Saisie par son dessous, la plaque fait le geste inverse de celui du pointeur.
  const board = spreadBoard(item.instance, item.def, bottom ? -current.dx : current.dx, current.dy)
  // Rien ne change (au plus près du pli, on ne s'en rapproche pas) : la plaque reste où elle est.
  if (!board) return { board: item.instance, carried: null }
  const after: Project = {
    ...store.doc,
    components: store.doc.components.map((instance) => (instance.id === id ? board : instance))
  }
  return { board, carried: boardsCarry(store.doc, after) }
})

/**
 * Décalage appliqué aux originaux pendant un déplacement (pas pendant une copie, ni quand une
 * plaque bouge par rapport à son pli : chaque élément a alors sa place, donnée par `spreading`).
 */
const moveOffset = computed(() => {
  const current = drag.value
  return current?.kind === 'move' && !current.duplicate && !spreading.value
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
 * Étirement en cours : ce que la commande ferait au nombre de motifs où en est le geste ; null
 * tant que ce nombre est celui du départ.
 */
const stretching = computed(() => {
  const current = drag.value
  if (current?.kind !== 'stretch') return null
  return restretch(
    store.doc,
    current.id,
    current.count,
    current.end === 'end' ? 'start' : 'end',
    current.axis
  )
})

/**
 * Les composants tels qu'on les dessine : ceux du montage, celui qu'on étire montré à sa
 * nouvelle longueur et à sa nouvelle place, la plaque qu'on écarte de son pli et ce qu'elle
 * porte, là où ils vont.
 */
const placed = computed<PlacedInstance[]>(() => {
  const spread = spreading.value
  if (spread) {
    return store.placed.map((item) => {
      const moved =
        item.instance.id === spread.board.id
          ? spread.board
          : spread.carried?.instances.get(item.instance.id)
      return moved ? { instance: moved, def: item.def } : item
    })
  }
  const change = stretching.value
  if (!change) return store.placed
  return store.placed.map((item) => {
    if (item.instance.id !== change.instance.id) return item
    return {
      instance: change.instance,
      def: stretchedDefinition(baseOf(item), {
        x: change.instance.countX,
        y: change.instance.countY
      })
    }
  })
})

/** Le composant d'un exemplaire tel qu'il est dessiné dans la bibliothèque, avant étirement. */
function baseOf(item: PlacedInstance): ComponentDefinition {
  const embedded = store.doc.embeddedDefs[item.instance.defId]
  return embedded ? variantDefinition(embedded, item.instance.variant) : item.def
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
  solders: Solder[]
  marks: ThroughMark[]
} | null>(() => {
  const current = drag.value
  const spread = spreading.value
  let pins = store.pinRefs
  let faces = store.faces
  let after: Wire[]
  if (spread) {
    // Plaque écartée de son pli : le montage tel qu'il serait, ce qu'elle porte ayant suivi sa
    // face ; les fils soudés à ses trous et aux broches qu'elle porte suivent, comme à la commande.
    const { board, carried } = spread
    if (store.doc.components.includes(board)) return null
    const moved: Project = {
      ...store.doc,
      components: store.doc.components.map(
        (instance) =>
          (instance.id === board.id ? board : carried?.instances.get(instance.id)) ?? instance
      )
    }
    faces = boardFaces(moved)
    pins = projectPins(moved, faces)
    const ends = carried?.ends ?? []
    after = wiresFollowingPins(
      store.doc.wires,
      [...store.pinRefs, ...anchorPins(ends.map((end) => end.from))],
      [...pins, ...anchorPins(ends.map((end) => end.to))],
      new Map(),
      carried?.wires
    )
  } else if (current?.kind === 'stretch') {
    // Composant qu'on étire : les fils soudés à ses broches suivent, comme à la commande.
    const change = stretching.value
    if (!change) return null
    pins = change.pinsAfter
    faces = boardFaces({
      ...store.doc,
      components: store.doc.components.map((instance) =>
        instance.id === change.instance.id ? change.instance : instance
      )
    })
    after = wiresFollowingPins(store.doc.wires, change.pinsBefore, change.pinsAfter)
  } else if (current?.kind === 'wire-segment' || current?.kind === 'wire-vertex') {
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
    // Le montage tel qu'il serait : les faces des plaques et les broches s'y relisent, celles
    // qui ressortent sous une plaque comprises.
    const moved: Project = {
      ...store.doc,
      components: store.doc.components.map((instance) =>
        moving.has(instance.id) ? { ...instance, x: instance.x + dx, y: instance.y + dy } : instance
      )
    }
    faces = boardFaces(moved)
    pins = projectPins(moved, faces)
    const translated = new Map<string, GridPoint>(
      current.wireIds.map((id) => [id, [dx, dy] as GridPoint])
    )
    // Les bouts soudés à un trou d'une plaque emmenée suivent ce trou, comme une broche.
    const shifted = current.ends.map((end): GridPoint => [end[0] + dx, end[1] + dy])
    after = wiresFollowingPins(
      store.doc.wires,
      [...store.pinRefs, ...anchorPins(current.ends)],
      [...pins, ...anchorPins(shifted)],
      translated
    )
  } else {
    return null
  }
  const followed = wiresFollowingJunctions(store.doc.wires, after, pins)
  const connectivity = computeConnectivity(followed, pins, faces.twins)
  return {
    wires: new Map(followed.map((wire) => [wire.id, wire.points])),
    junctions: connectivity.junctions,
    solders: connectivity.solders,
    marks: throughMarks(followed, pins, faces)
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
      .map((wire) => {
        const style = store.styleFor(wire)
        return {
          id: wire.id,
          color: wire.color,
          width: style.wireWidth,
          d: wireShapeData(wire.kind, wire.points, style.cornerRadius)
        }
      }),
    labels: store.doc.labels
      .filter((label) => labelIds.has(label.id))
      .map((label) => ({
        label,
        family: store.styleFor(label).labelFont.family,
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

/** Libellés (R1, U2) : au-dessus de la boîte, dans la police des libellés du style du composant. */
const instanceLabels = computed(() =>
  placed.value
    .filter((item) => item.instance.label.length > 0)
    .map((item) => {
      const bounds = boundsOf(item)
      const font = store.styleFor(item.instance).labelFont
      return {
        id: item.instance.id,
        text: item.instance.label,
        x: bounds.x,
        y: bounds.y - 0.25,
        fontCells: font.size / profile.value.cellPx,
        family: font.family
      }
    })
)

/** Cadres de la sélection ; une plaque qui montre son dessous en a un par face. */
const selectedBoxes = computed(() =>
  placed.value
    .filter((item) => selectedSet.value.has(item.instance.id))
    .flatMap((item) => {
      const bounds = boundsOf(item)
      const boxes = [{ id: item.instance.id, ...bounds }]
      if (showsUnderside(item.instance, item.def)) {
        boxes.push({
          id: `${item.instance.id}:dessous`,
          ...undersideBounds(bounds, facesGap(item.instance))
        })
      }
      return boxes
    })
)

/**
 * Dessous des plaques qui le montrent : le dessin de la plaque, retourné comme une page qu'on
 * tourne, à sa droite. La transformation s'ajoute à celle du composant.
 */
const undersides = computed(() => {
  const transforms = new Map<string, string>()
  for (const item of placed.value) {
    if (!showsUnderside(item.instance, item.def)) continue
    const flip = facesFlip(boundsOf(item), facesGap(item.instance))
    transforms.set(item.instance.id, `matrix(-1 0 0 1 ${flip} 0)`)
  }
  return transforms
})

/**
 * Empreintes, plaque par plaque : les composants qu'une plaque à deux faces porte et qui ont des
 * formes d'empreinte. Elles se dessinent avec la plaque, sur son autre face (par le miroir de
 * son dessous), sous les pattes qui y ressortent.
 */
const footprintsByBoard = computed(() => {
  const byBoard = new Map<string, PlacedInstance[]>()
  if (store.footprints.size === 0) return byBoard
  for (const item of placed.value) {
    const face = store.footprints.get(item.instance.id)
    if (!face) continue
    const list = byBoard.get(face.id)
    if (list) list.push(item)
    else byBoard.set(face.id, [item])
  }
  return byBoard
})

/**
 * Le pli entre les deux faces de chaque plaque qui montre son dessous : un trait pointillé et la
 * flèche qui dit que la plaque de droite est celle de gauche, retournée. Il suit la plaque
 * pendant un geste.
 */
const hinges = computed(() =>
  placed.value
    .filter((item) => showsUnderside(item.instance, item.def))
    .map((item) => ({
      id: item.instance.id,
      ...facesHinge(boundsOf(item), facesGap(item.instance))
    }))
)

/**
 * Ce qui traverse les plaques à deux faces, plaque par plaque : sur chaque pastille où ressort
 * une patte ou un bout de fil enfiché de l'autre côté, un point de couleur vive. Pendant un
 * geste, ceux de l'aperçu.
 */
const throughByBoard = computed(() => {
  const byBoard = new Map<string, { key: string; x: number; y: number }[]>()
  for (const mark of dragPreview.value?.marks ?? store.throughs) {
    const [x, y] = mark.point
    const list = byBoard.get(mark.board) ?? []
    list.push({ key: `${x},${y}`, x, y })
    byBoard.set(mark.board, list)
  }
  return byBoard
})

/**
 * Le trou survolé d'une plaque à deux faces, vu de l'autre face : un anneau l'y montre, pour
 * retrouver dessous la patte qu'on voit dessus.
 */
const twinMark = computed(() => {
  const point = hover.value
  const kind = drag.value?.kind
  if (!point || kind === 'pan' || kind === 'move' || kind === 'band' || kind === 'stretch') {
    return null
  }
  const at = snapGrid(point)
  if (Math.hypot(at[0] - point.x, at[1] - point.y) > 0.45) return null
  const twin = store.faces.twins.get(`${at[0]},${at[1]}`)
  return twin ? { x: twin.point[0], y: twin.point[1] } : null
})

const pins = computed(() => {
  if (!store.showPins && !store.showUnconnected) return []
  const unconnected = store.connectivity.unconnectedPinKeys
  return placed.value.flatMap((item) => {
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
  placed.value.flatMap((item) => {
    const { dx, dy } = offsetOf(item.instance.id)
    const stale = store.staleDefIds.has(item.def.id)
    return instanceTextPlacements(item.instance, item.def).map((placement, index) => {
      const box = { ...placement.box, x: placement.box.x + dx, y: placement.box.y + dy }
      const { primitive, anchor } = placement
      return {
        key: `${item.instance.id}:${index}`,
        instanceId: item.instance.id,
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
}

/** Composants de chaque couche, dans l'ordre du montage : le dernier est dessiné au-dessus. */
const layers = computed<Record<(typeof STACK)[number], ComponentLayer>>(() => {
  const layer = (behind: boolean): ComponentLayer => ({
    instances: placed.value.filter((item) => item.instance.behindWires === behind)
  })
  return { back: layer(true), wires: { instances: [] }, front: layer(false) }
})

/**
 * Textes de chaque composant. Ils se dessinent juste après lui, pas au-dessus de toute la
 * couche : un composant posé sur un autre cache aussi ses textes.
 */
const textsByInstance = computed(() => {
  const byInstance = new Map<string, (typeof instanceTexts.value)[number][]>()
  for (const entry of instanceTexts.value) {
    const list = byInstance.get(entry.instanceId)
    if (list) list.push(entry)
    else byInstance.set(entry.instanceId, [entry])
  }
  return byInstance
})

/** Marge du cadre pointillé de la sélection autour d'un composant, en cellules. */
const SELECTION_MARGIN_CELLS = 0.15
/** Flèche d'une poignée d'étirement, en pixels : son écart au cadre, sa longueur, sa demi-base. */
const STRETCH_ARROW_PX = { gap: 5, length: 10, half: 7, hit: 12 }

/**
 * Poignées d'étirement : aux deux bouts de chaque sens où s'étire un composant extensible seul
 * sélectionné (quatre s'il s'étire dans les deux sens), hors déplacement. Chacune est une
 * petite flèche, juste hors du cadre pointillé de la sélection,
 * qui pointe dans le sens où la tirer allonge le composant (décision du 17 novembre 2026 : une
 * barre posée sur le bord du dessin, à l'intérieur du cadre, se voyait mal). Pendant
 * l'étirement elles suivent le composant.
 */
const stretchGrips = computed(() => {
  const id = store.selection[0]
  if (
    id === undefined ||
    store.selection.length !== 1 ||
    store.selectedWires.length > 0 ||
    store.selectedLabels.length > 0 ||
    store.tool !== 'select' ||
    drag.value?.kind === 'move'
  ) {
    return []
  }
  const item = placed.value.find((candidate) => candidate.instance.id === id)
  if (!item) return []
  const px = 1 / cell.value
  return stretchHandles(item.instance, item.def).map((handle) => {
    // De la base à la pointe, vers l'extérieur ; la base est en travers de ce sens.
    const from = SELECTION_MARGIN_CELLS + STRETCH_ARROW_PX.gap * px
    const base = { x: handle.x + handle.dx * from, y: handle.y + handle.dy * from }
    const tip = {
      x: base.x + handle.dx * STRETCH_ARROW_PX.length * px,
      y: base.y + handle.dy * STRETCH_ARROW_PX.length * px
    }
    const side = {
      x: -handle.dy * STRETCH_ARROW_PX.half * px,
      y: handle.dx * STRETCH_ARROW_PX.half * px
    }
    return {
      ...handle,
      instanceId: id,
      arrow: `M ${tip.x} ${tip.y} L ${base.x + side.x} ${base.y + side.y} L ${base.x - side.x} ${base.y - side.y} Z`,
      // Zone à saisir : un disque plus large que la flèche, centré sur elle.
      center: { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2 },
      reach: STRETCH_ARROW_PX.hit * px,
      cursor: handle.dx === 0 ? 'ns-resize' : 'ew-resize'
    }
  })
})

// Étiquettes texte

/** Boîte d'une étiquette telle qu'affichée : aperçu de poignée, sinon décalage de déplacement. */
function labelBox(label: TextLabel): Box {
  const current = drag.value
  if (current?.kind === 'label-handle' && current.id === label.id) return current.preview
  // Sur une plaque qu'on écarte de son pli : là où sa face l'emmène.
  const carried = spreading.value?.carried?.labels.get(label.id)
  if (carried) return carried
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
      family: store.styleFor(label).labelFont.family,
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

/** Marge du contour d'un groupe autour de ses membres, en cellules. */
const GROUP_MARGIN_CELLS = 0.4

/** Contours des groupes, autour de leurs membres tels qu'affichés (déplacement en cours compris). */
const groupOutlines = computed(() => {
  if (!store.showGroups) return []
  return store.groups.flatMap((group) => {
    const rects: GridRect[] = []
    for (const item of placed.value) {
      if (group.members.instance.includes(item.instance.id)) rects.push(boundsOf(item))
    }
    for (const wire of store.doc.wires) {
      if (!group.members.wire.includes(wire.id)) continue
      const bounds = wireBounds(wirePoints(wire))
      if (bounds) rects.push(bounds)
    }
    for (const label of store.doc.labels) {
      if (group.members.label.includes(label.id)) rects.push(textLabelBounds(labelBox(label)))
    }
    const outline = groupOutline(rects, GROUP_MARGIN_CELLS)
    return outline ? [{ id: group.id, ...outline }] : []
  })
})

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
    // Épaisseur et coins : ceux du style du fil.
    const style = store.styleFor(wire)
    const width = style.wireWidth
    const radius = style.cornerRadius
    // Un pont est une courbe de bout en bout : ni flèche ni pointillés à ses extrémités.
    const jumper = wire.kind === 'jumper'
    const shown = jumper ? null : wireRenderParts(points, wire.freeEnds, flags, width)
    const d = wireShapeData(wire.kind, points, radius)
    return {
      wire,
      width,
      hitWidth: hitWidthOf(width),
      d,
      body: shown ? (shown.body.length >= 2 ? wirePathData(shown.body, radius) : '') : d,
      dotted: shown ? shown.dotted.map((tail) => wirePathData(tail, radius)) : [],
      heads: shown ? shown.heads.map((head) => pointsAttribute(head)) : [],
      // Un fil nu se dessine dans sa couleur (l'étain au départ), avec un liseré sombre dessous.
      color: wire.color,
      bare: wire.kind === 'bare',
      jumper,
      selected: selectedWireSet.value.has(wire.id),
      inHoverNet:
        store.hoverNet !== null && store.connectivity.wireNet.get(wire.id) === store.hoverNet
    }
  })
)

/** Largeur de la zone où un fil de cette épaisseur se saisit : 10 px d'écran au moins. */
function hitWidthOf(width: number): number {
  return Math.max(width, 10 / cell.value)
}

/**
 * Fil sélectionné : un liseré bleu l'entoure, détaché de lui par un filet de la couleur du
 * papier, pour se voir quelle que soit la couleur du fil. Largeurs ajoutées à celle du fil, en
 * pixels d'écran : le liseré déborde de 4,5 px de chaque côté, le filet de 2.
 */
const SELECTION_RING_PX = 9
const SELECTION_GAP_PX = 4

const wireById = computed(() => new Map(store.doc.wires.map((wire) => [wire.id, wire])))

/**
 * Croisements : le fil du dessus, redessiné sur une demi-cellule, dans son épaisseur à lui, avec
 * un liseré couleur papier.
 */
const crossingMarks = computed(() =>
  store.pieces.map((piece) => {
    const [[x1, y1], [x2, y2]] = crossingPieceEnds(piece)
    const top = wireById.value.get(piece.topWireId)
    return {
      key: `${piece.point[0]},${piece.point[1]}`,
      x1,
      y1,
      x2,
      y2,
      width: (top ? store.styleFor(top) : profile.value).wireWidth,
      color: top ? top.color : '#000000'
    }
  })
)

const junctions = computed(() => {
  // Pendant un geste, les points de jonction sont ceux de l'aperçu, les fils aussi.
  const list = dragPreview.value?.junctions ?? store.connectivity.junctions
  const wires = store.doc.wires.map((wire) => ({ ...wire, points: wirePoints(wire) }))
  return list.map((junction) => {
    const dot = junctionDot(junction, wires, store.styles)
    return {
      key: `${junction.point[0]},${junction.point[1]}`,
      x: junction.point[0],
      y: junction.point[1],
      r: dot.radius,
      fill: dot.color
    }
  })
})

/** Points de soudure des fils nus : un point de couleur vive sur chaque broche de leur trajet. */
const solders = computed(() =>
  (dragPreview.value?.solders ?? store.connectivity.solders).map((solder) => {
    const wire = wireById.value.get(solder.wireId)
    const width = (wire ? store.styleFor(wire) : profile.value).wireWidth
    return {
      key: `${solder.wireId}:${solder.point[0]},${solder.point[1]}`,
      x: solder.point[0],
      y: solder.point[1],
      r: width * SOLDER_SCALE
    }
  })
)

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
    const style = store.styleFor(wire)
    return [
      {
        key: `${wire.id}:${end.endIndex}`,
        wireId: wire.id,
        endIndex: end.endIndex,
        text,
        color: wire.color,
        dotRadius: style.wireWidth,
        fontCells: style.endLabelFont.size / style.cellPx,
        family: style.endLabelFont.family,
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

// Bouts de fil

/** Bout d'un fil : son premier ou son dernier sommet. */
interface WireEnd {
  wireId: string
  index: number
  point: GridPoint
}

/** Ce fil est-il, seul, toute la sélection ? */
function selectedAlone(wireId: string): boolean {
  return (
    store.selectedWires.length === 1 &&
    store.selectedWires[0] === wireId &&
    store.selection.length === 0 &&
    store.selectedLabels.length === 0
  )
}

/**
 * Le bout de ce fil se saisit-il ? Pas celui d'un fil pris avec d'autres éléments (sélection à
 * plusieurs, groupe) : ceux-là se déplacent d'un bloc, comme avant.
 */
function endGrabbable(wire: Wire): boolean {
  if (selectedAlone(wire.id)) return true
  if (selectedWireSet.value.has(wire.id)) return false
  return !store.groups.some((group) => group.members.wire.includes(wire.id))
}

/**
 * Bout de fil à portée d'un point : le plus proche ; à distance égale, celui du fil sélectionné
 * seul, puis du fil du dessus. `over` est le fil sous le pointeur : seuls comptent alors ses
 * bouts et ceux des fils posés sur lui (une jonction), pas ceux d'un fil voisin ; et rien du
 * tout s'il se déplace d'un bloc avec d'autres éléments. `any` regarde aussi les fils dont le
 * bout ne se saisit pas.
 */
function wireEndAt(point: LocalPoint, over: Wire | null, any = false): WireEnd | null {
  if (over && !any && !endGrabbable(over)) return null
  const reach = Math.max(END_GRAB_PX / cell.value, END_GRAB_CELLS)
  const ordered = [...store.sortedWires].reverse()
  ordered.sort((a, b) => Number(selectedAlone(b.id)) - Number(selectedAlone(a.id)))
  let best: WireEnd | null = null
  let bestDistance = Infinity
  for (const wire of ordered) {
    if (!any && !endGrabbable(wire)) continue
    const last = wire.points.length - 1
    for (const index of [0, last]) {
      const end = wire.points[index]
      const neighbor = wire.points[index === 0 ? 1 : last - 1]
      if (!end || !neighbor) continue
      if (over && over.id !== wire.id && locateOnWire(over.points, end) === null) continue
      const length = Math.hypot(neighbor[0] - end[0], neighbor[1] - end[1])
      const distance = Math.hypot(point.x - end[0], point.y - end[1])
      if (distance <= Math.min(reach, length * END_GRAB_SHARE) && distance < bestDistance) {
        best = { wireId: wire.id, index, point: end }
        bestDistance = distance
      }
    }
  }
  return best
}

/** Bout de fil qu'un appui saisirait, là où est le pointeur : sa poignée s'annonce. */
const endGrab = computed<WireEnd | null>(() => {
  const point = hover.value
  if (store.tool !== 'select' || drag.value || !point || hoverBlocked.value) return null
  if (store.panKeyHeld || store.ctrlHeld || store.shiftHeld || store.altHeld) return null
  const over = store.hoverWireId === null ? null : wireById.value.get(store.hoverWireId)
  return wireEndAt(point, over ?? null)
})

/** Bout de fil qu'on déplace : où il se poserait, et s'il y trouve une broche. */
const endDrop = computed(() => {
  const current = drag.value
  if (current?.kind !== 'wire-vertex') return null
  const atStart = current.index === 0
  if (!atStart && current.index !== current.original.length - 1) return null
  if (samePoints(current.original, current.preview)) return null
  const point = atStart ? current.preview[0] : current.preview.at(-1)
  if (!point) return null
  const onPin = store.pinRefs.some((pin) => pin.point[0] === point[0] && pin.point[1] === point[1])
  return { x: point[0], y: point[1], onPin }
})

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
  if (over === null) return nearestPin(point)
  // Sur une plaque, qui n'a pas de broches : celle qui est à portée, comme dans le vide.
  return nearestPin(point, Number.POSITIVE_INFINITY, over) ?? nearestPin(point)
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
  // Un pont : sa courbe, du départ au pointeur.
  const jumper = store.tool === 'wire' && store.wireKind === 'jumper'
  const route = wireRoute(last, snap.point)
  return {
    committed,
    pending: jumper
      ? jumperPathData([last, snap.point])
      : wirePathData([...points, ...route.slice(1)], cornerRadius.value),
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
  // Un composant extensible se pose à son nombre de motifs de départ.
  const def = stretchedDefinition(variantDefinition(current.def, current.variant))
  const size = rotatedSize(def.size, current.rotation)
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
    def,
    transform: matrixToSvg(instanceMatrix(instance, def))
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

/** Déplacement, en pixels, à partir duquel un appui devient un geste qui garde le pointeur. */
const CAPTURE_PX = 3
/** Appui en attente de capture : le pointeur n'est gardé qu'une fois qu'il a vraiment bougé. */
let pendingCapture: { id: number; x: number; y: number } | null = null

/**
 * Le canevas garde le pointeur pendant un geste, même quand il sort de la zone de dessin. La
 * capture attend le premier vrai mouvement : un pointeur capturé dès l'appui ferait arriver le
 * clic et le double-clic au canevas, pas à l'élément visé, et son double-clic ne ferait rien.
 */
function capture(event: PointerEvent): void {
  pendingCapture = { id: event.pointerId, x: event.clientX, y: event.clientY }
}

function captureOnceMoved(event: PointerEvent): void {
  const pending = pendingCapture
  if (!pending || pending.id !== event.pointerId) return
  if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < CAPTURE_PX) return
  pendingCapture = null
  if (drag.value) svg.value?.setPointerCapture(event.pointerId)
}

/**
 * La plaque à deux faces qu'un déplacement peut écarter de son pli : seule sélectionnée.
 * `bottom` dit si l'appui, en `start`, l'a prise par son dessous.
 */
function spreadableBoard(start: LocalPoint): { id: string; bottom: boolean } | null {
  const id = store.selection[0]
  if (
    id === undefined ||
    store.selection.length !== 1 ||
    store.selectedWires.length > 0 ||
    store.selectedLabels.length > 0
  ) {
    return null
  }
  const item = store.placed.find((candidate) => candidate.instance.id === id)
  if (!item || !showsUnderside(item.instance, item.def)) return null
  const bounds = instanceBounds(item.instance, item.def)
  return { id, bottom: start.x > bounds.x + bounds.width + facesGap(item.instance) / 2 }
}

function startMove(event: PointerEvent): void {
  // Une plaque emmène ce qu'elle porte, sans qu'il soit sélectionné ; une copie, non.
  const load = event.altKey ? null : store.selectionLoad()
  const start = toWorld(screenPoint(event))
  drag.value = {
    kind: 'move',
    ids: [...store.selection, ...(load?.instances ?? [])],
    wireIds: [...store.selectedWires, ...(load?.wires ?? [])],
    labelIds: [...store.selectedLabels, ...(load?.labels ?? [])],
    start,
    dx: 0,
    dy: 0,
    duplicate: event.altKey,
    ends: load?.ends ?? [],
    board: event.altKey ? null : spreadableBoard(start)
  }
  capture(event)
}

/**
 * Le lasso prend-il ce composant ? Il suffit qu'il le touche ; une plaque à trous, elle, n'est
 * prise que s'il entoure une de ses faces en entier : sinon on ne pourrait pas prendre au lasso
 * ce qu'elle porte sans la prendre avec.
 */
function bandTakes(item: PlacedInstance, rect: GridRect): boolean {
  const bounds = instanceBounds(item.instance, item.def)
  if (!isBoard(item.def)) return rectsIntersect(bounds, rect)
  return (
    rectContainsRect(rect, bounds) ||
    (showsUnderside(item.instance, item.def) &&
      rectContainsRect(rect, undersideBounds(bounds, facesGap(item.instance))))
  )
}

/**
 * Après un clic sur un élément : son groupe le suit dans la sélection. Ctrl le laisse seul, pour
 * retoucher un élément sans défaire son groupe.
 */
function followGroup(kind: 'instance' | 'wire' | 'label', id: string, event: MouseEvent): void {
  if (!event.ctrlKey) store.syncGroupSelection(kind, id)
}

/** Ce composant posé est-il une plaque à trous ? */
function boardId(id: string): boolean {
  const item = store.placed.find((candidate) => candidate.instance.id === id)
  return item !== undefined && isBoard(item.def)
}

function onInstanceDown(id: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  // Une plaque est le fond sur lequel on câble : près d'un bout de fil, c'est lui qu'on saisit,
  // comme dans le vide, et non la plaque.
  if (boardId(id) && !event.shiftKey && !event.ctrlKey && !event.altKey) {
    const end = wireEndAt(toWorld(screenPoint(event)), null)
    if (end) {
      grabWireEnd(end, event)
      return
    }
  }
  if (event.shiftKey) {
    store.selection = selectedSet.value.has(id)
      ? store.selection.filter((selected) => selected !== id)
      : [...store.selection, id]
    store.syncGroupSelection('instance', id)
    return
  }
  if (!selectedSet.value.has(id)) {
    store.clearSelection()
    store.selection = [id]
  }
  followGroup('instance', id, event)
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
    store.syncGroupSelection('label', label.id)
    return
  }
  if (!selectedLabelSet.value.has(label.id)) {
    store.clearSelection()
    store.selectedLabels = [label.id]
  }
  followGroup('label', label.id, event)
  store.revealInspector()
  startMove(event)
}

/**
 * Ctrl+clic sur un fil : un sommet de plus sur la partie droite visée, ou le coin visé en moins.
 * Le fil devient la sélection ; un fil groupé est d'abord pris seul, sans rien changer.
 */
function toggleVertexAt(wireId: string, point: LocalPoint): void {
  const alone =
    store.selectedWires.length === 1 &&
    store.selectedWires[0] === wireId &&
    store.selection.length === 0 &&
    store.selectedLabels.length === 0
  const grouped = store.groups.some((group) => group.members.wire.includes(wireId))
  store.clearSelection()
  store.selectedWires = [wireId]
  if (!grouped || alone) store.toggleWireVertex(wireId, point)
  store.revealInspector()
}

/**
 * Saisit le bout d'un fil : le fil devient la sélection, et glisser déplace ce bout (le tronçon
 * qui y mène garde sa direction, comme pour tout sommet).
 */
function grabWireEnd(end: WireEnd, event: PointerEvent): void {
  const wire = wireById.value.get(end.wireId)
  if (!wire) return
  if (!selectedAlone(end.wireId)) {
    store.clearSelection()
    store.selectedWires = [end.wireId]
  }
  store.revealInspector()
  drag.value = {
    kind: 'wire-vertex',
    wireId: end.wireId,
    index: end.index,
    original: wire.points,
    preview: [...wire.points]
  }
  capture(event)
}

function onWireDown(wireId: string, event: PointerEvent): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const world = toWorld(screenPoint(event))
  // Alt+clic sur un croisement : l'autre fil passe au-dessus ; ailleurs, Alt+glisser copie.
  if (event.altKey && store.toggleCrossing(world.x, world.y)) return
  if (event.ctrlKey) {
    toggleVertexAt(wireId, world)
    return
  }
  if (event.shiftKey) {
    store.selectedWires = selectedWireSet.value.has(wireId)
      ? store.selectedWires.filter((selected) => selected !== wireId)
      : [...store.selectedWires, wireId]
    store.syncGroupSelection('wire', wireId)
    return
  }
  // Près d'un bout de fil : c'est lui qu'on saisit, pour le poser ailleurs.
  const pressed = wireById.value.get(wireId)
  const end = pressed && !event.altKey ? wireEndAt(world, pressed) : null
  if (end) {
    grabWireEnd(end, event)
    return
  }
  if (!selectedWireSet.value.has(wireId)) {
    store.clearSelection()
    store.selectedWires = [wireId]
  }
  followGroup('wire', wireId, event)
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
  // Un pont n'a pas de tronçon à glisser : on le déplace d'un bloc.
  if (wire.kind === 'jumper') {
    startMove(event)
    return
  }
  drag.value = {
    kind: 'wire-segment',
    wireId,
    index: nearestSegmentIndex(wire.points, world),
    original: wire.points,
    preview: [...wire.points]
  }
  capture(event)
}

/** Appui sur une poignée d'étirement : le geste compte les motifs qu'on ajoute ou qu'on retire. */
function onStretchDown(
  handle: { instanceId: string; axis: StretchAxis; end: StretchEnd; dx: number; dy: number },
  event: PointerEvent
): void {
  if (event.button !== 0 || store.panKeyHeld || store.tool !== 'select') return
  event.stopPropagation()
  const item = store.placed.find((candidate) => candidate.instance.id === handle.instanceId)
  if (!item) return
  const count = stretchCounts(item.def, { x: item.instance.countX, y: item.instance.countY })[
    handle.axis
  ]
  drag.value = {
    kind: 'stretch',
    id: handle.instanceId,
    axis: handle.axis,
    end: handle.end,
    origin: toWorld(screenPoint(event)),
    dx: handle.dx,
    dy: handle.dy,
    original: count,
    count
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
  const vertex = wire.points[index]
  if (event.ctrlKey && vertex) {
    // Ctrl+clic sur la poignée d'un coin : il s'en va.
    toggleVertexAt(wireId, { x: vertex[0], y: vertex[1] })
    return
  }
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
    if (store.wireKind === 'jumper') {
      // Un pont : le second clic le termine.
      store.finishJumper(snap.point)
      return
    }
    store.appendWirePoints(wireRoute(last, snap.point).slice(1))
    if (snap.pinKey !== null || wireAt(snap.point)) store.finishWire()
    return
  }

  // Juste à côté d'un bout de fil : on le saisit, plutôt que d'ouvrir un lasso.
  const end = event.shiftKey || event.ctrlKey || event.altKey ? null : wireEndAt(world, null)
  if (end) {
    grabWireEnd(end, event)
    return
  }
  if (!event.shiftKey) store.clearSelection()
  drag.value = { kind: 'band', start: world, current: world, additive: event.shiftKey }
  capture(event)
}

function onPointerMove(event: PointerEvent): void {
  captureOnceMoved(event)
  const world = toWorld(screenPoint(event))
  hover.value = world
  // Une plaque à trous ne prend pas l'appui pour elle près d'un bout de fil : voir onInstanceDown.
  hoverBlocked.value =
    event.target instanceof Element &&
    event.target.closest('.instance:not(.board), .text-label, .box-handle, .vertex-handle') !== null
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
      current.preview = movedWireVertex(
        wireById.value.get(current.wireId)?.kind,
        current.original,
        current.index,
        snapGrid(world)
      )
      break
    case 'label-handle':
      current.preview = resizeBox(current.original, current.handleId, snapGrid(world))
      break
    case 'stretch': {
      // Un motif de plus à chaque largeur de motif tirée dans le sens de la poignée.
      const item = store.placed.find((candidate) => candidate.instance.id === current.id)
      const pulled =
        (world.x - current.origin.x) * current.dx + (world.y - current.origin.y) * current.dy
      if (item) current.count = pulledCount(item.def, current.original, pulled, current.axis)
      break
    }
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
  pendingCapture = null
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
    else if (current.board && event.ctrlKey) {
      // Ctrl : la plaque bouge par rapport à son pli, ses deux faces en miroir.
      const { id, bottom } = current.board
      store.spreadBoardFaces(id, bottom ? -current.dx : current.dx, current.dy)
    } else store.moveSelection(current.dx, current.dy)
  } else if (current.kind === 'band') {
    const rect = normalizeRect(current.start, current.current)
    if (rect.width > 0.05 || rect.height > 0.05) {
      const instances = store.placed
        .filter((item) => bandTakes(item, rect))
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
      // Un groupe touché par le lasso est pris en entier.
      store.expandSelectionToGroups()
      if (store.hasSelection) store.revealInspector()
    }
  } else if (current.kind === 'wire-segment' || current.kind === 'wire-vertex') {
    if (!samePoints(current.original, current.preview)) {
      store.setWirePoints(current.wireId, current.preview)
    }
  } else if (current.kind === 'label-handle') {
    const { original: a, preview: b } = current
    if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) store.setLabelBox(current.id, b)
  } else if (current.kind === 'stretch') {
    // Le bout qu'on ne tire pas reste en place.
    if (current.count !== current.original) {
      store.setInstanceCount(
        current.id,
        current.count,
        current.end === 'end' ? 'start' : 'end',
        current.axis
      )
    }
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

/**
 * Double-clic : termine le fil en cours ; en sélection, sur une extrémité libre, son étiquette ;
 * ailleurs sur un fil, un nouveau fil qui part de là.
 */
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
  if (hit) {
    emit('editWireEnd', hit.wireId, hit.endIndex)
    return
  }
  // Sur un fil, hors de ses extrémités : un nouveau fil part de ce point, raccordé au premier.
  // Près d'un bout, quel que soit le fil dessous : on voulait le saisir, pas en tirer un autre.
  if (event.ctrlKey || event.shiftKey || event.altKey) return
  if (wireEndAt(world, null, true)) return
  const start = wireSpotAt(world)
  if (start) {
    drag.value = null
    store.startWireFrom(start)
  }
}

/**
 * Point de la grille du fil qui passe sous le pointeur (celui du dessus s'il y en a plusieurs),
 * hors de ses extrémités ; null loin de tout fil. Cherché par la géométrie : après un appui qui
 * a capturé le pointeur, le double-clic arrive au canevas, pas au fil.
 */
function wireSpotAt(point: LocalPoint): GridPoint | null {
  for (let index = store.sortedWires.length - 1; index >= 0; index--) {
    const wire = store.sortedWires[index]
    // On ne se raccorde pas au milieu d'un pont : il n'a que ses bouts.
    if (!wire || wire.kind === 'jumper') continue
    const reach = hitWidthOf(store.styleFor(wire).wireWidth) / 2
    const at = nearestSegmentIndex(wire.points, point)
    const a = wire.points[at]
    const b = wire.points[at + 1]
    if (!a || !b || distanceToSegment(point, a, b) > reach) continue
    const spot = nearestWirePoint(wire.points, point)
    if (spot && spot.location.kind !== 'end') return spot.point
  }
  return null
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
    store.syncGroupSelection('instance', target.id)
  } else if (target.kind === 'wire' && !selectedWireSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedWires = [target.id]
    store.syncGroupSelection('wire', target.id)
  } else if (target.kind === 'label' && !selectedLabelSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedLabels = [target.id]
    store.syncGroupSelection('label', target.id)
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

/** Coordonnées de la sélection, pour la barre d'état. */
const selectionText = computed(() => formatReadout(store.selectionReadout))

const cursorClass = computed(() => {
  if (store.panKeyHeld || drag.value?.kind === 'pan') return 'panning'
  if (store.tool === 'place') return 'placing'
  if (store.tool === 'text') return 'texting'
  // Ctrl sur une broche saisissable : le curseur annonce le fil.
  if (store.tool === 'wire' || drag.value?.kind === 'pin-wire' || pinGrab.value) return 'wiring'
  // Près d'un bout de fil : le curseur annonce qu'on le déplacerait.
  return endGrab.value ? 'end-near' : ''
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
          <!-- Le pli entre les deux faces d'une plaque, sous tout le reste. -->
          <g v-for="hinge in hinges" :key="`hinge:${hinge.id}`" class="faces-hinge">
            <line
              v-for="(span, s) in hinge.spans"
              :key="s"
              :x1="hinge.x"
              :x2="hinge.x"
              :y1="span[0]"
              :y2="span[1]"
              :stroke-width="HINGE_STYLE.width"
              :stroke-dasharray="HINGE_STYLE.dash"
            />
            <path :d="hinge.arc" :stroke-width="HINGE_STYLE.arrowWidth" />
            <polygon :points="hinge.head" />
          </g>

          <template v-for="layer in STACK" :key="layer">
            <template v-if="layer === 'wires'">
              <g class="net-glows">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path v-if="item.inHoverNet" :d="item.d" :stroke-width="item.width * 3" />
                </template>
              </g>
              <g class="wire-selections">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path
                    v-if="item.selected"
                    class="ring"
                    :d="item.d"
                    :stroke-width="item.width + SELECTION_RING_PX / cell"
                  />
                </template>
                <template v-for="item in renderedWires" :key="`gap:${item.wire.id}`">
                  <path
                    v-if="item.selected"
                    class="gap"
                    :d="item.d"
                    :stroke-width="item.width + SELECTION_GAP_PX / cell"
                  />
                </template>
              </g>

              <g class="wires">
                <template v-for="item in renderedWires" :key="item.wire.id">
                  <path
                    v-if="item.body && item.bare"
                    class="wire wire-edge"
                    :d="item.body"
                    :stroke="BARE_WIRE_EDGE"
                    :stroke-width="item.width * BARE_WIRE_EDGE_SCALE"
                  />
                  <path
                    v-if="item.body"
                    class="wire"
                    :class="{ 'wire-bare': item.bare, 'wire-jumper': item.jumper }"
                    :d="item.body"
                    :stroke="screenColor(item.color)"
                    :stroke-width="item.width"
                  />
                  <path
                    v-for="(tail, t) in item.dotted"
                    :key="`tail${t}`"
                    class="wire wire-dotted"
                    :d="tail"
                    :stroke="screenColor(item.color)"
                    :stroke-width="item.width"
                    :stroke-dasharray="`0 ${item.width * 2}`"
                  />
                  <polygon
                    v-for="(head, h) in item.heads"
                    :key="`head${h}`"
                    class="wire-head"
                    :points="head"
                    :fill="screenColor(item.color)"
                  />
                  <path
                    class="wire-hit"
                    :d="item.d"
                    :stroke-width="item.hitWidth"
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
                    :stroke-width="mark.width * 2.2"
                  />
                  <line
                    :x1="mark.x1"
                    :y1="mark.y1"
                    :x2="mark.x2"
                    :y2="mark.y2"
                    :stroke="screenColor(mark.color)"
                    :stroke-width="mark.width"
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

              <g class="solders">
                <circle
                  v-for="dot in solders"
                  :key="dot.key"
                  class="solder"
                  :cx="dot.x"
                  :cy="dot.y"
                  :r="dot.r"
                  :fill="SOLDER_COLOR"
                  :stroke="SOLDER_EDGE"
                  vector-effect="non-scaling-stroke"
                />
              </g>
            </template>

            <template v-else>
              <template v-for="item in layers[layer].instances" :key="item.instance.id">
                <g
                  class="instance"
                  :class="{ board: isBoard(item.def) }"
                  :transform="transformOf(item)"
                  @pointerdown="onInstanceDown(item.instance.id, $event)"
                  @dblclick="onInstanceDoubleClick(item.instance.id, $event)"
                  @contextmenu="onContextMenu($event, { kind: 'instance', id: item.instance.id })"
                >
                  <ComponentGraphic
                    :def="item.def"
                    :cell-px="1"
                    :pixel="1 / cell"
                    :stroke-base="store.styleFor(item.instance).componentStroke"
                    :fields="item.instance.fields"
                    :ink="store.staleDefIds.has(item.def.id) ? 'var(--stale)' : null"
                    skip-texts
                  />
                  <rect
                    v-if="
                      store.staleDefIds.has(item.def.id) && componentImages(item.def).length > 0
                    "
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
                <!-- Le dessous d'une plaque, à sa droite : le même dessin retourné, sans textes. -->
                <g
                  v-if="undersides.has(item.instance.id)"
                  class="instance underside board"
                  :transform="undersides.get(item.instance.id)"
                  @pointerdown="onInstanceDown(item.instance.id, $event)"
                  @contextmenu="onContextMenu($event, { kind: 'instance', id: item.instance.id })"
                >
                  <g :transform="transformOf(item)">
                    <ComponentGraphic
                      :def="item.def"
                      :cell-px="1"
                      :pixel="1 / cell"
                      :stroke-base="store.styleFor(item.instance).componentStroke"
                      :fields="item.instance.fields"
                      :ink="store.staleDefIds.has(item.def.id) ? 'var(--stale)' : null"
                      skip-texts
                    />
                    <rect
                      class="hit"
                      :width="item.def.size.widthCells"
                      :height="item.def.size.heightCells"
                      fill="transparent"
                    />
                  </g>
                </g>
                <!-- Sur l'autre face d'une plaque à deux faces, l'empreinte des composants
                     qu'elle porte : une silhouette par composant, sous les pattes qui y
                     ressortent. -->
                <template v-if="footprintsByBoard.has(item.instance.id)">
                  <g
                    v-for="part in footprintsByBoard.get(item.instance.id)"
                    :key="`empreinte:${part.instance.id}`"
                    class="footprint"
                    :transform="undersides.get(item.instance.id)"
                  >
                    <g :transform="transformOf(part)">
                      <FootprintGraphic
                        :def="part.def"
                        :mask-id="`empreinte-${item.instance.id}-${part.instance.id}`"
                      />
                    </g>
                  </g>
                </template>
                <g v-if="throughByBoard.has(item.instance.id)" class="through-marks">
                  <circle
                    v-for="mark in throughByBoard.get(item.instance.id)"
                    :key="mark.key"
                    class="through"
                    :cx="mark.x"
                    :cy="mark.y"
                    :r="THROUGH_MARK_RADIUS"
                    :fill="THROUGH_MARK_COLOR"
                    :stroke="THROUGH_MARK_EDGE"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
                <g v-if="textsByInstance.has(item.instance.id)" class="instance-texts">
                  <text
                    v-for="entry in textsByInstance.get(item.instance.id)"
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
          </template>

          <g class="labels">
            <text
              v-for="entry in instanceLabels"
              :key="entry.id"
              :x="entry.x"
              :y="entry.y"
              :font-size="entry.fontCells"
              :font-family="entry.family"
            >
              {{ entry.text }}
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
                :font-family="entry.family"
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
                :r="entry.dotRadius"
                :fill="screenColor(entry.color)"
              />
              <text
                :x="entry.x"
                :y="entry.y"
                :font-size="entry.fontCells"
                :font-family="entry.family"
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
            v-if="twinMark"
            class="twin-mark"
            :cx="twinMark.x"
            :cy="twinMark.y"
            :r="0.42"
            vector-effect="non-scaling-stroke"
          />

          <circle
            v-if="pinGrab"
            class="pin-grab"
            :cx="pinGrab.point[0]"
            :cy="pinGrab.point[1]"
            :r="pinGrabReach"
            vector-effect="non-scaling-stroke"
          />

          <rect
            v-for="outline in groupOutlines"
            :key="`group:${outline.id}`"
            class="group-outline"
            :x="outline.x"
            :y="outline.y"
            :width="outline.width"
            :height="outline.height"
            :rx="GROUP_MARGIN_CELLS"
            vector-effect="non-scaling-stroke"
          />

          <rect
            v-for="box in selectedBoxes"
            :key="box.id"
            class="selection"
            :x="box.x - SELECTION_MARGIN_CELLS"
            :y="box.y - SELECTION_MARGIN_CELLS"
            :width="box.width + 2 * SELECTION_MARGIN_CELLS"
            :height="box.height + 2 * SELECTION_MARGIN_CELLS"
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
            <g
              v-for="handle in stretchGrips"
              :key="`stretch:${handle.axis}:${handle.end}`"
              class="box-handle stretch-handle"
              :class="`stretch-${handle.axis}-${handle.end}`"
              :style="{ cursor: handle.cursor }"
              @pointerdown="onStretchDown(handle, $event)"
            >
              <circle
                class="stretch-hit"
                :cx="handle.center.x"
                :cy="handle.center.y"
                :r="handle.reach"
              />
              <path class="stretch-arrow" :d="handle.arrow" vector-effect="non-scaling-stroke" />
            </g>
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

          <!-- Au-dessus des marques d'édition : la poignée annoncée couvre le carré d'un bout libre. -->
          <circle
            v-if="endGrab"
            class="end-grab"
            :cx="endGrab.point[0]"
            :cy="endGrab.point[1]"
            :r="6.5 / cell"
            vector-effect="non-scaling-stroke"
          />

          <g v-if="ghostCopies" class="ghost" :transform="ghostCopies.transform">
            <path
              v-for="wire in ghostCopies.wires"
              :key="wire.id"
              class="ghost-wire"
              :d="wire.d"
              :stroke="screenColor(wire.color)"
              :stroke-width="wire.width"
            />
            <g
              v-for="item in ghostCopies.instances"
              :key="item.instance.id"
              :transform="matrixToSvg(instanceMatrix(item.instance, item.def))"
            >
              <ComponentGraphic
                :def="item.def"
                :cell-px="1"
                :pixel="1 / cell"
                :stroke-base="store.styleFor(item.instance).componentStroke"
                :fields="item.instance.fields"
              />
            </g>
            <text
              v-for="entry in ghostCopies.labels"
              :key="entry.label.id"
              :transform="entry.transform"
              :font-size="entry.label.size / profile.cellPx"
              :font-family="entry.family"
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
              :pixel="1 / cell"
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
              :stroke="screenColor(store.drawingColor)"
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

          <circle
            v-if="endDrop"
            class="end-drop"
            :class="{ 'on-pin': endDrop.onPin }"
            :cx="endDrop.x"
            :cy="endDrop.y"
            :r="7 / cell"
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
      <span v-if="selectionText" class="selected">Sélection : {{ selectionText }}</span>
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

.net-glows path,
.wire-selections path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.net-glows path {
  stroke: #ffd33d;
}

/* Fil sélectionné : liseré bleu franc, puis filet de la couleur du papier sous le fil. Tous les
   liserés d'abord, tous les filets ensuite : deux fils sélectionnés qui se touchent restent nets. */
.wire-selections .ring {
  stroke: var(--selection);
}

.wire-selections .gap {
  stroke: var(--paper);
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
  stroke: var(--selection);
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
  stroke: var(--selection);
  stroke-width: 1.5;
  cursor: move;
}

/* Bout de fil qu'un appui saisirait : sa poignée s'annonce, que le fil soit sélectionné ou non. */
.end-grab {
  fill: #ffffff;
  stroke: var(--selection);
  stroke-width: 2;
  pointer-events: none;
}

.schematic.end-near,
.schematic.end-near .wire-hit {
  cursor: move;
}

.box-handle {
  fill: #ffffff;
  stroke: var(--selection);
  stroke-width: 1.5;
  cursor: nwse-resize;
}

/* Point de soudure d'un fil nu sur une broche : un point de couleur vive, cerné de sombre. */
.solder {
  stroke-width: 1.25;
  pointer-events: none;
}

/* Le pli entre les deux faces d'une plaque : un trait pointillé et la flèche « retournée ». */
.faces-hinge {
  fill: none;
  stroke: var(--text-muted);
  stroke-linecap: round;
  pointer-events: none;
}

.faces-hinge line {
  stroke-linecap: butt;
}

.faces-hinge polygon {
  fill: var(--text-muted);
  stroke: none;
}

/* L'empreinte d'un composant sur l'autre face de sa plaque : on ne la saisit pas. */
.footprint {
  pointer-events: none;
}

/* Ce qui traverse une plaque à deux faces : un point de couleur vive, cerné de sombre. */
.through {
  stroke-width: 1.25;
  pointer-events: none;
}

/* Le trou survolé, vu de l'autre face de la plaque. */
.twin-mark {
  fill: none;
  stroke: var(--selection);
  stroke-width: 2;
  pointer-events: none;
}

/* Un pont est une courbe : ses bouts sont ronds. */
.wire-jumper {
  stroke-linecap: round;
}

/* Poignée d'étirement : une flèche pleine, de la couleur de la sélection, détachée de ce
   qu'elle recouvre par un filet de la couleur du papier ; autour, un disque invisible à saisir. */
.stretch-arrow {
  fill: var(--selection);
  stroke: var(--paper);
  stroke-width: 1;
  stroke-linejoin: round;
}

.stretch-hit {
  fill: transparent;
  stroke: none;
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
  stroke: var(--selection);
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
  stroke: var(--selection);
  stroke-opacity: 0.6;
}

.drawing .end,
.end-drop,
.wire-start {
  fill: rgba(31, 111, 235, 0.15);
  stroke: var(--selection);
  stroke-width: 1.5;
  pointer-events: none;
}

.drawing .end.on-pin,
.end-drop.on-pin,
.wire-start.on-pin {
  fill: rgba(26, 127, 55, 0.25);
  stroke: #1a7f37;
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

/* Coordonnées de la sélection : chiffres alignés, espaces gardés, comme celles du pointeur. */
.selected {
  flex: none;
  font-variant-numeric: tabular-nums;
  white-space: pre;
  color: var(--text);
}

.message {
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
