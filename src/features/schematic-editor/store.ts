import { castDraft, current as snapshot, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  computeConnectivity,
  computeCrossings,
  createEmptyProject,
  crossingPieces,
  DEFAULT_VIEW,
  fittingView,
  flippedInstance,
  isEmptyProject,
  insertVertex,
  instanceBounds,
  locateOnWire,
  nearestCrossing,
  nextNumberedId,
  normalizePoints,
  pannedView,
  projectBounds,
  profileDifferences,
  projectPins,
  pruneCrossingOverrides,
  regroupedCopies,
  removeVertex,
  rotatedInstance,
  sameProfile,
  simplifyPoints,
  splitPoints,
  textLabelBounds,
  toggledOverrides,
  translatePoints,
  turnedTextBox,
  unionRects,
  wireBounds,
  wireGeometryProblem,
  withGroup,
  wiresFollowingJunctions,
  wiresFollowingPins,
  zoomedView,
  type ComponentDefinition,
  type ComponentInstance,
  type FlipAxis,
  type FreeEndStyle,
  type GridPoint,
  type GridRect,
  type Project,
  type RotateDirection,
  type Rotation,
  type StyleProfile,
  type TextAnchor,
  type TextLabel,
  type ViewState,
  type Wire,
  type Box
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { samePath } from '@/io/paths'
import { readProject } from '@/io/projectFiles'
import { useGroups } from '@/state/groups'
import { useInspectorPanel } from '@/state/inspector'
import { useDocumentTabs } from '@/state/tabs'

export type SchematicTool = 'select' | 'place' | 'wire' | 'text'
export type StackMove = 'up' | 'down' | 'top' | 'bottom'

export interface Placement {
  def: ComponentDefinition
  rotation: Rotation
  mirror: boolean
}

export type { ViewState }

export interface ClipboardItem {
  instance: ComponentInstance
  def: ComponentDefinition
}

export interface ClipboardData {
  items: ClipboardItem[]
  wires: Wire[]
  labels: TextLabel[]
}

export interface PlacedInstance {
  instance: ComponentInstance
  def: ComponentDefinition
}

/** Fil en cours de tracé : les sommets déjà validés. */
export interface WireDrawing {
  points: GridPoint[]
}

/** Styles d'une étiquette texte : ceux des textes de composant, sans le texte variable. */
export type LabelStyle = Pick<
  TextLabel,
  'bold' | 'italic' | 'underline' | 'strike' | 'vertical' | 'color' | 'background'
>

/** Onglet affiché dans la barre d'application. */
export interface TabInfo {
  id: number
  name: string
  filePath: string | null
  dirty: boolean
}

/** État d'édition qu'un onglet garde quand il n'est pas affiché. */
interface TabEditing {
  view: ViewState
  selection: string[]
  selectedWires: string[]
  selectedLabels: string[]
  currentColor: string
}

/** Montage modifié, pour la copie de secours ; `key` est l'identifiant de son onglet. */
export interface DirtyDocument {
  key: number
  project: Project
  originalPath: string | null
}

/** Couleurs personnalisées gardées par montage, les plus récentes d'abord. */
const MAX_CUSTOM_COLORS = 8
const CROSSING_PICK_CELLS = 0.6

/**
 * Montages ouverts, un par onglet, et celui en cours d'édition. Le projet est immuable ; chaque
 * commande passe par l'historique de son onglet. Le store porte aussi l'état de vue (zoom, pan)
 * et l'état des outils, pour que la barre d'outils, le clavier et le canevas agissent sur la
 * même chose. Les onglets sont ceux de `useDocumentTabs` (`src/state/tabs.ts`) : l'onglet actif
 * vit dans des refs, les autres attendent, rangés. Le presse-papiers est commun aux onglets.
 */
export const useSchematicStore = defineStore('schematic', () => {
  const library = useLibraryStore()

  function blankProject(): Project {
    return createEmptyProject('Nouveau montage', library.defaultProfile)
  }

  /** Identifiants des composants sélectionnés. */
  const selection = ref<string[]>([])
  /** Identifiants des fils sélectionnés. */
  const selectedWires = ref<string[]>([])
  /** Identifiants des étiquettes sélectionnées. */
  const selectedLabels = ref<string[]>([])
  const tool = ref<SchematicTool>('select')
  const placement = shallowRef<Placement | null>(null)
  const drawing = shallowRef<WireDrawing | null>(null)
  const currentColor = ref(library.defaultWireColor)
  const clipboard = shallowRef<ClipboardData>({ items: [], wires: [], labels: [] })
  const view = ref<ViewState>({ ...DEFAULT_VIEW })
  const viewport = ref({ width: 1200, height: 800 })
  /** Broches des composants visibles. Gardé dans les paramètres, d'un lancement à l'autre. */
  const showPins = computed({
    get: () => library.showPins,
    set: (value: boolean) => library.setViewOption('showPins', value)
  })
  /** Broches reliées à rien entourées. Gardé dans les paramètres, d'un lancement à l'autre. */
  const showUnconnected = computed({
    get: () => library.showUnconnected,
    set: (value: boolean) => library.setViewOption('showUnconnected', value)
  })
  /** Contour des groupes visible. Gardé dans les paramètres, d'un lancement à l'autre. */
  const showGroups = computed({
    get: () => library.showGroups,
    set: (value: boolean) => library.setViewOption('showGroups', value)
  })
  /** Profil en cours d'édition dans la boîte de dialogue : affiché à la place de celui du projet. */
  const profilePreview = shallowRef<StyleProfile | null>(null)
  const panKeyHeld = ref(false)
  const shiftHeld = ref(false)
  /** Ctrl enfoncée : en sélection, le canevas montre la broche qu'un Ctrl+glisser saisirait. */
  const ctrlHeld = ref(false)
  /** Alt enfoncée : le fil qu'on trace passe aux segments à 45°. */
  const altHeld = ref(false)
  const hoverWireId = ref<string | null>(null)
  const status = ref('')

  /**
   * Un montage a-t-il quelque chose à enregistrer ? Pas s'il est intact, ni s'il n'a jamais eu de
   * fichier et qu'il est vide : on le ferme et on quitte alors sans question.
   */
  function needsSaving(project: Project, saved: Project | null, path: string | null): boolean {
    return project !== saved && !(path === null && isEmptyProject(project))
  }

  // Onglets : mécanique partagée (`useDocumentTabs`) ; ici, ce qu'un onglet garde de l'édition.
  const base = useDocumentTabs<Project, TabEditing>({
    blank: blankProject,
    needsSaving,
    freshEditing: () => ({
      view: { ...DEFAULT_VIEW },
      selection: [],
      selectedWires: [],
      selectedLabels: [],
      currentColor: library.defaultWireColor
    }),
    capture: () => ({
      view: view.value,
      selection: selection.value,
      selectedWires: selectedWires.value,
      selectedLabels: selectedLabels.value,
      currentColor: currentColor.value
    }),
    restore: (editing) => {
      view.value = editing.view
      selection.value = editing.selection
      selectedWires.value = editing.selectedWires
      selectedLabels.value = editing.selectedLabels
      currentColor.value = editing.currentColor
      // Pose, tracé et aperçus appartenaient au document qu'on quitte.
      placement.value = null
      drawing.value = null
      tool.value = 'select'
      profilePreview.value = null
      hoverWireId.value = null
    },
    // Un fil en cours de tracé est gardé s'il a deux sommets, abandonné sinon.
    beforeLeave: () => {
      stopWireDrawing()
    },
    afterSync: pruneSelection
  })
  const { doc, activeTabId, dirty, pristine, anyDirty, undoLabel, redoLabel, cycleTab, moveTab } =
    base
  const filePath = base.path
  const tabs = computed<TabInfo[]>(() =>
    base.tabs.value.map((tab) => ({
      id: tab.id,
      name: tab.name,
      filePath: tab.path,
      dirty: tab.dirty
    }))
  )
  /** Profil effectif pour l'affichage : l'aperçu de la boîte de dialogue, sinon celui du projet. */
  const profile = computed<StyleProfile>(() => profilePreview.value ?? doc.value.profile)
  const cellPx = computed(() => profile.value.cellPx * view.value.zoom)
  /** Réglages où le style de ce montage s'écarte du profil général de l'application. */
  const profileDiffs = computed(() => profileDifferences(doc.value.profile, library.defaultProfile))
  const followsGeneralProfile = computed(() => profileDiffs.value.length === 0)
  const placed = computed<PlacedInstance[]>(() =>
    doc.value.components.flatMap((instance) => {
      const def = doc.value.embeddedDefs[instance.defId]
      return def ? [{ instance, def }] : []
    })
  )
  const selectedInstances = computed(() =>
    doc.value.components.filter((instance) => selection.value.includes(instance.id))
  )
  const sortedWires = computed(() => [...doc.value.wires].sort((a, b) => a.stack - b.stack))
  /** Couleurs proposées pour les fils : la palette de l'application, puis celles du montage. */
  const colorChoices = computed(() => [
    ...library.palette.map((color) => ({ hex: color.hex, name: color.name })),
    ...doc.value.customColors.map((hex) => ({ hex, name: hex }))
  ])
  const pinRefs = computed(() => projectPins(doc.value))
  const connectivity = computed(() => computeConnectivity(doc.value.wires, pinRefs.value))
  const crossings = computed(() => computeCrossings(doc.value.wires))
  const pieces = computed(() => crossingPieces(doc.value.wires, doc.value.crossingOverrides))
  const hoverNet = computed(() =>
    hoverWireId.value === null ? null : (connectivity.value.wireNet.get(hoverWireId.value) ?? null)
  )
  const hasSelection = computed(
    () =>
      selection.value.length > 0 ||
      selectedWires.value.length > 0 ||
      selectedLabels.value.length > 0
  )

  // Groupes : composants, fils et étiquettes qu'on sélectionne et déplace d'un bloc.
  const grouping = useGroups({
    kinds: {
      instance: { elements: () => doc.value.components, selected: selection },
      wire: { elements: () => doc.value.wires, selected: selectedWires },
      label: { elements: () => doc.value.labels, selected: selectedLabels }
    },
    write: (label, change) => {
      apply(label, (draft) => {
        const lists = { instance: draft.components, wire: draft.wires, label: draft.labels }
        for (const kind of ['instance', 'wire', 'label'] as const) {
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

  /** Panneau de propriétés à droite (`useInspectorPanel`) : replié par défaut, touche I. */
  const inspector = useInspectorPanel({
    hasSelection: () => hasSelection.value,
    autoOpen: () => library.autoOpenInspector
  })
  const inspectorOpen = inspector.open
  const inspectorFloating = inspector.floating

  /** Après chaque changement du montage : la sélection ne garde que ce qui existe encore. */
  function pruneSelection(): void {
    const instanceIds = new Set(doc.value.components.map((instance) => instance.id))
    if (selection.value.some((id) => !instanceIds.has(id))) {
      selection.value = selection.value.filter((id) => instanceIds.has(id))
    }
    const wireIds = new Set(doc.value.wires.map((wire) => wire.id))
    if (selectedWires.value.some((id) => !wireIds.has(id))) {
      selectedWires.value = selectedWires.value.filter((id) => wireIds.has(id))
    }
    const labelIds = new Set(doc.value.labels.map((label) => label.id))
    if (selectedLabels.value.some((id) => !labelIds.has(id))) {
      selectedLabels.value = selectedLabels.value.filter((id) => labelIds.has(id))
    }
  }

  /**
   * Toute commande passe ici ; au passage, les jonctions suivent les fils déplacés et les
   * exceptions de croisement orphelines sont élaguées.
   */
  function apply(label: string, recipe: (draft: Draft<Project>) => void): boolean {
    const wiresBefore = doc.value.wires
    return base.apply(label, (draft) => {
      recipe(draft)
      // Jonctions : les extrémités posées sur un fil dont le tracé vient de changer le suivent.
      const now = snapshot(draft) as Project
      if (now.wires !== wiresBefore) {
        const followed = wiresFollowingJunctions(wiresBefore, now.wires, projectPins(now))
        if (followed.some((wire, index) => wire !== now.wires[index])) {
          draft.wires = castDraft(followed)
        }
      }
      const pruned = pruneCrossingOverrides(draft.crossingOverrides, computeCrossings(draft.wires))
      if (pruned.length !== draft.crossingOverrides.length) {
        draft.crossingOverrides = castDraft(pruned)
      }
    })
  }

  /**
   * Commande qui déplace ou réoriente des composants : les extrémités de fil posées sur leurs
   * broches suivent (élasticité) ; les fils de `translatedWires` sont déplacés en bloc et gardent
   * leurs extrémités posées sur des broches immobiles.
   */
  function applyWithElasticWires(
    label: string,
    recipe: (draft: Draft<Project>) => void,
    translatedWires: ReadonlyMap<string, GridPoint> = new Map()
  ): boolean {
    const wiresBefore = doc.value.wires
    const pinsBefore = pinRefs.value
    return apply(label, (draft) => {
      recipe(draft)
      const adjusted = wiresFollowingPins(
        wiresBefore,
        pinsBefore,
        projectPins(draft),
        translatedWires
      )
      if (adjusted.some((wire, index) => wire !== wiresBefore[index])) {
        draft.wires = castDraft(adjusted)
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
    selection.value = []
    selectedWires.value = []
    selectedLabels.value = []
  }

  // Fichier

  /** Couleur des prochains fils : celle du dernier fil du montage, sinon celle des paramètres. */
  function syncCurrentColor(): void {
    const last = doc.value.wires.reduce<Wire | null>(
      (best, wire) => (best === null || wire.stack > best.stack ? wire : best),
      null
    )
    currentColor.value = last?.color ?? library.defaultWireColor
  }

  // Onglets

  function activateTab(id: number): void {
    if (base.activateTab(id)) status.value = ''
  }

  /** Montre un document dans un onglet : l'onglet actif s'il est vierge, sinon un nouveau. */
  function showInTab(project: Project, saved: Project | null, path: string | null): void {
    base.showInTab(project, saved, path)
    syncCurrentColor()
  }

  function newProject(): void {
    const blank = blankProject()
    showInTab(blank, blank, null)
    status.value = ''
  }

  function openProject(project: Project, path: string): void {
    showInTab(project, project, path)
    status.value = ''
  }

  /**
   * Ouvre un fichier de projet par son chemin ; vrai si l'ouverture a réussi. Un fichier déjà
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
      const project = await readProject(path)
      openProject(project, path)
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

  /** Reprend une copie de secours : le projet s'ouvre dans un onglet, comme non enregistré. */
  function restoreProject(project: Project, originalPath: string | null): void {
    showInTab(project, null, originalPath)
    fitToContent()
    status.value = 'Copie de secours récupérée : pense à enregistrer.'
  }

  function markSaved(path: string): void {
    base.markSaved(path)
  }

  /**
   * Ferme un onglet sans rien demander ; vrai s'il existait. La question « enregistrer ? » d'un
   * montage modifié se pose avant, dans `closeTabAsking`. Fermer le dernier laisse un montage
   * vierge.
   */
  function closeTab(id: number): boolean {
    const wasActive = id === activeTabId.value
    const closed = base.closeTab(id)
    if (closed && wasActive) status.value = ''
    return closed
  }

  /** Montages modifiés, un par onglet concerné : ce que la copie de secours doit contenir. */
  function dirtyDocuments(): DirtyDocument[] {
    return base
      .unsavedDocuments()
      .map(({ key, doc: project, path }) => ({ key, project, originalPath: path }))
  }

  function setProjectName(name: string): void {
    apply('Renommer le projet', (draft) => {
      draft.name = name
    })
  }

  function setProfile(profile: StyleProfile): void {
    apply('Changer le profil de style', (draft) => {
      draft.profile = castDraft(structuredClone(profile))
    })
  }

  /** Aligne ce montage sur le profil général de l'application. */
  function adoptGeneralProfile(): void {
    const general = library.defaultProfile
    apply('Appliquer le profil général', (draft) => {
      draft.profile = castDraft(structuredClone(general))
    })
  }

  /**
   * Le profil général vient de passer de `previous` à `next` : les montages ouverts qui suivaient
   * l'ancien prennent le nouveau (une commande par onglet, annulable) ; ceux qui avaient leur
   * propre style le gardent. Un montage vierge repart simplement du nouveau profil.
   */
  function followGeneralProfile(previous: StyleProfile, next: StyleProfile): void {
    if (sameProfile(previous, next)) return
    const label = 'Changer le profil de style'
    const set = (draft: Draft<Project>): void => {
      draft.profile = castDraft(structuredClone(next))
    }
    base.updateStashedTabs((tab) => {
      const current = tab.history.value
      if (!sameProfile(current.profile, previous)) return tab
      if (tab.path === null && current === tab.savedDoc) {
        const blank = createEmptyProject(current.name, next)
        tab.history.reset(blank)
        return { ...tab, savedDoc: blank }
      }
      tab.history.apply(label, set)
      return { ...tab }
    })
    if (!sameProfile(doc.value.profile, previous)) return
    if (pristine.value) {
      const blank = createEmptyProject(doc.value.name, next)
      base.reset(blank, blank)
    } else {
      apply(label, set)
    }
  }

  /** Remplace la définition embarquée par celle de la bibliothèque (même identifiant). */
  function updateDefinition(def: ComponentDefinition): void {
    applyWithElasticWires(`Mettre à jour ${def.name}`, (draft) => {
      draft.embeddedDefs[def.id] = castDraft(structuredClone(def))
    })
  }

  // Outils

  function selectTool(): void {
    tool.value = 'select'
    placement.value = null
    stopWireDrawing()
  }

  function startPlacing(def: ComponentDefinition): void {
    placement.value = { def, rotation: 0, mirror: false }
    stopWireDrawing()
    tool.value = 'place'
    clearSelection()
    status.value = `Pose de ${def.name} : clic pour poser, R et T pour tourner et retourner, Échap pour arrêter.`
  }

  function stopPlacing(): void {
    placement.value = null
    if (tool.value === 'place') tool.value = 'select'
  }

  function startWireTool(): void {
    tool.value = 'wire'
    placement.value = null
    stopWireDrawing()
    clearSelection()
    status.value =
      'Fil : clic sur une broche ou une intersection pour partir, clic pour chaque coude, Alt trace à 45°, Maj inverse l’ordre, double-clic ou Entrée pour finir.'
  }

  function startTextTool(): void {
    tool.value = 'text'
    placement.value = null
    stopWireDrawing()
    clearSelection()
    status.value =
      'Texte : clic pour poser une étiquette, puis modifie-la dans le panneau de droite.'
  }

  function probe(current: Placement): ComponentInstance {
    return {
      id: '',
      defId: current.def.id,
      x: 0,
      y: 0,
      rotation: current.rotation,
      mirror: current.mirror,
      label: '',
      fields: {},
      behindWires: false
    }
  }

  function rotatePlacement(direction: RotateDirection): void {
    const current = placement.value
    if (!current) return
    const turned = rotatedInstance(probe(current), current.def, direction)
    placement.value = { ...current, rotation: turned.rotation }
  }

  function flipPlacement(axis: FlipAxis): void {
    const current = placement.value
    if (!current) return
    const flipped = flippedInstance(probe(current), axis)
    placement.value = { ...current, rotation: flipped.rotation, mirror: flipped.mirror }
  }

  /** Pose le composant en cours à la position donnée (coin supérieur gauche, en cellules). */
  function placeAt(x: number, y: number): string | null {
    const current = placement.value
    if (!current) return null
    const def = current.def
    const id = nextNumberedId(
      'c',
      doc.value.components.map((instance) => instance.id)
    )
    // La définition posée fait foi : si la bibliothèque a changé depuis la dernière pose, la copie
    // embarquée est remplacée et tous les exemplaires du montage suivent (fils compris).
    const embedded = doc.value.embeddedDefs[def.id]
    const refresh = !embedded || JSON.stringify(embedded) !== JSON.stringify(def)
    applyWithElasticWires(`Poser ${def.name}`, (draft) => {
      if (refresh) draft.embeddedDefs[def.id] = castDraft(structuredClone(def))
      draft.components.push({
        id,
        defId: def.id,
        x,
        y,
        rotation: current.rotation,
        mirror: current.mirror,
        label: '',
        fields: {},
        behindWires: false
      })
    })
    status.value = `${def.name} posé.`
    return id
  }

  // Étiquettes texte

  function addLabel(x: number, y: number): string {
    // Boîte de 4 × 1 cellules dont le bord haut est centré sur le clic.
    return addLabelBox({ x: x - 2, y, w: 4, h: 1 })
  }

  /** Étiquette « Texte » dans une boîte donnée, en cellules. */
  function addLabelBox(box: Box): string {
    const id = nextNumberedId(
      't',
      doc.value.labels.map((label) => label.id)
    )
    const size = doc.value.profile.labelFont.size
    apply('Ajouter une étiquette', (draft) => {
      draft.labels.push({
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
        color: '#000000',
        background: false
      })
    })
    selection.value = []
    selectedWires.value = []
    selectedLabels.value = [id]
    return id
  }

  function setLabelText(id: string, text: string): void {
    apply('Modifier l’étiquette', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (label) label.text = text
    })
  }

  function setLabelSize(id: string, size: number): void {
    apply('Taille de l’étiquette', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (label) label.size = size
    })
  }

  function setLabelBox(id: string, box: { x: number; y: number; w: number; h: number }): void {
    apply('Cadre de l’étiquette', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (!label) return
      label.x = box.x
      label.y = box.y
      label.w = Math.max(1, box.w)
      label.h = Math.max(1, box.h)
    })
  }

  function setLabelAnchor(id: string, anchor: TextAnchor): void {
    apply('Alignement de l’étiquette', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (label) label.anchor = anchor
    })
  }

  function setLabelBold(id: string, bold: boolean): void {
    setLabelStyle(id, bold ? 'Étiquette en gras' : 'Étiquette normale', { bold })
  }

  /** Change un ou plusieurs styles d'une étiquette (graisse, italique, décorations, couleur, fond). */
  function setLabelStyle(id: string, name: string, style: Partial<LabelStyle>): void {
    apply(name, (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (label) Object.assign(label, style)
    })
  }

  /** Met une étiquette à la verticale ou à l'horizontale ; sa boîte tourne avec elle au besoin. */
  function setLabelVertical(id: string, vertical: boolean): void {
    apply(vertical ? 'Étiquette verticale' : 'Étiquette horizontale', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (!label) return
      Object.assign(label, turnedTextBox(label, vertical))
      label.vertical = vertical
    })
  }

  // Tracé des fils

  function nextWireId(): string {
    return nextNumberedId(
      'w',
      doc.value.wires.map((wire) => wire.id)
    )
  }

  function nextStack(): number {
    return doc.value.wires.reduce((max, wire) => Math.max(max, wire.stack + 1), 0)
  }

  /** Crée un fil à partir de sommets bruts ; retourne son identifiant, ou null s'il est invalide. */
  function addWire(points: readonly GridPoint[], color = currentColor.value): string | null {
    const clean = simplifyPoints(points)
    if (clean.length < 2 || wireGeometryProblem(clean) !== null) return null
    const id = nextWireId()
    const stack = nextStack()
    apply('Tracer un fil', (draft) => {
      draft.wires.push({
        id,
        color,
        points: castDraft(clean),
        stack,
        freeEnds: 'flat',
        endLabels: { start: '', end: '' }
      })
    })
    return id
  }

  function beginWire(point: GridPoint): void {
    drawing.value = { points: [point] }
  }

  function appendWirePoints(points: readonly GridPoint[]): void {
    const current = drawing.value
    if (!current) return
    drawing.value = { points: normalizePoints([...current.points, ...points]) }
  }

  /** Retire le dernier sommet validé ; annule le tracé s'il n'en reste pas. */
  function popWireVertex(): void {
    const current = drawing.value
    if (!current) return
    drawing.value = current.points.length <= 1 ? null : { points: current.points.slice(0, -1) }
  }

  function finishWire(): string | null {
    const current = drawing.value
    drawing.value = null
    if (!current || current.points.length < 2) return null
    const id = addWire(current.points)
    if (id)
      status.value = 'Fil tracé. Clic pour en commencer un autre, V pour revenir à la sélection.'
    return id
  }

  /**
   * Arrête le tracé en cours (Échap, changement d'outil) : le fil est gardé dès qu'il a un départ
   * et une arrivée, abandonné s'il n'a qu'un point. Vrai s'il y avait un tracé.
   */
  function stopWireDrawing(): boolean {
    const current = drawing.value
    if (!current) return false
    if (current.points.length >= 2) finishWire()
    else drawing.value = null
    return true
  }

  // Édition des fils

  function setWirePoints(id: string, points: readonly GridPoint[]): void {
    const clean = normalizePoints(points)
    if (clean.length < 2 || wireGeometryProblem(clean) !== null) return
    apply('Modifier le fil', (draft) => {
      const wire = draft.wires.find((candidate) => candidate.id === id)
      if (wire) wire.points = castDraft(clean)
    })
  }

  /** Ajoute un sommet au milieu d'un segment du fil : rien ne bouge, il reste à le glisser. */
  function addWireVertex(id: string, point: GridPoint): void {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    const points = wire ? insertVertex(wire.points, point) : null
    if (!points) return
    apply('Ajouter un sommet', (draft) => {
      const target = draft.wires.find((candidate) => candidate.id === id)
      if (target) target.points = castDraft(points)
    })
  }

  /** Retire un sommet du fil, si ses voisins peuvent se rejoindre tout droit ou à 45°. */
  function removeWireVertex(id: string, index: number): void {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    const points = wire ? removeVertex(wire.points, index) : null
    if (!points || wireGeometryProblem(points) !== null) return
    apply('Supprimer un sommet', (draft) => {
      const target = draft.wires.find((candidate) => candidate.id === id)
      if (target) target.points = castDraft(points)
    })
  }

  /**
   * Coupe un fil en deux à un point qui lui appartient. Rien ne change à l'œil : les deux morceaux
   * se touchent, donc restent reliés, mais chacun se sélectionne, se déplace ou se supprime seul.
   * Le second morceau passe juste au-dessus du premier et garde l'étiquette de l'arrivée ; les
   * exceptions de croisement posées sur lui le suivent. Retourne son identifiant.
   */
  function splitWire(id: string, point: GridPoint): string | null {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    const parts = wire ? splitPoints(wire.points, point) : null
    if (!wire || !parts) return null
    const [head, tail] = parts
    const newId = nextWireId()
    // Sans le suivi des jonctions : aucun tracé ne bouge, les extrémités posées sur le second
    // morceau doivent y rester.
    base.apply('Couper le fil', (draft) => {
      const target = draft.wires.find((candidate) => candidate.id === id)
      if (!target) return
      for (const other of draft.wires) if (other.stack > wire.stack) other.stack += 1
      target.points = castDraft(head)
      target.endLabels.end = ''
      draft.wires.push({
        id: newId,
        color: wire.color,
        points: castDraft(tail),
        stack: wire.stack + 1,
        freeEnds: wire.freeEnds,
        endLabels: { start: '', end: wire.endLabels.end },
        // Le second morceau reste dans le groupe du fil coupé.
        ...(wire.group === undefined ? {} : { group: wire.group })
      })
      for (const override of draft.crossingOverrides) {
        if (override.topWireId !== id) continue
        const spot: GridPoint = [override.x, override.y]
        if (!locateOnWire(head, spot) && locateOnWire(tail, spot)) override.topWireId = newId
      }
    })
    status.value = 'Fil coupé en deux.'
    return newId
  }

  /** Sélectionne tous les fils du net d'un fil : ceux qui lui sont reliés, de proche en proche. */
  function selectNet(wireId: string): void {
    const nets = connectivity.value.wireNet
    const net = nets.get(wireId)
    if (net === undefined) return
    clearSelection()
    selectedWires.value = doc.value.wires
      .filter((wire) => nets.get(wire.id) === net)
      .map((wire) => wire.id)
  }

  /** Sélectionne un composant avec les fils dont une extrémité est sur une de ses broches. */
  function selectConnectedWires(instanceId: string): void {
    const spots = new Set(
      pinRefs.value
        .filter((pin) => pin.instanceId === instanceId)
        .map((pin) => `${pin.point[0]},${pin.point[1]}`)
    )
    const onPin = (point: GridPoint | undefined): boolean =>
      point !== undefined && spots.has(`${point[0]},${point[1]}`)
    selection.value = [instanceId]
    selectedLabels.value = []
    selectedWires.value = doc.value.wires
      .filter((wire) => onPin(wire.points[0]) || onPin(wire.points.at(-1)))
      .map((wire) => wire.id)
  }

  /** Y a-t-il un croisement de fils à portée de ce point ? */
  function crossingNear(x: number, y: number): boolean {
    return nearestCrossing(crossings.value, x, y, CROSSING_PICK_CELLS) !== null
  }

  function recolorWires(ids: readonly string[], color: string): void {
    if (ids.length === 0) return
    apply('Colorer les fils', (draft) => {
      for (const wire of draft.wires) if (ids.includes(wire.id)) wire.color = color
    })
  }

  /** Couleur des prochains fils ; recolore aussi les fils sélectionnés. */
  /**
   * Garde dans ce montage une couleur choisie par le « + » de la palette ; rien si la palette de
   * l'application ou le montage l'ont déjà.
   */
  function addCustomColor(hex: string): void {
    const wanted = hex.toLowerCase()
    if (colorChoices.value.some((choice) => choice.hex.toLowerCase() === wanted)) return
    apply('Ajouter une couleur', (draft) => {
      draft.customColors = [hex, ...draft.customColors].slice(0, MAX_CUSTOM_COLORS)
    })
  }

  function setCurrentColor(color: string): void {
    currentColor.value = color
    recolorWires(selectedWires.value, color)
  }

  function setWireFreeEnds(id: string, style: FreeEndStyle): void {
    apply('Extrémités libres', (draft) => {
      const wire = draft.wires.find((candidate) => candidate.id === id)
      if (wire) wire.freeEnds = style
    })
  }

  /** Étiquette d'une extrémité (0 = départ, sinon arrivée) ; vide = aucune. */
  function setWireEndLabel(id: string, endIndex: number, text: string): void {
    const trimmed = text.trim()
    apply(
      trimmed.length > 0 ? 'Étiquette d’extrémité' : 'Retirer l’étiquette d’extrémité',
      (draft) => {
        const wire = draft.wires.find((candidate) => candidate.id === id)
        if (!wire) return
        if (endIndex === 0) wire.endLabels.start = trimmed
        else wire.endLabels.end = trimmed
      }
    )
  }

  function removeWires(ids: readonly string[]): void {
    if (ids.length === 0) return
    apply(ids.length > 1 ? 'Supprimer les fils' : 'Supprimer le fil', (draft) => {
      draft.wires = draft.wires.filter((wire) => !ids.includes(wire.id))
    })
  }

  /** Ordre d'empilement : avancer, reculer, premier plan, arrière-plan. */
  function reorderWires(move: StackMove): void {
    const ids = new Set(selectedWires.value)
    if (ids.size === 0) return
    const order = sortedWires.value.map((wire) => wire.id)
    if (move === 'top' || move === 'bottom') {
      const chosen = order.filter((id) => ids.has(id))
      const others = order.filter((id) => !ids.has(id))
      order.splice(
        0,
        order.length,
        ...(move === 'top' ? [...others, ...chosen] : [...chosen, ...others])
      )
    } else if (move === 'up') {
      for (let i = order.length - 2; i >= 0; i--) {
        const current = order[i]
        const next = order[i + 1]
        if (current !== undefined && next !== undefined && ids.has(current) && !ids.has(next)) {
          order[i] = next
          order[i + 1] = current
        }
      }
    } else {
      for (let i = 1; i < order.length; i++) {
        const current = order[i]
        const previous = order[i - 1]
        if (
          current !== undefined &&
          previous !== undefined &&
          ids.has(current) &&
          !ids.has(previous)
        ) {
          order[i] = previous
          order[i - 1] = current
        }
      }
    }
    const rank = new Map(order.map((id, index) => [id, index]))
    apply('Ordre des fils', (draft) => {
      for (const wire of draft.wires) wire.stack = rank.get(wire.id) ?? wire.stack
    })
  }

  /**
   * Met des composants derrière les fils, ou les ramène devant. Derrière, un composant ne cache
   * plus les fils qui passent sur lui : pour une image, surtout.
   */
  function setInstancesBehindWires(ids: readonly string[], behind: boolean): void {
    const changing = doc.value.components.filter(
      (instance) => ids.includes(instance.id) && instance.behindWires !== behind
    )
    if (changing.length === 0) return
    apply(behind ? 'Passer derrière les fils' : 'Passer devant les fils', (draft) => {
      for (const instance of draft.components) {
        if (ids.includes(instance.id)) instance.behindWires = behind
      }
    })
  }

  /**
   * Ctrl+Page haut / bas sur la sélection : les fils avancent ou reculent entre eux ; les
   * composants passent devant les fils (haut) ou derrière (bas).
   */
  function restackSelection(move: StackMove): void {
    reorderWires(move)
    setInstancesBehindWires(selection.value, move === 'down' || move === 'bottom')
  }

  /** Alt+clic près d'un croisement : l'autre fil passe au-dessus à cet endroit seulement. */
  function toggleCrossing(x: number, y: number): boolean {
    const crossing = nearestCrossing(crossings.value, x, y, CROSSING_PICK_CELLS)
    if (!crossing) return false
    const stacks = new Map(doc.value.wires.map((wire) => [wire.id, wire.stack]))
    const next = toggledOverrides(
      doc.value.crossingOverrides,
      crossing,
      (id) => stacks.get(id) ?? 0
    )
    apply('Ordre à ce croisement', (draft) => {
      draft.crossingOverrides = castDraft(next)
    })
    return true
  }

  // Sélection

  function selectAll(): void {
    selection.value = doc.value.components.map((instance) => instance.id)
    selectedWires.value = doc.value.wires.map((wire) => wire.id)
    selectedLabels.value = doc.value.labels.map((label) => label.id)
  }

  function moveInstances(ids: readonly string[], dx: number, dy: number): void {
    if ((dx === 0 && dy === 0) || ids.length === 0) return
    applyWithElasticWires(
      ids.length > 1 ? 'Déplacer la sélection' : 'Déplacer le composant',
      (draft) => {
        for (const instance of draft.components) {
          if (ids.includes(instance.id)) {
            instance.x += dx
            instance.y += dy
          }
        }
      }
    )
  }

  /** Déplace composants, fils et étiquettes sélectionnés d'un même vecteur, en une commande. */
  function moveSelection(dx: number, dy: number): void {
    if ((dx === 0 && dy === 0) || !hasSelection.value) return
    const instanceIds = selection.value
    const labelIds = selectedLabels.value
    const translated = new Map<string, GridPoint>(
      selectedWires.value.map((id) => [id, [dx, dy] as GridPoint])
    )
    applyWithElasticWires(
      'Déplacer la sélection',
      (draft) => {
        for (const instance of draft.components) {
          if (instanceIds.includes(instance.id)) {
            instance.x += dx
            instance.y += dy
          }
        }
        for (const label of draft.labels) {
          if (labelIds.includes(label.id)) {
            label.x += dx
            label.y += dy
          }
        }
      },
      translated
    )
  }

  function transformSelection(
    label: string,
    transform: (instance: ComponentInstance, def: ComponentDefinition) => ComponentInstance
  ): void {
    const updates = new Map<string, ComponentInstance>()
    for (const instance of selectedInstances.value) {
      const def = doc.value.embeddedDefs[instance.defId]
      if (def) updates.set(instance.id, transform(instance, def))
    }
    if (updates.size === 0) return
    applyWithElasticWires(label, (draft) => {
      draft.components.forEach((instance, index) => {
        const update = updates.get(instance.id)
        if (update) draft.components[index] = castDraft(update)
      })
    })
  }

  function rotateSelection(direction: RotateDirection): void {
    transformSelection(
      direction === 'cw' ? 'Rotation horaire' : 'Rotation antihoraire',
      (instance, def) => rotatedInstance(instance, def, direction)
    )
  }

  function flipSelection(axis: FlipAxis): void {
    transformSelection(
      axis === 'horizontal' ? 'Miroir horizontal' : 'Miroir vertical',
      (instance) => flippedInstance(instance, axis)
    )
  }

  /** R / Maj+R : agit sur le composant en cours de pose, sinon sur la sélection. */
  function rotate(direction: RotateDirection): void {
    if (placement.value) rotatePlacement(direction)
    else rotateSelection(direction)
  }

  /** T / Maj+T : agit sur le composant en cours de pose, sinon sur la sélection. */
  function flip(axis: FlipAxis): void {
    if (placement.value) flipPlacement(axis)
    else flipSelection(axis)
  }

  function removeSelection(): void {
    if (!hasSelection.value) return
    const instanceIds = selection.value
    const wireIds = selectedWires.value
    const labelIds = selectedLabels.value
    apply('Supprimer la sélection', (draft) => {
      draft.components = draft.components.filter((instance) => !instanceIds.includes(instance.id))
      draft.wires = draft.wires.filter((wire) => !wireIds.includes(wire.id))
      draft.labels = draft.labels.filter((label) => !labelIds.includes(label.id))
    })
    clearSelection()
  }

  function selectionData(): ClipboardData {
    return {
      items: selectedInstances.value.flatMap((instance) => {
        const def = doc.value.embeddedDefs[instance.defId]
        return def ? [{ instance, def }] : []
      }),
      wires: doc.value.wires.filter((wire) => selectedWires.value.includes(wire.id)),
      labels: doc.value.labels.filter((label) => selectedLabels.value.includes(label.id))
    }
  }

  function insertCopies(data: ClipboardData, dx: number, dy: number, label: string): void {
    if (data.items.length === 0 && data.wires.length === 0 && data.labels.length === 0) return
    const instanceIds = doc.value.components.map((instance) => instance.id)
    const copies: ClipboardItem[] = []
    for (const item of data.items) {
      const id = nextNumberedId('c', [...instanceIds, ...copies.map((copy) => copy.instance.id)])
      copies.push({
        def: item.def,
        instance: {
          ...item.instance,
          id,
          x: item.instance.x + dx,
          y: item.instance.y + dy
        }
      })
    }
    const wireIds = doc.value.wires.map((wire) => wire.id)
    let stack = nextStack()
    const wireCopies: Wire[] = []
    for (const wire of data.wires) {
      const id = nextNumberedId('w', [...wireIds, ...wireCopies.map((copy) => copy.id)])
      wireCopies.push({ ...wire, id, stack: stack++, points: translatePoints(wire.points, dx, dy) })
    }
    const labelIds = doc.value.labels.map((entry) => entry.id)
    const labelCopies: TextLabel[] = []
    for (const entry of data.labels) {
      const id = nextNumberedId('t', [...labelIds, ...labelCopies.map((copy) => copy.id)])
      labelCopies.push({ ...entry, id, x: entry.x + dx, y: entry.y + dy })
    }
    // Un groupe copié devient un nouveau groupe : les copies ne rejoignent pas leurs originaux.
    const regrouped = regroupedCopies(
      [...copies.map((copy) => copy.instance), ...wireCopies, ...labelCopies],
      grouping.elements()
    )
    copies.forEach((copy, index) => {
      copy.instance = withGroup(copy.instance, regrouped[index]?.group)
    })
    wireCopies.forEach((wire, index) => {
      wireCopies[index] = withGroup(wire, regrouped[copies.length + index]?.group)
    })
    labelCopies.forEach((entry, index) => {
      labelCopies[index] = withGroup(
        entry,
        regrouped[copies.length + wireCopies.length + index]?.group
      )
    })
    apply(label, (draft) => {
      for (const copy of copies) {
        if (!Object.hasOwn(draft.embeddedDefs, copy.def.id)) {
          draft.embeddedDefs[copy.def.id] = castDraft(structuredClone(copy.def))
        }
        draft.components.push(castDraft(copy.instance))
      }
      for (const wire of wireCopies) draft.wires.push(castDraft(wire))
      for (const entry of labelCopies) draft.labels.push(castDraft(entry))
    })
    selection.value = copies.map((copy) => copy.instance.id)
    selectedWires.value = wireCopies.map((wire) => wire.id)
    selectedLabels.value = labelCopies.map((entry) => entry.id)
  }

  function duplicateSelection(): void {
    insertCopies(selectionData(), 1, 1, 'Dupliquer')
  }

  /** Alt+glisser : copie de la sélection déposée au décalage donné, en une commande. */
  function duplicateSelectionAt(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    insertCopies(selectionData(), dx, dy, 'Dupliquer')
  }

  function copySelection(): void {
    const data = selectionData()
    if (data.items.length === 0 && data.wires.length === 0 && data.labels.length === 0) return
    clipboard.value = data
    status.value = `${data.items.length} composant(s), ${data.wires.length} fil(s) et ${data.labels.length} étiquette(s) copié(s).`
  }

  function pasteClipboard(): void {
    insertCopies(clipboard.value, 1, 1, 'Coller')
  }

  function clipboardBounds(data: ClipboardData): GridRect | null {
    let result: GridRect | null = null
    const include = (bounds: GridRect): void => {
      result = result ? unionRects(result, bounds) : { ...bounds }
    }
    for (const item of data.items) include(instanceBounds(item.instance, item.def))
    for (const wire of data.wires) {
      const bounds = wireBounds(wire.points)
      if (bounds) include(bounds)
    }
    for (const label of data.labels) include(textLabelBounds(label))
    return result
  }

  /** Colle le presse-papiers avec son coin supérieur gauche sur la cellule donnée. */
  function pasteClipboardAt(x: number, y: number): void {
    const bounds = clipboardBounds(clipboard.value)
    if (!bounds) return
    insertCopies(clipboard.value, x - bounds.x, y - bounds.y, 'Coller')
  }

  const clipboardEmpty = computed(
    () =>
      clipboard.value.items.length === 0 &&
      clipboard.value.wires.length === 0 &&
      clipboard.value.labels.length === 0
  )

  function setInstanceLabel(id: string, label: string): void {
    apply('Modifier le libellé', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (instance) instance.label = label
    })
  }

  /** Valeur d'un texte variable pour un composant posé ; vide = revenir à la valeur par défaut. */
  function setInstanceField(id: string, name: string, value: string): void {
    const trimmed = value.trim()
    apply(`Valeur de ${name}`, (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (!instance) return
      if (trimmed.length > 0) {
        instance.fields[name] = trimmed
      } else if (Object.hasOwn(instance.fields, name)) {
        instance.fields = Object.fromEntries(
          Object.entries(instance.fields).filter(([key]) => key !== name)
        )
      }
    })
  }

  /** Définition de la bibliothèque plus récente que la copie embarquée, s'il y en a une. */
  function newerLibraryDefinition(defId: string): ComponentDefinition | null {
    const embedded = doc.value.embeddedDefs[defId]
    const entry = library.entries.find((candidate) => candidate.def?.id === defId)
    if (!embedded || !entry?.def) return null
    return JSON.stringify(entry.def) === JSON.stringify(embedded) ? null : entry.def
  }

  /** Définitions embarquées que la bibliothèque a fait évoluer : le canevas les teinte. */
  const staleDefIds = computed(
    () =>
      new Set(
        Object.keys(doc.value.embeddedDefs).filter((id) => newerLibraryDefinition(id) !== null)
      )
  )

  function setInstancePosition(id: string, x: number, y: number): void {
    applyWithElasticWires('Déplacer le composant', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (instance) {
        instance.x = x
        instance.y = y
      }
    })
  }

  function setInstanceOrientation(id: string, rotation: Rotation, mirror: boolean): void {
    applyWithElasticWires('Orienter le composant', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (instance) {
        instance.rotation = rotation
        instance.mirror = mirror
      }
    })
  }

  // Vue

  /** Zoom par un facteur autour d'un point d'écran (par défaut le centre de la zone visible). */
  function zoomAround(factor: number, screenX?: number, screenY?: number): void {
    view.value = zoomedView(
      view.value,
      factor,
      screenX ?? viewport.value.width / 2,
      screenY ?? viewport.value.height / 2,
      profile.value.cellPx
    )
  }

  function resetZoom(): void {
    zoomAround(1 / view.value.zoom)
  }

  function panBy(dx: number, dy: number): void {
    view.value = pannedView(view.value, dx, dy)
  }

  function fitToContent(): void {
    view.value = fittingView(projectBounds(doc.value), viewport.value, profile.value.cellPx)
  }

  return {
    doc,
    filePath,
    tabs,
    activeTabId,
    anyDirty,
    pristine,
    selection,
    selectedWires,
    selectedLabels,
    tool,
    placement,
    drawing,
    currentColor,
    view,
    viewport,
    showPins,
    showUnconnected,
    showGroups,
    groups,
    hasGroups,
    canGroup,
    canUngroup,
    syncGroupSelection,
    expandSelectionToGroups,
    groupSelection,
    ungroupSelection,
    inspectorOpen,
    inspectorFloating,
    profilePreview,
    panKeyHeld,
    shiftHeld,
    ctrlHeld,
    altHeld,
    hoverWireId,
    status,
    undoLabel,
    redoLabel,
    dirty,
    profile,
    cellPx,
    placed,
    selectedInstances,
    sortedWires,
    pinRefs,
    connectivity,
    crossings,
    pieces,
    hoverNet,
    hasSelection,
    clipboardEmpty,
    undo,
    redo,
    newProject,
    openProject,
    openPath,
    restoreProject,
    markSaved,
    activateTab,
    cycleTab,
    moveTab,
    closeTab,
    dirtyDocuments,
    syncCurrentColor,
    setProjectName,
    setProfile,
    adoptGeneralProfile,
    followGeneralProfile,
    profileDiffs,
    followsGeneralProfile,
    updateDefinition,
    selectTool,
    startPlacing,
    stopPlacing,
    startWireTool,
    startTextTool,
    rotatePlacement,
    flipPlacement,
    placeAt,
    addLabel,
    addLabelBox,
    setLabelText,
    setLabelSize,
    setLabelBold,
    setLabelStyle,
    setLabelVertical,
    setLabelBox,
    setLabelAnchor,
    addWire,
    beginWire,
    appendWirePoints,
    popWireVertex,
    finishWire,
    stopWireDrawing,
    setWirePoints,
    addWireVertex,
    removeWireVertex,
    splitWire,
    selectNet,
    selectConnectedWires,
    crossingNear,
    recolorWires,
    setCurrentColor,
    addCustomColor,
    colorChoices,
    setWireFreeEnds,
    setWireEndLabel,
    removeWires,
    reorderWires,
    setInstancesBehindWires,
    restackSelection,
    toggleCrossing,
    clearSelection,
    revealInspector,
    selectAll,
    moveInstances,
    moveSelection,
    rotateSelection,
    flipSelection,
    rotate,
    flip,
    removeSelection,
    duplicateSelection,
    duplicateSelectionAt,
    copySelection,
    pasteClipboard,
    pasteClipboardAt,
    setInstanceLabel,
    setInstanceField,
    newerLibraryDefinition,
    staleDefIds,
    setInstancePosition,
    setInstanceOrientation,
    zoomAround,
    resetZoom,
    panBy,
    fitToContent
  }
})
