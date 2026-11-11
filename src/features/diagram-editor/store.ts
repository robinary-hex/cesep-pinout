import { castDraft, current as snapshot, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createEmptyDiagram,
  createNode,
  DEFAULT_VIEW,
  defaultLabelSide,
  diagramAnchors,
  diagramBounds,
  fittedNodeSize,
  fittingView,
  isEmptyDiagram,
  linksFollowingNodes,
  nextNumberedId,
  NODE_SPECS,
  nodeBounds,
  nodeBoxFollowingText,
  nodeBoxForText,
  normalizePoints,
  pannedView,
  sameDiagramStyle,
  simplifyPoints,
  textLabelBounds,
  translatePoints,
  turnedTextBox,
  unionRects,
  wireBounds,
  insertVertex,
  nearestWirePoint,
  regroupedCopies,
  removeVertex,
  restackedIds,
  touchesNote,
  wireGeometryProblem,
  withGroup,
  zoomedView,
  type Box,
  type Diagram,
  type DiagramLink,
  type DiagramNode,
  type DiagramStyle,
  type GridPoint,
  type GridRect,
  type LinkDash,
  type LinkLabelSide,
  type NodeFill,
  type LocalPoint,
  type NodeShape,
  type NodeTextStyle,
  type StackMove,
  type TextAnchor,
  type TextLabel,
  type ViewState
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { readDiagram } from '@/io/diagramFiles'
import { samePath } from '@/io/paths'
import { nodeTextMeasurer } from '@/render/textMeasure'
import { useGroups } from '@/state/groups'
import { useInspectorPanel } from '@/state/inspector'
import { useDocumentTabs } from '@/state/tabs'

export type DiagramTool = 'select' | 'place' | 'link' | 'text'

export interface DiagramClipboard {
  nodes: DiagramNode[]
  links: DiagramLink[]
  texts: TextLabel[]
}

/** Lien en cours de tracé : les sommets déjà validés. */
export interface LinkDrawing {
  points: GridPoint[]
}

/** Onglet affiché dans la barre d'application. */
export interface DiagramTabInfo {
  id: number
  name: string
  filePath: string | null
  dirty: boolean
}

/** Diagramme modifié, pour la copie de secours ; `key` est l'identifiant de son onglet. */
export interface DirtyDiagram {
  key: number
  diagram: Diagram
  originalPath: string | null
}

/** État d'édition qu'un onglet garde quand il n'est pas affiché. */
interface TabEditing {
  view: ViewState
  selectedNodes: string[]
  selectedLinks: string[]
  selectedTexts: string[]
}

export type NodeStyle = Pick<DiagramNode, 'color' | 'fill'>
export type LinkStyle = Pick<
  DiagramLink,
  'color' | 'dash' | 'startArrow' | 'endArrow' | 'labelBackground'
>
export type TextStyle = Pick<
  TextLabel,
  'bold' | 'italic' | 'underline' | 'strike' | 'vertical' | 'color' | 'background'
>

/** Couleurs personnalisées gardées par diagramme, les plus récentes d'abord. */
const MAX_CUSTOM_COLORS = 8
const DEFAULT_COLOR = '#000000'

/**
 * Diagrammes ouverts, un par onglet, et celui en cours d'édition. Le diagramme est immuable ;
 * chaque commande passe par l'historique de son onglet (`useDocumentTabs`). Le store porte aussi
 * la vue, l'outil courant et le style des prochains éléments, pour que la barre d'outils, le
 * clavier et le canevas agissent sur la même chose. Le presse-papiers est commun aux onglets.
 */
export const useDiagramStore = defineStore('diagram', () => {
  const library = useLibraryStore()

  /** Un nouveau diagramme part du style général de l'application. */
  function blankDiagram(): Diagram {
    return createEmptyDiagram('Nouveau diagramme', library.diagramDefaults.style)
  }

  const selectedNodes = ref<string[]>([])
  const selectedLinks = ref<string[]>([])
  const selectedTexts = ref<string[]>([])
  const tool = ref<DiagramTool>('select')
  /** Forme en cours de pose (outil `place`). */
  const placement = ref<NodeShape | null>(null)
  const drawing = shallowRef<LinkDrawing | null>(null)
  // Style des prochains éléments : celui du dernier nœud ou lien stylé.
  const nodeColor = ref(library.diagramDefaults.nodeColor)
  const nodeFill = ref<NodeFill>(library.diagramDefaults.nodeFill)
  const linkColor = ref(library.diagramDefaults.linkColor)
  /** Style en cours d'édition dans le profil général : affiché à la place de celui du diagramme. */
  const stylePreview = shallowRef<DiagramStyle | null>(null)
  const linkDash = ref<LinkDash>('solid')
  const linkStartArrow = ref(false)
  const linkEndArrow = ref(true)
  const clipboard = shallowRef<DiagramClipboard>({ nodes: [], links: [], texts: [] })
  const view = ref<ViewState>({ ...DEFAULT_VIEW })
  const viewport = ref({ width: 1200, height: 800 })
  const panKeyHeld = ref(false)
  const shiftHeld = ref(false)
  /** Ctrl enfoncée : en sélection, le canevas montre l'accroche qu'un Ctrl+glisser saisirait. */
  const ctrlHeld = ref(false)
  const status = ref('')

  /** Rien à enregistrer si le diagramme est intact, ou jamais enregistré et vide. */
  function needsSaving(diagram: Diagram, saved: Diagram | null, path: string | null): boolean {
    return diagram !== saved && !(path === null && isEmptyDiagram(diagram))
  }

  const base = useDocumentTabs<Diagram, TabEditing>({
    blank: blankDiagram,
    needsSaving,
    freshEditing: () => ({
      view: { ...DEFAULT_VIEW },
      selectedNodes: [],
      selectedLinks: [],
      selectedTexts: []
    }),
    capture: () => ({
      view: view.value,
      selectedNodes: selectedNodes.value,
      selectedLinks: selectedLinks.value,
      selectedTexts: selectedTexts.value
    }),
    restore: (editing) => {
      view.value = editing.view
      selectedNodes.value = editing.selectedNodes
      selectedLinks.value = editing.selectedLinks
      selectedTexts.value = editing.selectedTexts
      // Pose et tracé appartenaient au diagramme qu'on quitte.
      placement.value = null
      drawing.value = null
      tool.value = 'select'
      stylePreview.value = null
    },
    // Un lien en cours de tracé est gardé s'il a deux sommets, abandonné sinon.
    beforeLeave: () => {
      stopLinkDrawing()
    },
    afterSync: pruneSelection
  })
  const { doc, activeTabId, dirty, pristine, anyDirty, undoLabel, redoLabel, cycleTab, moveTab } =
    base
  const apply = base.apply
  const filePath = base.path
  const tabs = computed<DiagramTabInfo[]>(() =>
    base.tabs.value.map((tab) => ({
      id: tab.id,
      name: tab.name,
      filePath: tab.path,
      dirty: tab.dirty
    }))
  )

  /** Style effectif pour l'affichage : l'aperçu du profil général, sinon celui du diagramme. */
  const style = computed<DiagramStyle>(() => stylePreview.value ?? doc.value.style)
  /** Ce diagramme a-t-il encore le style général de l'application ? */
  const followsGeneralStyle = computed(() =>
    sameDiagramStyle(doc.value.style, library.diagramDefaults.style)
  )
  const cellPx = computed(() => style.value.cellPx * view.value.zoom)
  /** Points d'accroche de tous les nœuds : là où un lien peut partir ou arriver. */
  const anchors = computed(() => diagramAnchors(doc.value.nodes))
  /** Couleurs proposées : la palette de l'application, puis celles du diagramme. */
  const colorChoices = computed(() => [
    ...library.palette.map((color) => ({ hex: color.hex, name: color.name })),
    ...doc.value.customColors.map((hex) => ({ hex, name: hex }))
  ])
  const hasSelection = computed(
    () =>
      selectedNodes.value.length > 0 ||
      selectedLinks.value.length > 0 ||
      selectedTexts.value.length > 0
  )
  // Groupes : nœuds, liens et textes qu'on sélectionne et déplace d'un bloc.
  const grouping = useGroups({
    kinds: {
      node: { elements: () => doc.value.nodes, selected: selectedNodes },
      link: { elements: () => doc.value.links, selected: selectedLinks },
      text: { elements: () => doc.value.texts, selected: selectedTexts }
    },
    write: (label, change) => {
      apply(label, (draft) => {
        const lists = { node: draft.nodes, link: draft.links, text: draft.texts }
        for (const kind of ['node', 'link', 'text'] as const) {
          for (const element of lists[kind]) {
            const next = change(kind, element)
            if (next === null) continue
            if (next === undefined) delete element.group
            else element.group = next
          }
        }
      })
    }
  })
  const { groups, hasGroups, canGroup, canUngroup, syncGroupSelection, expandSelectionToGroups } =
    grouping

  /** Ctrl+G : la sélection devient un groupe. */
  function groupSelection(): void {
    if (grouping.groupSelection())
      status.value = 'Éléments groupés : ils se sélectionnent d’un bloc.'
  }

  /** Ctrl+Maj+G : les groupes que touche la sélection sont défaits. */
  function ungroupSelection(): void {
    if (grouping.ungroupSelection()) status.value = 'Groupe défait.'
  }

  /** Contour des groupes visible. Gardé dans les paramètres, d'un lancement à l'autre. */
  const showGroups = computed({
    get: () => library.showGroups,
    set: (value: boolean) => library.setViewOption('showGroups', value)
  })

  /** Panneau de propriétés à droite (`useInspectorPanel`) : replié par défaut, touche I. */
  const inspector = useInspectorPanel({
    hasSelection: () => hasSelection.value,
    autoOpen: () => library.autoOpenInspector
  })
  const inspectorOpen = inspector.open
  const inspectorFloating = inspector.floating
  /** La palette agit sur les liens quand on en trace ou qu'on n'a sélectionné qu'eux. */
  const paletteOnLinks = computed(
    () =>
      tool.value === 'link' ||
      (selectedLinks.value.length > 0 &&
        selectedNodes.value.length === 0 &&
        selectedTexts.value.length === 0)
  )
  const currentColor = computed(() => (paletteOnLinks.value ? linkColor.value : nodeColor.value))

  /** Après chaque changement du diagramme : la sélection ne garde que ce qui existe encore. */
  function pruneSelection(): void {
    const prune = (selected: typeof selectedNodes, items: readonly { id: string }[]): void => {
      const ids = new Set(items.map((entry) => entry.id))
      if (selected.value.some((id) => !ids.has(id))) {
        selected.value = selected.value.filter((id) => ids.has(id))
      }
    }
    prune(selectedNodes, doc.value.nodes)
    prune(selectedLinks, doc.value.links)
    prune(selectedTexts, doc.value.texts)
  }

  /**
   * Commande qui déplace, redimensionne ou change de forme des nœuds : les extrémités de lien
   * posées sur leurs points d'accroche suivent ; les liens de `translatedLinks` sont déplacés en
   * bloc et gardent leurs extrémités posées sur des nœuds restés immobiles.
   */
  function applyWithElasticLinks(
    label: string,
    recipe: (draft: Draft<Diagram>) => void,
    translatedLinks: ReadonlyMap<string, GridPoint> = new Map()
  ): boolean {
    const nodesBefore = doc.value.nodes
    const linksBefore = doc.value.links
    return apply(label, (draft) => {
      recipe(draft)
      const now = snapshot(draft) as Diagram
      const followed = linksFollowingNodes(linksBefore, nodesBefore, now.nodes, translatedLinks)
      if (followed.some((link, index) => link !== linksBefore[index])) {
        draft.links = castDraft(followed)
      }
    })
  }

  function undo(): void {
    const label = base.undo()
    if (label !== null) status.value = `Annulé : ${label}`
  }

  function redo(): void {
    const label = base.redo()
    if (label !== null) status.value = `Rétabli : ${label}`
  }

  /**
   * Un clic vient de sélectionner un élément : le panneau de propriétés se montre si les
   * paramètres le demandent, le temps de la sélection.
   */
  function revealInspector(): void {
    inspector.reveal()
  }

  function clearSelection(): void {
    selectedNodes.value = []
    selectedLinks.value = []
    selectedTexts.value = []
  }

  // Onglets et fichier

  function activateTab(id: number): void {
    if (base.activateTab(id)) status.value = ''
  }

  function newDiagram(): void {
    base.showBlank()
    status.value = ''
  }

  function openDiagram(diagram: Diagram, path: string): void {
    base.showInTab(diagram, diagram, path)
    status.value = ''
  }

  /**
   * Ouvre un fichier de diagramme par son chemin ; vrai si l'ouverture a réussi. Un fichier déjà
   * ouvert n'est pas relu : son onglet revient devant.
   */
  async function openPath(path: string): Promise<boolean> {
    const already = tabs.value.find((tab) => tab.filePath !== null && samePath(tab.filePath, path))
    if (already) {
      activateTab(already.id)
      status.value = `Déjà ouvert : ${path}`
      return true
    }
    try {
      const diagram = await readDiagram(path)
      openDiagram(diagram, path)
      fitToContent()
      status.value = `Ouvert : ${path}`
      await library.addRecentFile(path)
      return true
    } catch (error) {
      status.value = `Ouverture impossible : ${error instanceof Error ? error.message : String(error)}`
      if (library.recentFiles.includes(path)) await library.removeRecentFile(path)
      return false
    }
  }

  /** Reprend une copie de secours : le diagramme s'ouvre dans un onglet, comme non enregistré. */
  function restoreDiagram(diagram: Diagram, originalPath: string | null): void {
    base.showInTab(diagram, null, originalPath)
    fitToContent()
    status.value = 'Copie de secours récupérée : pense à enregistrer.'
  }

  function markSaved(path: string): void {
    base.markSaved(path)
  }

  /** Ferme un onglet sans rien demander ; la question se pose avant, dans `closeDiagramTabAsking`. */
  function closeTab(id: number): boolean {
    const wasActive = id === activeTabId.value
    const closed = base.closeTab(id)
    if (closed && wasActive) status.value = ''
    return closed
  }

  function dirtyDocuments(): DirtyDiagram[] {
    return base
      .unsavedDocuments()
      .map(({ key, doc: diagram, path }) => ({ key, diagram, originalPath: path }))
  }

  function setName(name: string): void {
    apply('Renommer le diagramme', (draft) => {
      draft.name = name
    })
  }

  function setStyle(patch: Partial<DiagramStyle>): void {
    apply('Changer le style du diagramme', (draft) => {
      Object.assign(draft.style, patch)
    })
  }

  /** Aligne ce diagramme sur le style général de l'application. */
  function adoptGeneralStyle(): void {
    setStyle({ ...library.diagramDefaults.style })
  }

  /** Couleur et fond des prochains éléments : ceux du style général. */
  function syncDefaults(): void {
    nodeColor.value = library.diagramDefaults.nodeColor
    nodeFill.value = library.diagramDefaults.nodeFill
    linkColor.value = library.diagramDefaults.linkColor
  }

  /**
   * Le style général vient de passer de `previous` à `next` : les diagrammes ouverts qui
   * suivaient l'ancien prennent le nouveau (une commande par onglet, annulable) ; ceux qui
   * avaient leur propre style le gardent. Un diagramme vierge repart du nouveau style.
   */
  function followGeneralStyle(previous: DiagramStyle, next: DiagramStyle): void {
    if (sameDiagramStyle(previous, next)) return
    const label = 'Changer le style du diagramme'
    const set = (draft: Draft<Diagram>): void => {
      draft.style = { ...next }
    }
    base.updateStashedTabs((tab) => {
      const current = tab.history.value
      if (!sameDiagramStyle(current.style, previous)) return tab
      if (tab.path === null && current === tab.savedDoc) {
        const blank = createEmptyDiagram(current.name, next)
        tab.history.reset(blank)
        return { ...tab, savedDoc: blank }
      }
      tab.history.apply(label, set)
      return { ...tab }
    })
    if (!sameDiagramStyle(doc.value.style, previous)) return
    if (pristine.value) {
      const blank = createEmptyDiagram(doc.value.name, next)
      base.reset(blank, blank)
    } else {
      apply(label, set)
    }
  }

  // Outils

  function selectTool(): void {
    tool.value = 'select'
    placement.value = null
    stopLinkDrawing()
  }

  function startPlacing(shape: NodeShape): void {
    stopLinkDrawing()
    placement.value = shape
    tool.value = 'place'
    clearSelection()
    status.value = `Pose de « ${NODE_SPECS[shape].label} » : clic sur le diagramme pour poser, Échap pour arrêter.`
  }

  function stopPlacing(): void {
    placement.value = null
    if (tool.value === 'place') tool.value = 'select'
  }

  function startLinkTool(): void {
    tool.value = 'link'
    placement.value = null
    stopLinkDrawing()
    clearSelection()
    status.value =
      'Lien : clic sur le bord d’un nœud ou une intersection pour partir, clic pour chaque coude, Maj inverse le L, double-clic ou Entrée pour finir.'
  }

  function startTextTool(): void {
    tool.value = 'text'
    placement.value = null
    stopLinkDrawing()
    clearSelection()
    status.value = 'Texte : deux clics ou un glisser pour les deux coins de sa boîte.'
  }

  // Nœuds

  /** Pose un nœud dont (x, y) est le coin supérieur gauche ; il est sélectionné. */
  function addNode(shape: NodeShape, x: number, y: number): string {
    const id = nextNumberedId(
      'n',
      doc.value.nodes.map((node) => node.id)
    )
    const node: DiagramNode = {
      ...createNode(id, shape, x, y, style.value),
      color: nodeColor.value,
      fill: nodeFill.value
    }
    apply(`Poser « ${NODE_SPECS[shape].label} »`, (draft) => {
      draft.nodes.push(node)
    })
    clearSelection()
    selectedNodes.value = [id]
    return id
  }

  /** Pose la forme en cours, centrée sur le point donné ; null si aucune pose n'est en cours. */
  function placeAt(x: number, y: number): string | null {
    const shape = placement.value
    if (!shape) return null
    const size = NODE_SPECS[shape].defaultSize
    return addNode(shape, Math.round(x - size.w / 2), Math.round(y - size.h / 2))
  }

  /** Nouvelle boîte d'un nœud (poignées, panneau), ramenée à ce que sa forme permet. */
  function setNodeBox(id: string, box: Box): void {
    const node = doc.value.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    const size = fittedNodeSize(node.shape, box.w, box.h, node)
    applyWithElasticLinks('Redimensionner le nœud', (draft) => {
      const target = draft.nodes.find((candidate) => candidate.id === id)
      if (!target) return
      target.x = box.x
      target.y = box.y
      target.w = size.w
      target.h = size.h
    })
  }

  /**
   * Titre et sous-titre d'un nœud. Sa boîte suit le nouveau texte, dans la même commande : elle
   * grandit s'il déborde et rétrécit s'il raccourcit, comme si ce texte était le premier qu'on y
   * écrit ; une taille réglée à la main ne fait que grandir (`nodeBoxFollowingText`).
   */
  function setNodeText(id: string, patch: Partial<Pick<DiagramNode, 'title' | 'subtitle'>>): void {
    const node = doc.value.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    const box = nodeBoxFollowingText(
      node,
      { ...node, ...patch },
      style.value,
      nodeTextMeasurer(style.value.cellPx)
    )
    applyWithElasticLinks('Modifier le texte du nœud', (draft) => {
      const target = draft.nodes.find((candidate) => candidate.id === id)
      if (!target) return
      Object.assign(target, patch)
      if (box) Object.assign(target, box)
    })
  }

  /**
   * Style du texte de nœuds : police, gras, italique, souligné, barré, taille. Les boîtes suivent
   * leur texte comme quand on le modifie, dans la même commande.
   */
  function setNodesTextStyle(
    ids: readonly string[],
    label: string,
    patch: Partial<NodeTextStyle>
  ): void {
    if (ids.length === 0) return
    const measure = nodeTextMeasurer(style.value.cellPx)
    const boxes = new Map<string, Box>()
    for (const node of doc.value.nodes) {
      if (!ids.includes(node.id)) continue
      const box = nodeBoxFollowingText(node, { ...node, ...patch }, style.value, measure)
      if (box) boxes.set(node.id, box)
    }
    applyWithElasticLinks(label, (draft) => {
      for (const node of draft.nodes) {
        if (!ids.includes(node.id)) continue
        Object.assign(node, patch, boxes.get(node.id) ?? {})
      }
    })
  }

  /** Ajuste la boîte d'un nœud à son texte, au plus près, en gardant son centre. */
  function fitNodeToText(id: string): void {
    const node = doc.value.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    const box = nodeBoxForText(node, style.value, nodeTextMeasurer(style.value.cellPx), false)
    if (!box) return
    applyWithElasticLinks('Ajuster le nœud à son texte', (draft) => {
      const target = draft.nodes.find((candidate) => candidate.id === id)
      if (target) Object.assign(target, box)
    })
  }

  /** Change la forme d'un nœud ; sa taille s'adapte au besoin, ses liens restent accrochés. */
  function setNodeShape(id: string, shape: NodeShape): void {
    const node = doc.value.nodes.find((candidate) => candidate.id === id)
    if (!node || node.shape === shape) return
    // D'une barre à une boîte (ou l'inverse), la taille repart de celle par défaut.
    const wasLine = NODE_SPECS[node.shape].line
    const isLine = NODE_SPECS[shape].line
    const size =
      wasLine !== isLine
        ? { ...NODE_SPECS[shape].defaultSize }
        : fittedNodeSize(shape, node.w, node.h, node)
    applyWithElasticLinks(`Changer en « ${NODE_SPECS[shape].label} »`, (draft) => {
      const target = draft.nodes.find((candidate) => candidate.id === id)
      if (!target) return
      target.shape = shape
      target.w = size.w
      target.h = size.h
    })
  }

  /** Tourne une barre d'un quart de tour autour de son milieu. */
  function turnBar(id: string): void {
    const node = doc.value.nodes.find((candidate) => candidate.id === id)
    if (!node || !NODE_SPECS[node.shape].line) return
    const length = Math.max(node.w, node.h)
    const shift = Math.trunc(length / 2)
    applyWithElasticLinks('Tourner la barre', (draft) => {
      const target = draft.nodes.find((candidate) => candidate.id === id)
      if (!target) return
      if (target.h === 0) {
        target.x += shift
        target.y -= shift
        target.w = 0
        target.h = length
      } else {
        target.x -= shift
        target.y += shift
        target.w = length
        target.h = 0
      }
    })
  }

  function setNodesStyle(ids: readonly string[], patch: Partial<NodeStyle>): void {
    if (ids.length === 0) return
    apply('Style du nœud', (draft) => {
      for (const node of draft.nodes) if (ids.includes(node.id)) Object.assign(node, patch)
    })
  }

  /** Ordre d'empilement des nœuds sélectionnés : avancer, reculer, premier plan, arrière-plan. */
  function reorderNodes(move: StackMove): void {
    const ids = new Set(selectedNodes.value)
    if (ids.size === 0) return
    const order = restackedIds(
      doc.value.nodes.map((node) => node.id),
      ids,
      move
    )
    const rank = new Map(order.map((id, index) => [id, index]))
    apply('Ordre des nœuds', (draft) => {
      draft.nodes.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    })
  }

  // Liens

  /** Crée un lien à partir de sommets bruts ; retourne son identifiant, ou null s'il est invalide. */
  function addLink(points: readonly GridPoint[]): string | null {
    const clean = simplifyPoints(points)
    if (clean.length < 2 || wireGeometryProblem(clean, true) !== null) return null
    const id = nextNumberedId(
      'l',
      doc.value.links.map((link) => link.id)
    )
    const link: DiagramLink = {
      id,
      points: clean,
      color: linkColor.value,
      // Un lien attaché à une note est son trait d'ancrage : en pointillés, sans changer le style
      // des prochains liens.
      dash: touchesNote(doc.value.nodes, clean) ? 'dashed' : linkDash.value,
      startArrow: linkStartArrow.value,
      endArrow: linkEndArrow.value,
      label: '',
      labelAt: 0.5,
      labelSide: 1,
      labelBackground: false
    }
    apply('Tracer un lien', (draft) => {
      draft.links.push(castDraft(link))
    })
    return id
  }

  function beginLink(point: GridPoint): void {
    drawing.value = { points: [point] }
  }

  function appendLinkPoints(points: readonly GridPoint[]): void {
    const current = drawing.value
    if (!current) return
    drawing.value = { points: normalizePoints([...current.points, ...points]) }
  }

  /** Retire le dernier sommet validé ; annule le tracé s'il n'en reste pas. */
  function popLinkVertex(): void {
    const current = drawing.value
    if (!current) return
    drawing.value = current.points.length <= 1 ? null : { points: current.points.slice(0, -1) }
  }

  function finishLink(): string | null {
    const current = drawing.value
    drawing.value = null
    if (!current || current.points.length < 2) return null
    return addLink(current.points)
  }

  /**
   * Arrête le tracé en cours (Échap, changement d'outil) : le lien est gardé dès qu'il a un départ
   * et une arrivée, abandonné s'il n'a qu'un point. Vrai s'il y avait un tracé.
   */
  function stopLinkDrawing(): boolean {
    const current = drawing.value
    if (!current) return false
    if (current.points.length >= 2) finishLink()
    else drawing.value = null
    return true
  }

  function setLinkPoints(id: string, points: readonly GridPoint[]): void {
    const clean = normalizePoints(points)
    if (clean.length < 2 || wireGeometryProblem(clean, true) !== null) return
    apply('Modifier le lien', (draft) => {
      const link = draft.links.find((candidate) => candidate.id === id)
      if (link) link.points = castDraft(clean)
    })
  }

  /**
   * Ctrl+clic sur un lien : un sommet de plus sur la partie droite visée, ou le coin visé en
   * moins s'il laisse un lien valide (ses voisins alignés). Vrai si le lien a changé.
   */
  function toggleLinkVertex(id: string, point: LocalPoint): boolean {
    const link = doc.value.links.find((candidate) => candidate.id === id)
    const spot = link ? nearestWirePoint(link.points, point) : null
    if (!link || !spot || spot.location.kind === 'end') return false
    const added = spot.location.kind === 'segment'
    const points = added
      ? insertVertex(link.points, spot.point)
      : removeVertex(link.points, spot.location.index)
    if (!points || wireGeometryProblem(points, true) !== null) {
      status.value = 'Ce coin ne se retire pas : ses deux voisins ne sont pas alignés.'
      return false
    }
    apply(added ? 'Ajouter un sommet' : 'Supprimer un sommet', (draft) => {
      const target = draft.links.find((candidate) => candidate.id === id)
      if (target) target.points = castDraft(points)
    })
    return true
  }

  function setLinksStyle(ids: readonly string[], patch: Partial<LinkStyle>): void {
    if (ids.length === 0) return
    apply('Style du lien', (draft) => {
      for (const link of draft.links) if (ids.includes(link.id)) Object.assign(link, patch)
    })
  }

  /**
   * Texte de l'étiquette d'un lien ; vide la retire. Une première étiquette se met au milieu du
   * lien, au-dessus d'un segment horizontal ou à droite d'un vertical.
   */
  function setLinkLabel(id: string, text: string): void {
    const link = doc.value.links.find((candidate) => candidate.id === id)
    if (!link) return
    const trimmed = text.trim()
    const first = link.label.length === 0 && trimmed.length > 0
    apply(trimmed.length > 0 ? 'Étiquette du lien' : 'Retirer l’étiquette du lien', (draft) => {
      const target = draft.links.find((candidate) => candidate.id === id)
      if (!target) return
      target.label = trimmed
      if (first) {
        target.labelAt = 0.5
        target.labelSide = defaultLabelSide(link.points, 0.5)
      }
    })
  }

  /**
   * Place de l'étiquette le long du lien : fraction de sa longueur (0 au départ, 1 à l'arrivée)
   * et côté du trait. Elle reste toujours à la même distance du trait.
   */
  function setLinkLabelPlacement(id: string, at: number, side: LinkLabelSide): void {
    apply('Déplacer l’étiquette du lien', (draft) => {
      const link = draft.links.find((candidate) => candidate.id === id)
      if (!link) return
      link.labelAt = Math.min(1, Math.max(0, at))
      link.labelSide = side
    })
  }

  /**
   * Inverse le sens d'un lien : son départ devient son arrivée. « Flèche au départ » et « Flèche
   * à l'arrivée » gardent leur réglage : la pointe qui était à un bout se retrouve donc à
   * l'autre, le lien de A vers B devient un lien de B vers A (décision du 11 novembre 2026).
   */
  function reverseLinks(ids: readonly string[]): void {
    if (ids.length === 0) return
    apply('Inverser le sens du lien', (draft) => {
      for (const link of draft.links) {
        if (!ids.includes(link.id)) continue
        link.points.reverse()
        // L'étiquette reste au même endroit du tracé.
        link.labelAt = 1 - link.labelAt
      }
    })
  }

  // Textes libres

  /** Texte « Texte » dans une boîte donnée, en cellules ; il est sélectionné. */
  function addTextBox(box: Box): string {
    const id = nextNumberedId(
      't',
      doc.value.texts.map((text) => text.id)
    )
    const size = style.value.labelSize
    apply('Ajouter un texte', (draft) => {
      draft.texts.push({
        id,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        anchor: 'middle',
        text: 'Texte',
        size,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        vertical: false,
        color: DEFAULT_COLOR,
        background: false
      })
    })
    clearSelection()
    selectedTexts.value = [id]
    return id
  }

  /** Boîte par défaut de 8 × 2 cellules dont le bord haut est centré sur le point. */
  function addText(x: number, y: number): string {
    return addTextBox({ x: x - 4, y, w: 8, h: 2 })
  }

  function updateText(id: string, label: string, mutate: (text: Draft<TextLabel>) => void): void {
    apply(label, (draft) => {
      const text = draft.texts.find((candidate) => candidate.id === id)
      if (text) mutate(text)
    })
  }

  function setTextContent(id: string, content: string): void {
    updateText(id, 'Modifier le texte', (text) => {
      text.text = content
    })
  }

  function setTextSize(id: string, size: number): void {
    updateText(id, 'Taille du texte', (text) => {
      text.size = size
    })
  }

  function setTextAnchor(id: string, anchor: TextAnchor): void {
    updateText(id, 'Alignement du texte', (text) => {
      text.anchor = anchor
    })
  }

  function setTextBox(id: string, box: Box): void {
    updateText(id, 'Cadre du texte', (text) => {
      text.x = box.x
      text.y = box.y
      text.w = Math.max(1, box.w)
      text.h = Math.max(1, box.h)
    })
  }

  function setTextStyle(id: string, name: string, patch: Partial<TextStyle>): void {
    updateText(id, name, (text) => {
      Object.assign(text, patch)
    })
  }

  /** Met un texte à la verticale ou à l'horizontale ; sa boîte tourne avec lui au besoin. */
  function setTextVertical(id: string, vertical: boolean): void {
    updateText(id, vertical ? 'Texte vertical' : 'Texte horizontal', (text) => {
      Object.assign(text, turnedTextBox(text, vertical))
      text.vertical = vertical
    })
  }

  // Couleurs

  /**
   * Couleur choisie dans la palette : elle colore la sélection et devient celle des prochains
   * nœuds, ou des prochains liens quand on en trace ou qu'on n'a sélectionné qu'eux.
   */
  function setCurrentColor(hex: string): void {
    if (paletteOnLinks.value) linkColor.value = hex
    else nodeColor.value = hex
    if (!hasSelection.value) return
    const nodes = selectedNodes.value
    const links = selectedLinks.value
    const texts = selectedTexts.value
    apply('Colorer la sélection', (draft) => {
      for (const node of draft.nodes) if (nodes.includes(node.id)) node.color = hex
      for (const link of draft.links) if (links.includes(link.id)) link.color = hex
      for (const text of draft.texts) if (texts.includes(text.id)) text.color = hex
    })
  }

  /** Fond des prochains nœuds ; change aussi celui des nœuds sélectionnés. */
  function setCurrentFill(fill: NodeFill): void {
    nodeFill.value = fill
    setNodesStyle(selectedNodes.value, { fill })
  }

  /** Garde dans ce diagramme une couleur choisie par le « + » de la palette. */
  function addCustomColor(hex: string): void {
    const wanted = hex.toLowerCase()
    if (colorChoices.value.some((choice) => choice.hex.toLowerCase() === wanted)) return
    apply('Ajouter une couleur', (draft) => {
      draft.customColors = [hex, ...draft.customColors].slice(0, MAX_CUSTOM_COLORS)
    })
  }

  // Sélection

  function selectAll(): void {
    selectedNodes.value = doc.value.nodes.map((node) => node.id)
    selectedLinks.value = doc.value.links.map((link) => link.id)
    selectedTexts.value = doc.value.texts.map((text) => text.id)
  }

  /** Déplace nœuds, liens et textes sélectionnés d'un même vecteur, en une commande. */
  function moveSelection(dx: number, dy: number): void {
    if ((dx === 0 && dy === 0) || !hasSelection.value) return
    const nodeIds = selectedNodes.value
    const textIds = selectedTexts.value
    const translated = new Map<string, GridPoint>(
      selectedLinks.value.map((id) => [id, [dx, dy] as GridPoint])
    )
    applyWithElasticLinks(
      'Déplacer la sélection',
      (draft) => {
        for (const node of draft.nodes) {
          if (nodeIds.includes(node.id)) {
            node.x += dx
            node.y += dy
          }
        }
        for (const text of draft.texts) {
          if (textIds.includes(text.id)) {
            text.x += dx
            text.y += dy
          }
        }
      },
      translated
    )
  }

  function removeSelection(): void {
    if (!hasSelection.value) return
    const nodeIds = selectedNodes.value
    const linkIds = selectedLinks.value
    const textIds = selectedTexts.value
    apply('Supprimer la sélection', (draft) => {
      draft.nodes = draft.nodes.filter((node) => !nodeIds.includes(node.id))
      draft.links = draft.links.filter((link) => !linkIds.includes(link.id))
      draft.texts = draft.texts.filter((text) => !textIds.includes(text.id))
    })
  }

  function selectionData(): DiagramClipboard {
    return {
      nodes: doc.value.nodes.filter((node) => selectedNodes.value.includes(node.id)),
      links: doc.value.links.filter((link) => selectedLinks.value.includes(link.id)),
      texts: doc.value.texts.filter((text) => selectedTexts.value.includes(text.id))
    }
  }

  function isEmptyData(data: DiagramClipboard): boolean {
    return data.nodes.length === 0 && data.links.length === 0 && data.texts.length === 0
  }

  /** Insère des copies décalées, avec de nouveaux identifiants ; elles deviennent la sélection. */
  function insertCopies(data: DiagramClipboard, dx: number, dy: number, label: string): void {
    if (isEmptyData(data)) return
    const copies: DiagramClipboard = { nodes: [], links: [], texts: [] }
    const nodeIds = doc.value.nodes.map((node) => node.id)
    for (const node of data.nodes) {
      const id = nextNumberedId('n', [...nodeIds, ...copies.nodes.map((copy) => copy.id)])
      copies.nodes.push({ ...node, id, x: node.x + dx, y: node.y + dy })
    }
    const linkIds = doc.value.links.map((link) => link.id)
    for (const link of data.links) {
      const id = nextNumberedId('l', [...linkIds, ...copies.links.map((copy) => copy.id)])
      copies.links.push({ ...link, id, points: translatePoints(link.points, dx, dy) })
    }
    const textIds = doc.value.texts.map((text) => text.id)
    for (const text of data.texts) {
      const id = nextNumberedId('t', [...textIds, ...copies.texts.map((copy) => copy.id)])
      copies.texts.push({ ...text, id, x: text.x + dx, y: text.y + dy })
    }
    // Un groupe copié devient un nouveau groupe : les copies ne rejoignent pas leurs originaux.
    const regrouped = regroupedCopies(
      [...copies.nodes, ...copies.links, ...copies.texts],
      grouping.elements()
    )
    copies.nodes = copies.nodes.map((node, index) => withGroup(node, regrouped[index]?.group))
    copies.links = copies.links.map((link, index) =>
      withGroup(link, regrouped[copies.nodes.length + index]?.group)
    )
    copies.texts = copies.texts.map((text, index) =>
      withGroup(text, regrouped[copies.nodes.length + copies.links.length + index]?.group)
    )
    apply(label, (draft) => {
      for (const node of copies.nodes) draft.nodes.push(node)
      for (const link of copies.links) draft.links.push(castDraft(link))
      for (const text of copies.texts) draft.texts.push(text)
    })
    selectedNodes.value = copies.nodes.map((node) => node.id)
    selectedLinks.value = copies.links.map((link) => link.id)
    selectedTexts.value = copies.texts.map((text) => text.id)
  }

  function duplicateSelection(): void {
    insertCopies(selectionData(), 2, 2, 'Dupliquer')
  }

  /** Alt+glisser : copie de la sélection déposée au décalage donné, en une commande. */
  function duplicateSelectionAt(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    insertCopies(selectionData(), dx, dy, 'Dupliquer')
  }

  function copySelection(): void {
    const data = selectionData()
    if (isEmptyData(data)) return
    clipboard.value = data
    status.value = `${data.nodes.length} nœud(s), ${data.links.length} lien(s) et ${data.texts.length} texte(s) copié(s).`
  }

  function pasteClipboard(): void {
    insertCopies(clipboard.value, 2, 2, 'Coller')
  }

  function clipboardBounds(data: DiagramClipboard): GridRect | null {
    let result: GridRect | null = null
    const include = (bounds: GridRect | null): void => {
      if (bounds) result = result ? unionRects(result, bounds) : { ...bounds }
    }
    for (const node of data.nodes) include(nodeBounds(node))
    for (const link of data.links) include(wireBounds(link.points))
    for (const text of data.texts) include(textLabelBounds(text))
    return result
  }

  /** Colle le presse-papiers avec son coin supérieur gauche sur la cellule donnée. */
  function pasteClipboardAt(x: number, y: number): void {
    const bounds = clipboardBounds(clipboard.value)
    if (!bounds) return
    insertCopies(clipboard.value, x - Math.round(bounds.x), y - Math.round(bounds.y), 'Coller')
  }

  const clipboardEmpty = computed(() => isEmptyData(clipboard.value))

  // Vue

  /** Zoom par un facteur autour d'un point d'écran (par défaut le centre de la zone visible). */
  function zoomAround(factor: number, screenX?: number, screenY?: number): void {
    view.value = zoomedView(
      view.value,
      factor,
      screenX ?? viewport.value.width / 2,
      screenY ?? viewport.value.height / 2,
      style.value.cellPx
    )
  }

  function resetZoom(): void {
    zoomAround(1 / view.value.zoom)
  }

  function panBy(dx: number, dy: number): void {
    view.value = pannedView(view.value, dx, dy)
  }

  function fitToContent(): void {
    view.value = fittingView(diagramBounds(doc.value), viewport.value, style.value.cellPx)
  }

  return {
    doc,
    filePath,
    tabs,
    activeTabId,
    anyDirty,
    pristine,
    dirty,
    selectedNodes,
    selectedLinks,
    selectedTexts,
    tool,
    placement,
    drawing,
    nodeColor,
    nodeFill,
    linkColor,
    linkDash,
    linkStartArrow,
    linkEndArrow,
    view,
    viewport,
    inspectorOpen,
    inspectorFloating,
    panKeyHeld,
    shiftHeld,
    ctrlHeld,
    status,
    undoLabel,
    redoLabel,
    style,
    cellPx,
    anchors,
    colorChoices,
    hasSelection,
    showGroups,
    groups,
    hasGroups,
    canGroup,
    canUngroup,
    syncGroupSelection,
    expandSelectionToGroups,
    groupSelection,
    ungroupSelection,
    paletteOnLinks,
    currentColor,
    clipboardEmpty,
    undo,
    redo,
    revealInspector,
    clearSelection,
    activateTab,
    cycleTab,
    moveTab,
    closeTab,
    newDiagram,
    openDiagram,
    openPath,
    restoreDiagram,
    markSaved,
    dirtyDocuments,
    setName,
    setStyle,
    adoptGeneralStyle,
    followGeneralStyle,
    followsGeneralStyle,
    stylePreview,
    syncDefaults,
    selectTool,
    startPlacing,
    stopPlacing,
    startLinkTool,
    startTextTool,
    addNode,
    placeAt,
    setNodeBox,
    setNodeText,
    setNodesTextStyle,
    fitNodeToText,
    setNodeShape,
    turnBar,
    setNodesStyle,
    reorderNodes,
    addLink,
    beginLink,
    appendLinkPoints,
    popLinkVertex,
    finishLink,
    stopLinkDrawing,
    setLinkPoints,
    toggleLinkVertex,
    setLinksStyle,
    setLinkLabel,
    setLinkLabelPlacement,
    reverseLinks,
    addText,
    addTextBox,
    setTextContent,
    setTextSize,
    setTextAnchor,
    setTextBox,
    setTextStyle,
    setTextVertical,
    setCurrentColor,
    setCurrentFill,
    addCustomColor,
    selectAll,
    moveSelection,
    removeSelection,
    duplicateSelection,
    duplicateSelectionAt,
    copySelection,
    pasteClipboard,
    pasteClipboardAt,
    zoomAround,
    resetZoom,
    panBy,
    fitToContent
  }
})
