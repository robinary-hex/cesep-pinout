<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  boxHandles,
  createNode,
  DIAGRAM_FONT_FAMILIES,
  dragVertex,
  gridLines,
  layoutLabel,
  layoutLinkLabel,
  linkDashArray,
  linkLabelBox,
  linkShape,
  linksFollowingNodes,
  moveSegment,
  nearestOnPath,
  nearestSegmentIndex,
  NODE_SPECS,
  nodeBounds,
  nodeHandles,
  pointsAttribute,
  rectsIntersect,
  resizeBox,
  resizeNodeBox,
  routeLAuto,
  screenToWorld,
  textEmphasisAttrs,
  textLabelBounds,
  textTransform,
  wireIntersectsRect,
  wirePathData,
  type Box,
  type DiagramLink,
  type DiagramNode,
  type GridPoint,
  type GridRect,
  type LinkLabelSide,
  type LocalPoint,
  type NodeAnchor,
  type TextLabel
} from '@/domain'
import DiagramNodeGraphic from '@/render/DiagramNodeGraphic.vue'
import { screenColor } from '@/render/ink'
import type { DiagramMenuRequest, DiagramMenuTarget } from './menu'
import { useDiagramStore } from './store'

// Canevas infini du diagramme. Tout le contenu est dessiné en cellules dans un groupe mis à
// l'échelle (zoom) et translaté (pan) ; seule la grille est calculée en pixels d'écran. Ordre
// d'empilement : grille, liens, nœuds, étiquettes de lien, textes libres, anneau de saisie du
// point d'accroche survolé, surcouches de sélection et poignées, copies fantômes (Alt+glisser),
// fantôme de pose, tracé en cours, rectangle de sélection. Les gestes sont un état local (`drag`)
// qui ne touche le document qu'au relâchement, par une commande du store. Le texte d'un nœud se
// tape sur place, dans un petit éditeur HTML posé par-dessus lui.

const store = useDiagramStore()
const emit = defineEmits<{
  openMenu: [request: DiagramMenuRequest]
  editLink: [id: string]
  editText: [id: string]
}>()
const host = ref<HTMLDivElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const titleInput = ref<HTMLTextAreaElement | null>(null)
const editorBox = ref<HTMLDivElement | null>(null)

const ZOOM_STEP = 1.1
/** Départ ou arrivée d'un lien : un point d'accroche à moins d'une cellule l'emporte sur la grille. */
const ANCHOR_SNAP_CELLS = 1
/** Anneau de l'accroche qu'un Ctrl+glisser saisirait : 8 px de rayon, une demi-cellule au plus. */
const ANCHOR_GRAB_PX = 8
const ANCHOR_GRAB_CELLS = 0.5
/** Déplacement du pointeur, en pixels, à partir duquel un appui sur une accroche devient un lien. */
const DRAG_PX = 4
const DOUBLE_CLICK_MS = 400
/** En dessous de cette taille de cellule, la grille ne montre qu'une ligne sur deux. */
const FINE_GRID_PX = 14

const cell = computed(() => store.cellPx)
const view = computed(() => store.view)
const look = computed(() => store.style)
const lineWidth = computed(() => look.value.lineWidth)
const fontFamily = computed(() => DIAGRAM_FONT_FAMILIES[look.value.font])

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | {
      kind: 'move'
      nodeIds: string[]
      linkIds: string[]
      textIds: string[]
      start: LocalPoint
      dx: number
      dy: number
      /** Alt+glisser : les originaux restent, une copie se dépose à l'arrivée. */
      duplicate: boolean
    }
  | { kind: 'band'; start: LocalPoint; current: LocalPoint; additive: boolean }
  | { kind: 'text-box'; start: GridPoint; current: GridPoint }
  | { kind: 'node-handle'; id: string; handleId: string; original: Box; preview: Box }
  | { kind: 'text-handle'; id: string; handleId: string; original: Box; preview: Box }
  | {
      kind: 'link-segment' | 'link-vertex'
      linkId: string
      index: number
      original: readonly GridPoint[]
      preview: GridPoint[]
    }
  | {
      /** Lien tiré d'un point d'accroche par Ctrl+glisser en mode sélection : relâcher le pose. */
      kind: 'anchor-link'
      nodeId: string
      origin: GridPoint
      downX: number
      downY: number
      /** Faux tant que le pointeur n'a pas quitté l'accroche : un simple clic sélectionne le nœud. */
      moved: boolean
    }
  | {
      /** Étiquette d'un lien qu'on fait glisser : elle longe le tracé, d'un côté ou de l'autre. */
      kind: 'label'
      linkId: string
      original: { at: number; side: LinkLabelSide }
      at: number
      side: LinkLabelSide
    }

const drag = ref<Drag | null>(null)
/** Pointeur en cellules (flottant), null hors du canevas. */
const hover = ref<LocalPoint | null>(null)
/** Nœud dont on tape le texte sur place. */
const editing = ref<{ id: string; title: string; subtitle: string } | null>(null)
let lastMiddleDown = 0

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

/** Point d'accroche le plus proche à portée ; `nodeId` ne regarde que ceux d'un nœud. */
function nearestAnchor(
  point: LocalPoint,
  reach: number,
  nodeId: string | null = null
): NodeAnchor | null {
  let best: NodeAnchor | null = null
  let bestDistance = reach
  for (const anchor of store.anchors) {
    if (nodeId !== null && anchor.nodeId !== nodeId) continue
    const distance = Math.hypot(anchor.point[0] - point.x, anchor.point[1] - point.y)
    if (distance <= bestDistance) {
      best = anchor
      bestDistance = distance
    }
  }
  return best
}

/** Départ ou arrivée d'un lien : un point d'accroche proche l'emporte sur la grille. */
function linkSnap(point: LocalPoint): { point: GridPoint; anchored: boolean } {
  const anchor = nearestAnchor(point, ANCHOR_SNAP_CELLS)
  return anchor
    ? { point: anchor.point, anchored: true }
    : { point: snapGrid(point), anchored: false }
}

// Grille : une ligne par cellule de près, une sur deux de loin (la cellule d'un diagramme est fine).
const grid = computed(() =>
  gridLines(view.value, cell.value >= FINE_GRID_PX ? cell.value : cell.value * 2, store.viewport)
)

const selectedNodeSet = computed(() => new Set(store.selectedNodes))
const selectedLinkSet = computed(() => new Set(store.selectedLinks))
const selectedTextSet = computed(() => new Set(store.selectedTexts))

/**
 * Le diagramme tel qu'on le montre pendant un geste : nœuds et textes décalés, boîte en cours de
 * redimensionnement, lien en cours d'édition, et les liens accrochés qui suivent déjà.
 */
const shown = computed<{ nodes: DiagramNode[]; links: DiagramLink[]; texts: TextLabel[] }>(() => {
  const doc = store.doc
  const current = drag.value
  if (!current) return doc
  if (current.kind === 'move') {
    const { dx, dy } = current
    if (current.duplicate || (dx === 0 && dy === 0)) return doc
    const nodeIds = new Set(current.nodeIds)
    const textIds = new Set(current.textIds)
    const nodes = doc.nodes.map((node) =>
      nodeIds.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node
    )
    const translated = new Map(current.linkIds.map((id) => [id, [dx, dy] as GridPoint]))
    return {
      nodes,
      links: linksFollowingNodes(doc.links, doc.nodes, nodes, translated),
      texts: doc.texts.map((text) =>
        textIds.has(text.id) ? { ...text, x: text.x + dx, y: text.y + dy } : text
      )
    }
  }
  if (current.kind === 'node-handle') {
    const nodes = doc.nodes.map((node) =>
      node.id === current.id ? { ...node, ...current.preview } : node
    )
    return { nodes, links: linksFollowingNodes(doc.links, doc.nodes, nodes), texts: doc.texts }
  }
  if (current.kind === 'text-handle') {
    return {
      ...doc,
      texts: doc.texts.map((text) =>
        text.id === current.id ? { ...text, ...current.preview } : text
      )
    }
  }
  if (current.kind === 'link-segment' || current.kind === 'link-vertex') {
    return {
      ...doc,
      links: doc.links.map((link) =>
        link.id === current.linkId ? { ...link, points: current.preview } : link
      )
    }
  }
  if (current.kind === 'label') {
    return {
      ...doc,
      links: doc.links.map((link) =>
        link.id === current.linkId
          ? { ...link, labelAt: current.at, labelSide: current.side }
          : link
      )
    }
  }
  return doc
})

// Liens

const renderedLinks = computed(() =>
  shown.value.links.map((link) => {
    const shape = linkShape(link, shown.value.nodes, lineWidth.value)
    return {
      link,
      // Le trait s'arrête dans ses pointes ; la sélection et la zone cliquable vont jusqu'au bout.
      d: wirePathData(shape.stroke, look.value.cornerRadius),
      reach: wirePathData(shape.points, look.value.cornerRadius),
      dash: linkDashArray(link, lineWidth.value),
      heads: shape.heads.map(pointsAttribute),
      selected: selectedLinkSet.value.has(link.id),
      label: layoutLinkLabel(link, look.value),
      labelBox: linkLabelBox(link, look.value)
    }
  })
)

const hitWidth = computed(() => Math.max(lineWidth.value, 10 / cell.value))

/** Un seul lien sélectionné, rien d'autre : ses sommets ont des poignées. */
const soleLink = computed(() => {
  const id = store.selectedLinks[0]
  if (
    id === undefined ||
    store.selectedLinks.length !== 1 ||
    store.selectedNodes.length > 0 ||
    store.selectedTexts.length > 0 ||
    drag.value?.kind === 'move'
  ) {
    return null
  }
  return shown.value.links.find((link) => link.id === id) ?? null
})

const vertexHandles = computed(() =>
  (soleLink.value?.points ?? []).map(([x, y], index) => ({ key: `v${index}`, index, x, y }))
)

// Nœuds

const nodeBoxes = computed(() =>
  shown.value.nodes
    .filter((node) => selectedNodeSet.value.has(node.id))
    .map((node) => ({ id: node.id, ...nodeBounds(node) }))
)

/** Un seul nœud sélectionné, rien d'autre : sa boîte a des poignées. */
const soleNodeHandles = computed(() => {
  const id = store.selectedNodes[0]
  if (
    id === undefined ||
    store.selectedNodes.length !== 1 ||
    store.selectedLinks.length > 0 ||
    store.selectedTexts.length > 0 ||
    drag.value?.kind === 'move'
  ) {
    return []
  }
  const node = shown.value.nodes.find((candidate) => candidate.id === id)
  return node ? nodeHandles(node).map((handle) => ({ ...handle, nodeId: node.id })) : []
})

/** Curseur d'une poignée : la double flèche de son côté ou de son coin. */
function handleCursor(handleId: string): string {
  if (handleId === 'n' || handleId === 's') return 'ns-resize'
  if (handleId === 'e' || handleId === 'w') return 'ew-resize'
  return handleId === 'nw' || handleId === 'se' ? 'nwse-resize' : 'nesw-resize'
}

/** Zone cliquable d'un nœud : sa boîte, élargie pour une barre. */
function hitRect(node: DiagramNode): GridRect {
  const bounds = nodeBounds(node)
  if (!NODE_SPECS[node.shape].line) return bounds
  const margin = 0.4
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + 2 * margin,
    height: bounds.height + 2 * margin
  }
}

// Textes libres

const texts = computed(() =>
  shown.value.texts.map((text) => {
    const box: Box = { x: text.x, y: text.y, w: text.w, h: text.h }
    return {
      text,
      box,
      fontCells: text.size / look.value.cellPx,
      transform: textTransform(text),
      layout: layoutLabel(text, look.value.cellPx),
      selected: selectedTextSet.value.has(text.id)
    }
  })
)

/** Poignées de la boîte d'un texte seul sélectionné. */
const textHandles = computed(() => {
  const id = store.selectedTexts[0]
  if (
    id === undefined ||
    store.selectedTexts.length !== 1 ||
    store.selectedNodes.length > 0 ||
    store.selectedLinks.length > 0 ||
    drag.value?.kind === 'move'
  ) {
    return []
  }
  const text = shown.value.texts.find((candidate) => candidate.id === id)
  return text ? boxHandles(text).map((handle) => ({ ...handle, textId: text.id })) : []
})

// Copies fantômes d'un Alt+glisser

const ghostCopies = computed(() => {
  const current = drag.value
  if (current?.kind !== 'move' || !current.duplicate || (current.dx === 0 && current.dy === 0)) {
    return null
  }
  const nodeIds = new Set(current.nodeIds)
  const linkIds = new Set(current.linkIds)
  const textIds = new Set(current.textIds)
  return {
    transform: `translate(${current.dx} ${current.dy})`,
    nodes: store.doc.nodes.filter((node) => nodeIds.has(node.id)),
    links: store.doc.links
      .filter((link) => linkIds.has(link.id))
      .map((link) => ({
        id: link.id,
        color: link.color,
        d: wirePathData(link.points, look.value.cornerRadius)
      })),
    texts: store.doc.texts.filter((text) => textIds.has(text.id))
  }
})

// Accroche survolée, tracé en cours, pose

const anchorReach = computed(() => Math.min(ANCHOR_GRAB_CELLS, ANCHOR_GRAB_PX / cell.value))

/** Nœud sous un point : le dernier dessiné dont la zone cliquable le contient. */
function nodeAt(point: LocalPoint): string | null {
  for (let index = store.doc.nodes.length - 1; index >= 0; index--) {
    const node = store.doc.nodes[index]
    if (!node) continue
    const rect = hitRect(node)
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      return node.id
    }
  }
  return null
}

/**
 * Point d'accroche qu'un Ctrl+glisser saisirait, en mode sélection : le plus proche du pointeur
 * parmi ceux du nœud survolé, sinon une accroche à portée. Ctrl tient ici le rôle qu'il a dans
 * l'éditeur de composants, où il saisit la poignée la plus proche d'une forme. Sans Ctrl, rien :
 * glisser un nœud le déplace. L'anneau reste pendant un simple Ctrl+clic.
 */
const anchorGrab = computed<NodeAnchor | null>(() => {
  const current = drag.value
  if (current) {
    if (current.kind !== 'anchor-link' || current.moved) return null
    return { nodeId: current.nodeId, point: current.origin }
  }
  const point = hover.value
  if (store.tool !== 'select' || !store.ctrlHeld || store.panKeyHeld || editing.value || !point) {
    return null
  }
  const over = nodeAt(point)
  return over === null
    ? nearestAnchor(point, ANCHOR_SNAP_CELLS)
    : nearestAnchor(point, Number.POSITIVE_INFINITY, over)
})

/** Sommets posés du tracé en cours : ceux de l'outil Lien, ou l'accroche d'où l'on tire un lien. */
const drawingPoints = computed<readonly GridPoint[] | null>(() => {
  const current = drag.value
  if (current?.kind === 'anchor-link') return current.moved ? [current.origin] : null
  return store.drawing?.points ?? null
})

const drawingPreview = computed(() => {
  const points = drawingPoints.value
  const point = hover.value
  if (!points) return null
  const last = points.at(-1)
  if (!last) return null
  const committed = wirePathData(points, look.value.cornerRadius)
  if (!point) return { committed, pending: '', end: null as GridPoint | null, anchored: false }
  const snap = linkSnap(point)
  const route = routeLAuto(last, snap.point, store.shiftHeld)
  return {
    committed,
    pending: wirePathData([...points, ...route.slice(1)], look.value.cornerRadius),
    end: snap.point,
    anchored: snap.anchored
  }
})

const linkStartTarget = computed(() => {
  if (store.tool !== 'link' || store.drawing || !hover.value) return null
  return linkSnap(hover.value)
})

/** Fantôme de la forme en cours de pose, centré sur le pointeur. */
const ghost = computed<DiagramNode | null>(() => {
  const shape = store.placement
  const point = hover.value
  if (!shape || !point || store.tool !== 'place') return null
  const size = NODE_SPECS[shape].defaultSize
  return {
    ...createNode(
      'ghost',
      shape,
      Math.round(point.x - size.w / 2),
      Math.round(point.y - size.h / 2),
      look.value
    ),
    color: store.nodeColor,
    fill: store.nodeFill
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

/** Aperçu de la boîte d'un texte en cours de pose. */
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

// Changer d'onglet abandonne le geste et la saisie en cours : ils portaient sur l'autre diagramme.
watch(
  () => store.activeTabId,
  () => {
    drag.value = null
    editing.value = null
  }
)

// Changer d'outil abandonne un texte dont le second coin n'est pas encore donné.
watch(
  () => store.tool,
  () => {
    if (drag.value?.kind === 'text-box') drag.value = null
  }
)

// Texte d'un nœud, tapé sur place

function openEditor(id: string): void {
  const node = store.doc.nodes.find((candidate) => candidate.id === id)
  if (!node || !NODE_SPECS[node.shape].text) return
  editing.value = { id, title: node.title, subtitle: node.subtitle }
  void nextTick(() => {
    titleInput.value?.focus()
    titleInput.value?.select()
  })
}

function commitEditor(): void {
  const state = editing.value
  if (!state) return
  editing.value = null
  const node = store.doc.nodes.find((candidate) => candidate.id === state.id)
  if (node && (node.title !== state.title || node.subtitle !== state.subtitle)) {
    store.setNodeText(state.id, { title: state.title, subtitle: state.subtitle })
  }
}

/** Entrée valide (Maj+Entrée va à la ligne dans le titre), Échap abandonne. */
function onEditorKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editing.value = null
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitEditor()
  }
}

/**
 * Le focus quitte l'éditeur (clic ailleurs, Tab après le sous-titre) : la saisie est validée. On
 * attend la fin de l'événement en cours : un clic sur l'autre champ de l'éditeur retire d'abord le
 * focus (la coque valide le champ qu'on quitte) avant de le lui redonner.
 */
function onEditorFocusOut(): void {
  window.setTimeout(() => {
    const box = editorBox.value
    if (box && box.contains(document.activeElement)) return
    commitEditor()
  }, 0)
}

/** Place et taille de l'éditeur à l'écran : sur le nœud, au moins assez large pour taper. */
const editorStyle = computed(() => {
  const state = editing.value
  const node = state ? store.doc.nodes.find((candidate) => candidate.id === state.id) : null
  if (!node) return null
  const c = cell.value
  const width = Math.max(node.w * c, 180)
  return {
    left: `${view.value.panX + (node.x + node.w / 2) * c - width / 2}px`,
    top: `${view.value.panY + node.y * c}px`,
    width: `${width}px`,
    minHeight: `${node.h * c}px`
  }
})

const titleRows = computed(() => editing.value?.title.split('\n').length ?? 1)

// Interactions

function capture(event: PointerEvent): void {
  svg.value?.setPointerCapture(event.pointerId)
}

function selectTool(event: PointerEvent): boolean {
  return event.button === 0 && !store.panKeyHeld && store.tool === 'select'
}

function startMove(event: PointerEvent): void {
  drag.value = {
    kind: 'move',
    nodeIds: [...store.selectedNodes],
    linkIds: [...store.selectedLinks],
    textIds: [...store.selectedTexts],
    start: toWorld(screenPoint(event)),
    dx: 0,
    dy: 0,
    duplicate: event.altKey
  }
  capture(event)
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((other) => other !== id) : [...list, id]
}

function onNodeDown(id: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  if (event.shiftKey) {
    store.selectedNodes = toggle(store.selectedNodes, id)
    return
  }
  if (!selectedNodeSet.value.has(id)) {
    store.clearSelection()
    store.selectedNodes = [id]
  }
  store.revealInspector()
  startMove(event)
}

function onTextDown(id: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  if (event.shiftKey) {
    store.selectedTexts = toggle(store.selectedTexts, id)
    return
  }
  if (!selectedTextSet.value.has(id)) {
    store.clearSelection()
    store.selectedTexts = [id]
  }
  store.revealInspector()
  startMove(event)
}

/** Sélectionne un lien ; faux si Maj n'a fait que l'ajouter ou le retirer. */
function selectLink(id: string, event: PointerEvent): boolean {
  if (event.shiftKey) {
    store.selectedLinks = toggle(store.selectedLinks, id)
    return false
  }
  if (!selectedLinkSet.value.has(id)) {
    store.clearSelection()
    store.selectedLinks = [id]
  }
  store.revealInspector()
  return true
}

function onLinkDown(id: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  if (!selectLink(id, event)) return
  // Plusieurs éléments sélectionnés, ou copie : le glisser déplace tout ; un lien seul : son segment.
  if (
    event.altKey ||
    store.selectedNodes.length > 0 ||
    store.selectedTexts.length > 0 ||
    store.selectedLinks.length > 1
  ) {
    startMove(event)
    return
  }
  const link = store.doc.links.find((candidate) => candidate.id === id)
  if (!link) return
  drag.value = {
    kind: 'link-segment',
    linkId: id,
    index: nearestSegmentIndex(link.points, toWorld(screenPoint(event))),
    original: link.points,
    preview: [...link.points]
  }
  capture(event)
}

function onLabelDown(id: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  if (!selectLink(id, event)) return
  const link = store.doc.links.find((candidate) => candidate.id === id)
  if (!link) return
  drag.value = {
    kind: 'label',
    linkId: id,
    original: { at: link.labelAt, side: link.labelSide },
    at: link.labelAt,
    side: link.labelSide
  }
  capture(event)
}

function onVertexDown(linkId: string, index: number, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  const link = store.doc.links.find((candidate) => candidate.id === linkId)
  if (!link) return
  drag.value = {
    kind: 'link-vertex',
    linkId,
    index,
    original: link.points,
    preview: [...link.points]
  }
  capture(event)
}

function onNodeHandleDown(nodeId: string, handleId: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  const node = store.doc.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return
  const box: Box = { x: node.x, y: node.y, w: node.w, h: node.h }
  drag.value = { kind: 'node-handle', id: nodeId, handleId, original: box, preview: box }
  capture(event)
}

function onTextHandleDown(textId: string, handleId: string, event: PointerEvent): void {
  if (!selectTool(event)) return
  event.stopPropagation()
  const text = store.doc.texts.find((candidate) => candidate.id === textId)
  if (!text) return
  const box: Box = { x: text.x, y: text.y, w: text.w, h: text.h }
  drag.value = { kind: 'text-handle', id: textId, handleId, original: box, preview: box }
  capture(event)
}

/**
 * Ctrl+appui en mode sélection, avant tout autre geste : glisser trace un lien depuis l'accroche
 * saisie, relâcher le pose ; un simple Ctrl+clic sélectionne le nœud.
 */
function onGrabDown(event: PointerEvent): void {
  if (event.button !== 0 || !event.ctrlKey || store.tool !== 'select' || store.panKeyHeld) return
  const anchor = anchorGrab.value
  if (!anchor) return
  // Ni le nœud, ni le lien, ni le canevas ne voient cet appui.
  event.stopImmediatePropagation()
  drag.value = {
    kind: 'anchor-link',
    nodeId: anchor.nodeId,
    origin: anchor.point,
    downX: event.clientX,
    downY: event.clientY,
    moved: false
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

  if (store.tool === 'link') {
    const snap = linkSnap(world)
    const current = store.drawing
    if (!current) {
      store.beginLink(snap.point)
      return
    }
    const last = current.points.at(-1)
    if (!last) return
    store.appendLinkPoints(routeLAuto(last, snap.point, store.shiftHeld).slice(1))
    // Arriver sur un point d'accroche termine le lien.
    if (snap.anchored) store.finishLink()
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
    case 'node-handle': {
      const node = store.doc.nodes.find((candidate) => candidate.id === current.id)
      if (node) current.preview = resizeNodeBox(node, current.handleId, snapGrid(world))
      break
    }
    case 'text-handle':
      current.preview = resizeBox(current.original, current.handleId, snapGrid(world))
      break
    case 'link-segment': {
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
    case 'link-vertex': {
      // Une extrémité qu'on déplace s'accroche au point d'accroche proche, comme au tracé.
      const end = current.index === 0 || current.index === current.original.length - 1
      const target = end ? linkSnap(world).point : snapGrid(world)
      current.preview = dragVertex(current.original, current.index, target)
      break
    }
    case 'anchor-link':
      if (Math.hypot(event.clientX - current.downX, event.clientY - current.downY) > DRAG_PX) {
        current.moved = true
      }
      break
    case 'label': {
      // L'étiquette suit le pointeur le long du lien et passe de l'autre côté quand il traverse le trait.
      const link = store.doc.links.find((candidate) => candidate.id === current.linkId)
      if (!link) break
      const nearest = nearestOnPath(link.points, world)
      current.at = nearest.at
      current.side = nearest.side
      break
    }
  }
}

function samePoints(a: readonly GridPoint[], b: readonly GridPoint[]): boolean {
  return (
    a.length === b.length && a.every((point, i) => b[i]?.[0] === point[0] && b[i]?.[1] === point[1])
  )
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** Texte entre deux coins ; deux clics au même point donnent la boîte par défaut. */
function commitTextBox(start: GridPoint, end: GridPoint): void {
  const [x1, y1] = start
  const [x2, y2] = end
  if (x1 === x2 && y1 === y2) store.addText(x1, y1)
  else {
    store.addTextBox({
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
  switch (current.kind) {
    case 'move':
      if (current.duplicate) store.duplicateSelectionAt(current.dx, current.dy)
      else store.moveSelection(current.dx, current.dy)
      break
    case 'band': {
      const rect = normalizeRect(current.start, current.current)
      if (rect.width <= 0.05 && rect.height <= 0.05) break
      const nodes = store.doc.nodes
        .filter((node) => rectsIntersect(nodeBounds(node), rect))
        .map((node) => node.id)
      const links = store.doc.links
        .filter((link) => wireIntersectsRect(link.points, rect))
        .map((link) => link.id)
      const found = store.doc.texts
        .filter((text) => rectsIntersect(textLabelBounds(text), rect))
        .map((text) => text.id)
      const merge = (before: string[], added: string[]): string[] =>
        current.additive ? [...new Set([...before, ...added])] : added
      store.selectedNodes = merge(store.selectedNodes, nodes)
      store.selectedLinks = merge(store.selectedLinks, links)
      store.selectedTexts = merge(store.selectedTexts, found)
      if (store.hasSelection) store.revealInspector()
      break
    }
    case 'node-handle':
      if (!sameBox(current.original, current.preview)) store.setNodeBox(current.id, current.preview)
      break
    case 'text-handle':
      if (!sameBox(current.original, current.preview)) store.setTextBox(current.id, current.preview)
      break
    case 'link-segment':
    case 'link-vertex':
      if (!samePoints(current.original, current.preview)) {
        store.setLinkPoints(current.linkId, current.preview)
      }
      break
    case 'anchor-link':
      if (current.moved) {
        // Relâché sur l'accroche de départ, le lien n'a qu'un point : `addLink` le refuse.
        const snap = linkSnap(toWorld(screenPoint(event)))
        store.addLink(routeLAuto(current.origin, snap.point, store.shiftHeld))
      } else {
        store.clearSelection()
        store.selectedNodes = [current.nodeId]
        store.revealInspector()
      }
      break
    case 'label':
      if (current.at !== current.original.at || current.side !== current.original.side) {
        store.setLinkLabelPlacement(current.linkId, current.at, current.side)
      }
      break
    case 'pan':
      break
  }
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId)
}

/** Pose le fantôme, puis arrête la pose : un clic = un nœud, sélectionné, prêt à recevoir son texte. */
function placeGhost(): void {
  const current = ghost.value
  if (!current) return
  const id = store.addNode(current.shape, current.x, current.y)
  store.stopPlacing()
  openEditor(id)
}

/** Glisser-déposer depuis la bibliothèque : le fantôme suit le pointeur. */
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

function onDoubleClick(): void {
  if (store.tool === 'link') store.finishLink()
}

function onNodeDoubleClick(id: string, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  openEditor(id)
}

function onLinkDoubleClick(id: string, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  emit('editLink', id)
}

function onTextDoubleClick(id: string, event: MouseEvent): void {
  if (store.tool !== 'select') return
  event.stopPropagation()
  emit('editText', id)
}

/**
 * Clic droit : termine le lien en cours ou arrête la pose ; sinon l'élément visé entre dans la
 * sélection (s'il n'y est pas déjà) et le menu contextuel s'ouvre.
 */
function onContextMenu(event: MouseEvent, target: DiagramMenuTarget): void {
  event.preventDefault()
  event.stopPropagation()
  if (drag.value) {
    drag.value = null
    return
  }
  if (store.tool === 'link' && store.drawing) {
    store.finishLink()
    return
  }
  if (store.tool === 'place') {
    store.stopPlacing()
    return
  }
  if (target.kind === 'node' && !selectedNodeSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedNodes = [target.id]
  } else if (target.kind === 'link' && !selectedLinkSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedLinks = [target.id]
  } else if (target.kind === 'text' && !selectedTextSet.value.has(target.id)) {
    store.clearSelection()
    store.selectedTexts = [target.id]
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

defineExpose({ cancel, openEditor })

const hoverText = computed(() =>
  hover.value ? `x ${Math.round(hover.value.x)}   y ${Math.round(hover.value.y)}` : ''
)

const cursorClass = computed(() => {
  if (store.panKeyHeld || drag.value?.kind === 'pan') return 'panning'
  if (store.tool === 'place') return 'placing'
  if (store.tool === 'text') return 'texting'
  // Ctrl sur une accroche saisissable : le curseur annonce le lien.
  return store.tool === 'link' || drag.value?.kind === 'anchor-link' || anchorGrab.value
    ? 'linking'
    : ''
})
</script>

<template>
  <div class="diagram-wrap">
    <div ref="host" class="canvas-area">
      <svg
        ref="svg"
        class="diagram"
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
          <g class="link-selections">
            <template v-for="item in renderedLinks" :key="item.link.id">
              <path v-if="item.selected" :d="item.reach" :stroke-width="lineWidth + 6 / cell" />
            </template>
          </g>

          <g class="links">
            <template v-for="item in renderedLinks" :key="item.link.id">
              <path
                class="link"
                :d="item.d"
                :stroke="screenColor(item.link.color)"
                :stroke-width="lineWidth"
                :stroke-dasharray="item.dash"
              />
              <polygon
                v-for="(head, h) in item.heads"
                :key="`head${h}`"
                class="link-head"
                :points="head"
                :fill="screenColor(item.link.color)"
                :stroke="screenColor(item.link.color)"
                :stroke-width="lineWidth * 0.5"
              />
              <path
                class="link-hit"
                :d="item.reach"
                :stroke-width="hitWidth"
                @pointerdown="onLinkDown(item.link.id, $event)"
                @dblclick="onLinkDoubleClick(item.link.id, $event)"
                @contextmenu="onContextMenu($event, { kind: 'link', id: item.link.id })"
              />
            </template>
          </g>

          <g
            v-for="node in shown.nodes"
            :key="node.id"
            class="node"
            @pointerdown="onNodeDown(node.id, $event)"
            @dblclick="onNodeDoubleClick(node.id, $event)"
            @contextmenu="onContextMenu($event, { kind: 'node', id: node.id })"
          >
            <DiagramNodeGraphic :node="node" :look="look" />
            <rect class="hit" v-bind="hitRect(node)" fill="transparent" />
          </g>

          <g class="link-labels">
            <template v-for="item in renderedLinks" :key="item.link.id">
              <g
                v-if="item.label && item.labelBox"
                class="link-label"
                @pointerdown="onLabelDown(item.link.id, $event)"
                @dblclick="onLinkDoubleClick(item.link.id, $event)"
                @contextmenu="onContextMenu($event, { kind: 'link', id: item.link.id })"
              >
                <rect
                  class="label-back"
                  :class="{ filled: item.link.labelBackground }"
                  :x="item.labelBox.x - 0.2"
                  :y="item.labelBox.y"
                  :width="item.labelBox.w + 0.4"
                  :height="item.labelBox.h"
                />
                <text
                  :text-anchor="item.label.anchor"
                  :font-size="look.labelSize / look.cellPx"
                  :font-family="fontFamily"
                  :fill="screenColor(item.link.color)"
                >
                  <tspan
                    v-for="(line, l) in item.label.lines"
                    :key="l"
                    :x="item.label.x"
                    :y="line.y"
                  >
                    {{ line.text }}
                  </tspan>
                </text>
              </g>
            </template>
          </g>

          <g class="texts">
            <g
              v-for="entry in texts"
              :key="entry.text.id"
              class="text-label"
              @pointerdown="onTextDown(entry.text.id, $event)"
              @dblclick="onTextDoubleClick(entry.text.id, $event)"
              @contextmenu="onContextMenu($event, { kind: 'text', id: entry.text.id })"
            >
              <rect
                v-if="entry.text.background"
                class="label-back filled"
                :x="entry.box.x"
                :y="entry.box.y"
                :width="entry.box.w"
                :height="entry.box.h"
              />
              <text
                :transform="entry.transform"
                :font-size="entry.fontCells"
                :font-family="fontFamily"
                :text-anchor="entry.text.anchor"
                :fill="screenColor(entry.text.color)"
                v-bind="textEmphasisAttrs(entry.text)"
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
                :x="entry.box.x - 0.3"
                :y="entry.box.y - 0.3"
                :width="entry.box.w + 0.6"
                :height="entry.box.h + 0.6"
                vector-effect="non-scaling-stroke"
              />
            </g>
          </g>

          <circle
            v-if="anchorGrab"
            class="anchor-grab"
            :cx="anchorGrab.point[0]"
            :cy="anchorGrab.point[1]"
            :r="anchorReach"
            vector-effect="non-scaling-stroke"
          />

          <rect
            v-for="box in nodeBoxes"
            :key="box.id"
            class="selection"
            :x="box.x - 0.3"
            :y="box.y - 0.3"
            :width="box.width + 0.6"
            :height="box.height + 0.6"
            vector-effect="non-scaling-stroke"
          />

          <g class="edit-marks">
            <circle
              v-for="handle in vertexHandles"
              :key="handle.key"
              class="vertex-handle"
              :cx="handle.x"
              :cy="handle.y"
              :r="4.5 / cell"
              vector-effect="non-scaling-stroke"
              @pointerdown="soleLink && onVertexDown(soleLink.id, handle.index, $event)"
              @contextmenu="soleLink && onContextMenu($event, { kind: 'link', id: soleLink.id })"
            />
            <rect
              v-for="handle in soleNodeHandles"
              :key="`node:${handle.id}`"
              class="box-handle"
              :style="{ cursor: handleCursor(handle.id) }"
              :x="handle.x - 4 / cell"
              :y="handle.y - 4 / cell"
              :width="8 / cell"
              :height="8 / cell"
              vector-effect="non-scaling-stroke"
              @pointerdown="onNodeHandleDown(handle.nodeId, handle.id, $event)"
            />
            <rect
              v-for="handle in textHandles"
              :key="`text:${handle.id}`"
              class="box-handle"
              :style="{ cursor: handleCursor(handle.id) }"
              :x="handle.x - 4 / cell"
              :y="handle.y - 4 / cell"
              :width="8 / cell"
              :height="8 / cell"
              vector-effect="non-scaling-stroke"
              @pointerdown="onTextHandleDown(handle.textId, handle.id, $event)"
            />
          </g>

          <g v-if="ghostCopies" class="ghost" :transform="ghostCopies.transform">
            <path
              v-for="link in ghostCopies.links"
              :key="link.id"
              class="ghost-link"
              :d="link.d"
              :stroke="screenColor(link.color)"
              :stroke-width="lineWidth"
            />
            <DiagramNodeGraphic
              v-for="node in ghostCopies.nodes"
              :key="node.id"
              :node="node"
              :look="look"
            />
            <rect
              v-for="text in ghostCopies.texts"
              :key="text.id"
              class="ghost-box"
              :x="text.x"
              :y="text.y"
              :width="text.w"
              :height="text.h"
              vector-effect="non-scaling-stroke"
            />
          </g>

          <g v-if="ghost" class="ghost">
            <DiagramNodeGraphic :node="ghost" :look="look" />
          </g>

          <g v-if="drawingPreview" class="drawing">
            <path class="pending" :d="drawingPreview.pending" :stroke-width="lineWidth" />
            <path
              class="committed"
              :d="drawingPreview.committed"
              :stroke="screenColor(store.linkColor)"
              :stroke-width="lineWidth"
            />
            <circle
              v-if="drawingPreview.end"
              class="end"
              :class="{ anchored: drawingPreview.anchored }"
              :cx="drawingPreview.end[0]"
              :cy="drawingPreview.end[1]"
              :r="5 / cell"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <circle
            v-if="linkStartTarget"
            class="link-start"
            :class="{ anchored: linkStartTarget.anchored }"
            :cx="linkStartTarget.point[0]"
            :cy="linkStartTarget.point[1]"
            :r="5 / cell"
            vector-effect="non-scaling-stroke"
          />

          <rect v-if="band" class="band" v-bind="band" vector-effect="non-scaling-stroke" />
          <rect v-if="textBox" class="band" v-bind="textBox" vector-effect="non-scaling-stroke" />
        </g>
      </svg>

      <div
        v-if="editing && editorStyle"
        ref="editorBox"
        class="node-editor"
        :style="editorStyle"
        @pointerdown.stop
        @keydown="onEditorKey"
        @focusout="onEditorFocusOut"
      >
        <textarea
          ref="titleInput"
          v-model="editing.title"
          class="title"
          :rows="titleRows"
          placeholder="Titre"
          title="Entrée valide, Maj+Entrée va à la ligne, Échap abandonne"
        />
        <input v-model="editing.subtitle" type="text" class="subtitle" placeholder="Sous-titre" />
      </div>
    </div>
    <footer class="canvas-status">
      <span class="coords">{{ hoverText }}</span>
      <span class="zoom">{{ Math.round(view.zoom * 100) }} %</span>
      <span class="message">{{ store.status }}</span>
    </footer>
  </div>
</template>

<style scoped>
.diagram-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.canvas-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.diagram {
  display: block;
  touch-action: none;
  user-select: none;
  cursor: default;
}

.diagram.placing {
  cursor: copy;
}

.diagram.linking {
  cursor: crosshair;
}

.diagram.texting {
  cursor: text;
}

/* Lien en cours ou accroche saisissable (Ctrl) : la croix l'emporte sur le curseur des éléments. */
.diagram.linking .node,
.diagram.linking .link-hit,
.diagram.linking .link-label,
.diagram.linking .text-label {
  cursor: crosshair;
}

.diagram.panning {
  cursor: grab;
}

.grid line {
  stroke: var(--grid-line);
}

.grid line.major {
  stroke: var(--grid-major);
}

.link {
  fill: none;
  stroke-linejoin: round;
  pointer-events: none;
}

/* Pointe pleine : un filet de trait de sa couleur en adoucit les angles. */
.link-head {
  stroke-linejoin: round;
  pointer-events: none;
}

.link-hit {
  fill: none;
  stroke: transparent;
  pointer-events: stroke;
  cursor: pointer;
}

.link-selections {
  opacity: 0.35;
  pointer-events: none;
}

.link-selections path {
  fill: none;
  stroke: #1f6feb;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.node,
.text-label,
.link-label {
  cursor: move;
}

.link-label text,
.text-label text {
  pointer-events: none;
}

/* Boîte d'une étiquette : toujours là pour la saisir, peinte en couleur du papier quand
   l'étiquette a un fond (elle masque alors ce qui passe derrière). */
.label-back {
  fill: transparent;
}

.label-back.filled {
  fill: var(--paper);
}

/* Point d'accroche qu'un Ctrl+glisser saisirait : un lien partira de lui. */
.anchor-grab {
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
}

.ghost {
  opacity: 0.55;
  pointer-events: none;
}

.ghost-link {
  fill: none;
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
.link-start {
  fill: rgba(31, 111, 235, 0.15);
  stroke: #1f6feb;
  stroke-width: 1.5;
  pointer-events: none;
}

.drawing .end.anchored,
.link-start.anchored {
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

/* Éditeur de texte posé sur le nœud : titre puis sous-titre, centrés comme ils seront dessinés. */
.node-editor {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  box-sizing: border-box;
  background: var(--surface);
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

.node-editor textarea,
.node-editor input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  text-align: center;
  color: var(--text);
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  resize: none;
}

.node-editor .title {
  font-weight: 600;
}

.node-editor .subtitle {
  font-size: 12px;
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
