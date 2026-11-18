import { castDraft, current as snapshot, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  anchorPins,
  BARE_WIRE_COLOR,
  BARE_WIRE_COLOR_NAME,
  boardFaces,
  boardFootprints,
  boardsCarry,
  facesGap,
  loadOfBoards,
  spreadBoard,
  throughMarks,
  computeConnectivity,
  computeCrossings,
  createEmptyProject,
  crossingPieces,
  DEFAULT_VIEW,
  fittingView,
  flippedInstance,
  isEmptyProject,
  BASE_VARIANT,
  componentVariants,
  hasVariants,
  variantDefinition,
  insertVertex,
  sameComponentContent,
  stretchCounts,
  instanceDefinition,
  nearestWirePoint,
  instanceBounds,
  locateOnWire,
  nearestCrossing,
  nextNumberedId,
  normalizePoints,
  pannedView,
  placeReadout,
  projectBounds,
  profileDifferences,
  projectPins,
  projectStyleSheet,
  pruneCrossingOverrides,
  prunedStyles,
  regroupedCopies,
  removeVertex,
  isBoard,
  paletteChoices,
  recoloredCustom,
  removedCustom,
  restackedIds,
  sameColor,
  restretch,
  restyledLabelSize,
  rotatedInstance,
  sameLook,
  sameProfile,
  simplifyPoints,
  spanReadout,
  splitPoints,
  styleCounts,
  styleOf,
  styleSheet,
  textLabelBounds,
  toggledOverrides,
  translatePoints,
  turnedTextBox,
  unionRects,
  formatCells,
  jumperBulge,
  normalizedBulge,
  wireBounds,
  wireGeometryProblem,
  wireKindLabel,
  wireOutline,
  wireProblem,
  withGroup,
  withStyle,
  wiresFollowingJunctions,
  wiresFollowingPins,
  type StretchAxis,
  type StretchEnd,
  zoomedView,
  type ColorChoice,
  type ComponentDefinition,
  type ComponentInstance,
  type FaceLoad,
  type PinRef,
  type WireKind,
  type FlipAxis,
  type FreeEndStyle,
  type GridPoint,
  type LocalPoint,
  type GridRect,
  type Project,
  type Readout,
  type RotateDirection,
  type Rotation,
  type StyleProfile,
  type StyleSheet,
  type Styled,
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
  /** Variante qu'on pose ; null : la première. */
  variant: string | null
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
  /** Les styles propres que portent les éléments copiés : ils les suivent dans un autre montage. */
  styles: StyleProfile[]
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
  /** Onglet d'aperçu (voir tabs.ts) : titre en italique, remplacé par l'aperçu suivant. */
  preview: boolean
}

/** État d'édition qu'un onglet garde quand il n'est pas affiché. */
interface TabEditing {
  view: ViewState
  selection: string[]
  selectedWires: string[]
  selectedLabels: string[]
  currentColor: string
  bareColor: string
}

/** Montage modifié, pour la copie de secours ; `key` est l'identifiant de son onglet. */
export interface DirtyDocument {
  key: number
  project: Project
  originalPath: string | null
}

/** Couleurs personnalisées gardées par montage, les plus récentes d'abord. */
const MAX_CUSTOM_COLORS = 8
/** Place des fils dans la pile des composants : ceux d'avant sont derrière eux, les autres devant. */
const WIRES_IN_STACK = ':fils:'
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
  /**
   * Sorte du fil que trace l'outil Fil : le fil isolé (null), un fil nu ou un pont (décision du
   * 17 novembre 2026, voir wireKinds.ts du domaine).
   */
  const wireKind = ref<WireKind | null>(null)
  const currentColor = ref(library.defaultWireColor)
  /**
   * Couleur des prochains fils nus : l'étain, puis celle du dernier fil nu tracé ou recoloré. Un
   * fil nu a sa couleur à lui, à part de celle des fils isolés.
   */
  const bareColor = ref<string>(BARE_WIRE_COLOR)
  const clipboard = shallowRef<ClipboardData>({ items: [], wires: [], labels: [], styles: [] })
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
      currentColor: library.defaultWireColor,
      bareColor: BARE_WIRE_COLOR
    }),
    capture: () => ({
      view: view.value,
      selection: selection.value,
      selectedWires: selectedWires.value,
      selectedLabels: selectedLabels.value,
      currentColor: currentColor.value,
      bareColor: bareColor.value
    }),
    restore: (editing) => {
      view.value = editing.view
      selection.value = editing.selection
      selectedWires.value = editing.selectedWires
      selectedLabels.value = editing.selectedLabels
      currentColor.value = editing.currentColor
      bareColor.value = editing.bareColor
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
      dirty: tab.dirty,
      preview: tab.preview
    }))
  )
  /** Profil effectif pour l'affichage : l'aperçu de la boîte de dialogue, sinon celui du projet. */
  const profile = computed<StyleProfile>(() => profilePreview.value ?? doc.value.profile)
  const cellPx = computed(() => profile.value.cellPx * view.value.zoom)
  /** Les styles du dessin : celui du montage (ou son aperçu) et ceux propres à des éléments. */
  const styles = computed<StyleSheet>(() => styleSheet(profile.value, doc.value.styles))

  /** Le style avec lequel un élément se dessine : le sien, sinon celui du montage. */
  function styleFor(element: Styled): StyleProfile {
    return styleOf(styles.value, element)
  }
  /** Réglages où le style de ce montage s'écarte du profil général de l'application. */
  const profileDiffs = computed(() => profileDifferences(doc.value.profile, library.defaultProfile))
  const followsGeneralProfile = computed(() => profileDiffs.value.length === 0)
  const placed = computed<PlacedInstance[]>(() =>
    doc.value.components.flatMap((instance) => {
      // La définition telle que la dessine la variante choisie par l'exemplaire.
      const def = instanceDefinition(doc.value, instance)
      return def ? [{ instance, def }] : []
    })
  )
  const selectedInstances = computed(() =>
    doc.value.components.filter((instance) => selection.value.includes(instance.id))
  )
  const sortedWires = computed(() => [...doc.value.wires].sort((a, b) => a.stack - b.stack))
  /** Couleurs proposées pour les fils : la palette de l'application, puis celles du montage. */
  const colorChoices = computed(() => paletteChoices(library.palette, doc.value.customColors))
  /**
   * La palette porte-t-elle sur les fils nus ? Quand on en trace un, ou qu'on n'a sélectionné
   * qu'eux. Elle règle alors la couleur des prochains fils nus, pas celle des fils isolés.
   */
  const paletteOnBare = computed(() => {
    if (tool.value === 'wire') return wireKind.value === 'bare'
    if (selection.value.length > 0 || selectedLabels.value.length > 0) return false
    const picked = doc.value.wires.filter((wire) => selectedWires.value.includes(wire.id))
    return picked.length > 0 && picked.every((wire) => wire.kind === 'bare')
  })
  /** Couleur que la palette montre comme courante : celle des prochains fils, nus ou non. */
  const paletteColor = computed(() => (paletteOnBare.value ? bareColor.value : currentColor.value))
  /**
   * Couleurs que proposent le panneau et le clic droit : celles des fils, précédées de l'étain
   * quand la palette porte sur les fils nus, pour y revenir. La barre d'outils, elle, garde
   * les mêmes pastilles (`colorChoices`) : une pastille de plus la ferait passer à la ligne.
   */
  const paletteSwatches = computed<ColorChoice[]>(() =>
    paletteOnBare.value
      ? [{ hex: BARE_WIRE_COLOR, name: BARE_WIRE_COLOR_NAME, custom: false }, ...colorChoices.value]
      : colorChoices.value
  )
  /** Couleur du fil qu'on trace : celle des fils nus avec leur outil, sinon celle des fils. */
  const drawingColor = computed(() =>
    tool.value === 'wire' && wireKind.value === 'bare' ? bareColor.value : currentColor.value
  )
  /** Les plaques qui montrent leurs deux faces, et la correspondance de leurs trous. */
  const faces = computed(() => boardFaces(doc.value))
  const pinRefs = computed(() => projectPins(doc.value, faces.value))
  const connectivity = computed(() =>
    computeConnectivity(doc.value.wires, pinRefs.value, faces.value.twins)
  )
  /** Ce qui traverse une plaque à deux faces : les pastilles où une patte ou un fil ressort. */
  const throughs = computed(() => throughMarks(doc.value.wires, pinRefs.value, faces.value))
  /**
   * Empreintes : pour chaque composant qu'une plaque à deux faces porte et qui a des formes
   * d'empreinte, cette plaque. Elles se dessinent sur son autre face.
   */
  const footprints = computed(() => boardFootprints(doc.value, faces.value))
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

  /**
   * Ce que la barre d'état dit de la sélection : la place d'un composant ou d'une étiquette (le
   * coin supérieur gauche de sa boîte), le départ et l'arrivée d'un fil ; à plusieurs, leur nombre.
   */
  const selectionReadout = computed<Readout | null>(() => {
    const count = selection.value.length + selectedWires.value.length + selectedLabels.value.length
    if (count === 0) return null
    if (count > 1) return { kind: 'many', count }
    const instance = doc.value.components.find((entry) => entry.id === selection.value[0])
    if (instance) return placeReadout(instance.x, instance.y)
    const wire = doc.value.wires.find((entry) => entry.id === selectedWires.value[0])
    if (wire) return spanReadout(wire.points)
    const label = doc.value.labels.find((entry) => entry.id === selectedLabels.value[0])
    return label ? placeReadout(label.x, label.y) : null
  })

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
   * Toute commande passe ici ; au passage, les jonctions suivent les fils déplacés, les
   * exceptions de croisement orphelines sont élaguées et les styles propres que plus aucun
   * élément ne porte quittent le montage.
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
      const kept = prunedStyles(now)
      if (kept !== now.styles) draft.styles = castDraft([...kept])
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
    const before = doc.value
    const pinsBefore = pinRefs.value
    return apply(label, (draft) => {
      recipe(draft)
      settleWires(draft, before, pinsBefore, translatedWires)
    })
  }

  /**
   * Après qu'une commande a bougé des composants. D'abord les plaques emmènent ce qu'elles
   * portent (`boardsCarry` : composants enfichés, fils et étiquettes de leurs deux faces) ; puis
   * les extrémités de fil suivent leurs broches, et celles qui sont soudées à un trou d'une
   * plaque suivent ce trou.
   */
  function settleWires(
    draft: Draft<Project>,
    before: Project,
    pinsBefore: readonly PinRef[],
    translatedWires: ReadonlyMap<string, GridPoint> = new Map()
  ): void {
    const carried = boardsCarry(before, snapshot(draft) as Project, new Set(translatedWires.keys()))
    if (carried) {
      draft.components.forEach((instance, index) => {
        const moved = carried.instances.get(instance.id)
        if (moved) draft.components[index] = castDraft(moved)
      })
      for (const label of draft.labels) {
        const box = carried.labels.get(label.id)
        if (box) Object.assign(label, box)
      }
    }
    const ends = carried?.ends ?? []
    const adjusted = wiresFollowingPins(
      before.wires,
      [...pinsBefore, ...anchorPins(ends.map((end) => end.from))],
      [...projectPins(draft), ...anchorPins(ends.map((end) => end.to))],
      translatedWires,
      carried?.wires
    )
    if (adjusted.some((wire, index) => wire !== before.wires[index])) {
      draft.wires = castDraft(adjusted)
    }
  }

  /**
   * Ce qu'emmèneraient les plaques de la sélection si on la déplaçait : le canevas le montre
   * pendant le geste, la commande fait de même (voir boardCarry.ts).
   */
  function selectionLoad(): FaceLoad {
    return loadOfBoards(doc.value, {
      instances: new Set(selection.value),
      wires: new Set(selectedWires.value),
      labels: new Set(selectedLabels.value)
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

  /**
   * Couleur des prochains fils : celle du dernier fil du montage, sinon celle des paramètres ;
   * de même pour les fils nus, qui ont la leur : celle du dernier fil nu, sinon l'étain.
   */
  function syncCurrentColor(): void {
    const last = (bare: boolean): Wire | null =>
      doc.value.wires.reduce<Wire | null>(
        (best, wire) =>
          (wire.kind === 'bare') === bare && (best === null || wire.stack > best.stack)
            ? wire
            : best,
        null
      )
    currentColor.value = last(false)?.color ?? library.defaultWireColor
    bareColor.value = last(true)?.color ?? BARE_WIRE_COLOR
  }

  // Onglets

  function activateTab(id: number): void {
    if (base.activateTab(id)) status.value = ''
  }

  /** Montre un document dans un onglet : l'onglet actif s'il est vierge, sinon un nouveau. */
  function showInTab(
    project: Project,
    saved: Project | null,
    path: string | null,
    preview = false
  ): void {
    base.showInTab(project, saved, path, preview)
    syncCurrentColor()
  }

  function newProject(): void {
    const blank = blankProject()
    showInTab(blank, blank, null)
    status.value = ''
  }

  function openProject(project: Project, path: string, preview = false): void {
    showInTab(project, project, path, preview)
    status.value = ''
  }

  /**
   * Ouvre un fichier de projet par son chemin ; vrai si l'ouverture a réussi. Un fichier déjà
   * ouvert n'est pas relu : son onglet revient devant. Avec `preview` (un simple clic dans
   * l'onglet Fichiers du panneau latéral), il s'ouvre dans l'onglet d'aperçu, à la place de
   * l'aperçu précédent, et ne compte pas parmi les fichiers récents ; ouvert pour de bon, un
   * aperçu devient un onglet comme les autres.
   */
  async function openPath(path: string, options: { preview?: boolean } = {}): Promise<boolean> {
    const preview = options.preview === true
    const already = tabs.value.find((tab) => tab.filePath !== null && samePath(tab.filePath, path))
    if (already) {
      activateTab(already.id)
      status.value = `Déjà ouvert : ${path}`
      if (!preview && already.preview) {
        base.pinTab(already.id)
        await library.addRecentFile(path)
      }
      return true
    }
    try {
      const project = await readProject(path)
      openProject(project, path, preview)
      fitToContent()
      status.value = preview
        ? `Aperçu : ${path} — une modification ou un double-clic garde l’onglet.`
        : `Ouvert : ${path}`
      if (!preview) await library.addRecentFile(path)
      return true
    } catch (error) {
      status.value = `Ouverture impossible : ${error instanceof Error ? error.message : String(error)}`
      if (library.recentFiles.includes(path)) await library.removeRecentFile(path)
      return false
    }
  }

  /**
   * Garde un onglet d'aperçu (double-clic sur l'onglet) : il devient un onglet comme les autres,
   * et son fichier compte désormais parmi les fichiers récents.
   */
  function pinTab(id: number): void {
    const tab = tabs.value.find((candidate) => candidate.id === id)
    if (!tab?.preview) return
    base.pinTab(id)
    if (tab.filePath !== null) void library.addRecentFile(tab.filePath)
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

  /**
   * Change la variante de composants posés ; les fils posés sur leurs broches suivent, les broches
   * gardant leur identifiant d'une variante à l'autre.
   */
  function setInstancesVariant(ids: readonly string[], variantId: string): void {
    const targets = doc.value.components.filter(
      (instance) => ids.includes(instance.id) && (instance.variant ?? BASE_VARIANT) !== variantId
    )
    if (targets.length === 0) return
    const changed = new Set(targets.map((instance) => instance.id))
    applyWithElasticWires('Changer de variante', (draft) => {
      for (const instance of draft.components) {
        if (!changed.has(instance.id)) continue
        if (variantId === BASE_VARIANT) delete instance.variant
        else instance.variant = variantId
      }
    })
  }

  /**
   * Étire un composant extensible à `count` motifs (décision du 17 novembre 2026) dans un de
   * ses sens (`axis` ; sans lui, le premier où il s'étire), le bout `fixed` restant en place :
   * son début quand on tire la poignée de fin ou qu'on tape le nombre, sa fin quand on tire la
   * poignée de début. Les fils soudés à ses broches suivent ; ceux d'une broche qui disparaît
   * restent où ils sont, bout libre. Les valeurs des textes variables suivent leur texte, comme
   * les broches. Faux si rien ne change.
   */
  function setInstanceCount(
    id: string,
    count: number,
    fixed: StretchEnd = 'start',
    axis?: StretchAxis
  ): boolean {
    const change = restretch(doc.value, id, count, fixed, axis)
    if (!change) return false
    const before = doc.value
    const fieldsBefore = doc.value.components.find((instance) => instance.id === id)?.fields
    return apply('Étirer le composant', (draft) => {
      const target = draft.components.find((instance) => instance.id === id)
      if (!target) return
      if (change.instance.countX !== undefined) target.countX = change.instance.countX
      if (change.instance.countY !== undefined) target.countY = change.instance.countY
      target.x = change.instance.x
      target.y = change.instance.y
      // Les valeurs des textes variables suivent leur texte.
      if (change.instance.fields !== fieldsBefore) target.fields = { ...change.instance.fields }
      settleWires(draft, before, change.pinsBefore)
    })
  }

  /** Une plaque à trous montre son dessous à côté de son dessus, ou cesse de le montrer. */
  function setInstanceUnderside(id: string, shown: boolean): void {
    const target = doc.value.components.find((instance) => instance.id === id)
    if (!target || (target.underside === true) === shown) return
    apply(shown ? 'Montrer le dessous' : 'Masquer le dessous', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (!instance) return
      if (shown) instance.underside = true
      else delete instance.underside
    })
    status.value = shown
      ? 'Dessous de la plaque montré à côté d’elle, vu retourné : les fils s’y soudent.'
      : 'Dessous de la plaque masqué.'
  }

  /**
   * Déplace une plaque à deux faces par rapport à son pli (décision du 18 novembre 2026 : Ctrl
   * pendant qu'on la glisse). Le pli reste où il est : le dessus va de (`dx`, `dy`), le dessous
   * fait le geste en miroir, et les deux faces s'écartent du pli, ou s'en rapprochent, d'autant
   * l'une que l'autre ; poussée au-delà du pli, la plaque passe de l'autre côté et son dessous
   * prend sa place (`spreadBoard`). Ce que la plaque porte suit sa face. Faux si rien ne change.
   */
  function spreadBoardFaces(id: string, dx: number, dy: number): boolean {
    const instance = doc.value.components.find((candidate) => candidate.id === id)
    const def = instance ? instanceDefinition(doc.value, instance) : undefined
    const moved = instance && def ? spreadBoard(instance, def, dx, dy) : null
    if (!instance || !moved) return false
    const gap = facesGap(moved)
    const before = facesGap(instance)
    const spread = gap !== before
    // Le dessous a changé de côté : la plaque a franchi son pli.
    const crossed = gap < 0 !== before < 0
    const done = applyWithElasticWires(
      crossed
        ? 'Passer la plaque de l’autre côté du pli'
        : spread
          ? 'Écarter les faces de la plaque'
          : 'Déplacer la sélection',
      (draft) => {
        const index = draft.components.findIndex((candidate) => candidate.id === id)
        if (index >= 0) draft.components[index] = castDraft(moved)
      }
    )
    if (done && crossed) {
      status.value = `Dessous de la plaque à ${gap < 0 ? 'gauche' : 'droite'}, à ${Math.abs(gap)} cellules.`
    } else if (done && spread) {
      status.value = `Faces de la plaque à ${Math.abs(gap)} cellules l’une de l’autre.`
    }
    return done
  }

  /** Remplace la définition embarquée par celle de la bibliothèque (même identifiant). */
  function updateDefinition(def: ComponentDefinition): void {
    applyWithElasticWires(`Mettre à jour ${def.name}`, (draft) => {
      draft.embeddedDefs[def.id] = castDraft(structuredClone(def))
    })
  }

  // Styles propres : une partie du montage dessinée avec un autre profil que le sien.

  function byName(a: StyleProfile, b: StyleProfile): number {
    return a.name.localeCompare(b.name, 'fr')
  }

  /**
   * Styles qu'on peut donner à une sélection : les profils enregistrés, puis ceux que le montage
   * porte sans qu'un profil enregistré ait leur nom (montage venu d'ailleurs, profil supprimé
   * depuis). Le profil enregistré qui est déjà le style du montage n'y figure pas : « celui du
   * montage » le propose.
   */
  const styleChoices = computed<StyleProfile[]>(() => {
    const base = doc.value.profile
    const embedded = new Set(doc.value.styles.map((style) => style.name))
    const saved = library.savedProfiles.filter(
      (candidate) =>
        embedded.has(candidate.name) || candidate.name !== base.name || !sameLook(candidate, base)
    )
    const names = new Set(saved.map((candidate) => candidate.name))
    return [...saved, ...doc.value.styles.filter((style) => !names.has(style.name))].sort(byName)
  })

  /** Styles que portent les éléments sélectionnés, sans doublon ; null : celui du montage. */
  const selectionStyles = computed<(string | null)[]>(() => {
    const names = new Set<string | null>()
    const add = (elements: readonly (Styled & { id: string })[], ids: readonly string[]): void => {
      for (const element of elements) if (ids.includes(element.id)) names.add(element.style ?? null)
    }
    add(doc.value.components, selection.value)
    add(doc.value.wires, selectedWires.value)
    add(doc.value.labels, selectedLabels.value)
    return [...names]
  })

  /** Les styles propres du montage et le nombre d'éléments qui portent chacun. */
  const styleUsage = computed(() => {
    const counts = styleCounts(doc.value)
    return doc.value.styles.map((style) => ({
      name: style.name,
      count: counts.get(style.name) ?? 0
    }))
  })

  /** Profil enregistré qui ne dessine plus comme la copie que le montage a sous ce nom. */
  function newerSavedStyle(name: string): StyleProfile | null {
    const embedded = doc.value.styles.find((style) => style.name === name)
    const saved = library.savedProfiles.find((candidate) => candidate.name === name)
    return embedded && saved && !sameLook(embedded, saved) ? saved : null
  }

  /**
   * Donne un profil de style à la sélection, ou la rend au style du montage (`null`). Le montage
   * garde une copie du profil sous son nom ; s'il en avait une qui n'est plus la même, elle est
   * remplacée et tous les éléments qui la portent suivent, comme la définition d'un composant
   * qu'on repose. Une étiquette garde sa taille en multiples de la police des libellés.
   */
  function setSelectionStyle(profile: StyleProfile | null): void {
    if (!hasSelection.value) return
    const before = projectStyleSheet(doc.value)
    const name = profile?.name
    const embedded = doc.value.styles.find((style) => style.name === name)
    const refresh = profile !== null && (!embedded || !sameProfile(embedded, profile))
    const instanceIds = new Set(selection.value)
    const wireIds = new Set(selectedWires.value)
    const labelIds = new Set(selectedLabels.value)
    const restyle = (element: Draft<Styled>): void => {
      if (name === undefined) delete element.style
      else element.style = name
    }
    apply(profile ? `Style « ${profile.name} »` : 'Style du montage', (draft) => {
      if (profile && refresh) {
        const copy = castDraft(structuredClone(profile))
        const index = draft.styles.findIndex((style) => style.name === profile.name)
        if (index >= 0) draft.styles[index] = copy
        else draft.styles.push(copy)
      }
      for (const instance of draft.components) if (instanceIds.has(instance.id)) restyle(instance)
      for (const wire of draft.wires) if (wireIds.has(wire.id)) restyle(wire)
      for (const label of draft.labels) {
        const old = styleOf(before, label)
        if (labelIds.has(label.id)) restyle(label)
        const next =
          label.style === undefined ? before.base : label.style === name && profile ? profile : old
        label.size = restyledLabelSize(label.size, old, next)
      }
    })
    // La grille est commune : d'un profil dont la cellule diffère, on prend tout sauf elle.
    const cellKept = profile !== null && profile.cellPx !== before.base.cellPx
    status.value = profile
      ? `Style « ${profile.name} » donné à la sélection${cellKept ? ' ; la taille de cellule reste celle du montage' : ''}.`
      : 'La sélection reprend le style du montage.'
  }

  /** Remplace la copie d'un style par le profil enregistré du même nom : ses éléments suivent. */
  function updateStyle(profile: StyleProfile): void {
    const embedded = doc.value.styles.find((style) => style.name === profile.name)
    if (!embedded || sameProfile(embedded, profile)) return
    apply(`Mettre à jour le style « ${profile.name} »`, (draft) => {
      const index = draft.styles.findIndex((style) => style.name === profile.name)
      if (index >= 0) draft.styles[index] = castDraft(structuredClone(profile))
      for (const label of draft.labels) {
        if (label.style === profile.name) {
          label.size = restyledLabelSize(label.size, embedded, profile)
        }
      }
    })
  }

  /** Sélectionne tous les éléments qui portent ce style propre. */
  function selectStyled(name: string): void {
    const ids = (elements: readonly (Styled & { id: string })[]): string[] =>
      elements.filter((element) => element.style === name).map((element) => element.id)
    selection.value = ids(doc.value.components)
    selectedWires.value = ids(doc.value.wires)
    selectedLabels.value = ids(doc.value.labels)
  }

  // Outils

  function selectTool(): void {
    tool.value = 'select'
    placement.value = null
    stopWireDrawing()
  }

  /** Démarre la pose d'un composant, dans une de ses variantes (la première par défaut). */
  function startPlacing(def: ComponentDefinition, variantId: string | null = null): void {
    const chosen = def.variants?.find((candidate) => candidate.id === variantId)
    placement.value = { def, variant: chosen?.id ?? null, rotation: 0, mirror: false }
    stopWireDrawing()
    tool.value = 'place'
    clearSelection()
    const shownId = chosen?.id ?? BASE_VARIANT
    const variantName = componentVariants(def).find((variant) => variant.id === shownId)?.name
    const name = hasVariants(def) ? `${def.name} (${variantName})` : def.name
    status.value = `Pose de ${name} : clic pour poser, R et T pour tourner et retourner, Échap pour arrêter.`
  }

  function stopPlacing(): void {
    placement.value = null
    if (tool.value === 'place') tool.value = 'select'
  }

  /** L'outil Fil, pour un fil isolé (par défaut), un fil nu ou un pont. */
  function startWireTool(kind: WireKind | null = null): void {
    tool.value = 'wire'
    placement.value = null
    stopWireDrawing()
    wireKind.value = kind
    clearSelection()
    status.value =
      kind === 'jumper'
        ? 'Pont : clic au départ, clic à l’arrivée. Il se bombe à gauche de son sens de tracé.'
        : kind === 'bare'
          ? 'Fil nu : il se trace comme un fil, et se soude à toutes les broches sur son trajet.'
          : 'Fil : clic sur une broche ou une intersection pour partir, clic pour chaque coude, Alt trace à 45°, Maj inverse l’ordre, double-clic ou Entrée pour finir.'
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
    const refresh = !embedded || !sameComponentContent(embedded, def)
    const shape = variantDefinition(def, current.variant)
    const counts = stretchCounts(shape)
    applyWithElasticWires(`Poser ${def.name}`, (draft) => {
      if (refresh) draft.embeddedDefs[def.id] = castDraft(structuredClone(def))
      // Une plaque à trous se pose sous tout le reste : les composants vont dessus.
      const add = (instance: ComponentInstance): void => {
        if (isBoard(shape)) draft.components.unshift(instance)
        else draft.components.push(instance)
      }
      add({
        id,
        defId: def.id,
        x,
        y,
        rotation: current.rotation,
        mirror: current.mirror,
        label: '',
        fields: {},
        // Un composant se pose derrière les fils : ceux qu'on trace sur lui restent visibles.
        behindWires: true,
        ...(current.variant === null ? {} : { variant: current.variant }),
        // Un composant extensible garde ses nombres de motifs, un par sens où il s'étire, même
        // si sa définition change ensuite de nombres de départ.
        ...(shape.stretch?.x ? { countX: counts.x } : {}),
        ...(shape.stretch?.y ? { countY: counts.y } : {})
      })
    })
    status.value = hasVariants(def)
      ? `${def.name} posé : sa variante se change par le clic droit ou dans le panneau.`
      : `${def.name} posé.`
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

  /**
   * Crée un fil à partir de sommets bruts ; retourne son identifiant, ou null s'il est invalide.
   * `kind` : un fil nu, ou un pont, qui ne garde que son départ et son arrivée. Sans `color`,
   * le fil prend la couleur des prochains fils de sa sorte.
   */
  function addWire(
    points: readonly GridPoint[],
    color: string | null = null,
    kind: WireKind | null = null
  ): string | null {
    const ink = color ?? (kind === 'bare' ? bareColor.value : currentColor.value)
    const first = points[0]
    const last = points.at(-1)
    const clean = kind === 'jumper' && first && last ? [first, last] : simplifyPoints(points)
    const wireKindOf = kind ?? undefined
    if (clean.length < 2 || wireProblem({ points: clean, kind: wireKindOf }) !== null) return null
    const id = nextWireId()
    const stack = nextStack()
    const label =
      kind === 'jumper' ? 'Poser un pont' : kind === 'bare' ? 'Tracer un fil nu' : 'Tracer un fil'
    apply(label, (draft) => {
      draft.wires.push({
        id,
        color: ink,
        points: castDraft(clean),
        stack,
        freeEnds: 'flat',
        endLabels: { start: '', end: '' },
        ...(kind === null ? {} : { kind })
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

  /** Second clic de l'outil Pont : le pont va du départ à ce point, tout de suite. */
  function finishJumper(point: GridPoint): string | null {
    const start = drawing.value?.points[0]
    if (!start) return null
    drawing.value = { points: [start, point] }
    return finishWire()
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
    const id = addWire(current.points, null, wireKind.value)
    if (id) {
      status.value = `${wireKindLabel(wireKind.value ?? undefined)} tracé. Clic pour en commencer un autre, V pour revenir à la sélection.`
    }
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
    const kind = doc.value.wires.find((candidate) => candidate.id === id)?.kind
    // Un pont n'a que ses deux bouts : rien à remettre en ordre.
    const clean = kind === 'jumper' ? [...points] : normalizePoints(points)
    if (clean.length < 2 || wireProblem({ points: clean, kind }) !== null) return
    apply('Modifier le fil', (draft) => {
      const wire = draft.wires.find((candidate) => candidate.id === id)
      if (wire) wire.points = castDraft(clean)
    })
  }

  /** Ajoute un sommet au milieu d'un segment du fil : rien ne bouge, il reste à le glisser. */
  function addWireVertex(id: string, point: GridPoint): void {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    // Un pont n'a pas de sommets : seulement ses deux bouts.
    const points = wire && wire.kind !== 'jumper' ? insertVertex(wire.points, point) : null
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
   * Ctrl+clic sur un fil : un sommet de plus sur la partie droite visée, ou le coin visé en moins
   * s'il laisse un fil valide. Vrai si le fil a changé.
   */
  function toggleWireVertex(id: string, point: LocalPoint): boolean {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    if (wire?.kind === 'jumper') return false
    const spot = wire ? nearestWirePoint(wire.points, point) : null
    if (!wire || !spot || spot.location.kind === 'end') return false
    const before = wire.points
    if (spot.location.kind === 'segment') addWireVertex(id, spot.point)
    else removeWireVertex(id, spot.location.index)
    const changed = doc.value.wires.find((candidate) => candidate.id === id)?.points !== before
    if (!changed)
      status.value = 'Ce coin ne se retire pas : ses deux voisins ne peuvent pas se rejoindre.'
    return changed
  }

  /**
   * Double-clic sur un fil : l'outil Fil démarre un nouveau fil à ce point, qui sera raccordé au
   * premier par une jonction (une extrémité posée sur un fil).
   */
  function startWireFrom(point: GridPoint): void {
    clearSelection()
    startWireTool()
    beginWire(point)
    status.value =
      'Nouveau fil raccordé : clic pour chaque coude, double-clic ou Entrée pour finir.'
  }

  /**
   * Coupe un fil en deux à un point qui lui appartient. Rien ne change à l'œil : les deux morceaux
   * se touchent, donc restent reliés, mais chacun se sélectionne, se déplace ou se supprime seul.
   * Le second morceau passe juste au-dessus du premier et garde l'étiquette de l'arrivée ; les
   * exceptions de croisement posées sur lui le suivent. Retourne son identifiant.
   */
  function splitWire(id: string, point: GridPoint): string | null {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    // Un pont ne se coupe pas : il n'a rien entre ses deux bouts.
    const parts = wire && wire.kind !== 'jumper' ? splitPoints(wire.points, point) : null
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
        // Le second morceau reste dans le groupe du fil coupé, garde son style et sa sorte.
        ...(wire.kind === undefined ? {} : { kind: wire.kind }),
        ...(wire.group === undefined ? {} : { group: wire.group }),
        ...(wire.style === undefined ? {} : { style: wire.style })
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

  /**
   * Un clic sur une couleur (barre d'outils, panneau, clic droit) : elle devient celle des
   * prochains fils, des prochains fils nus quand la palette porte sur eux (`paletteOnBare`), et
   * recolore les fils sélectionnés. L'outil Fil nu en main, recliquer la couleur courante
   * revient à l'étain : la barre d'outils n'a pas de pastille pour lui.
   */
  function setCurrentColor(color: string): void {
    let picked = color
    if (!paletteOnBare.value) {
      currentColor.value = color
    } else if (tool.value !== 'wire') {
      bareColor.value = color
    } else if (sameColor(bareColor.value, color) && !sameColor(color, BARE_WIRE_COLOR)) {
      picked = BARE_WIRE_COLOR
      bareColor.value = picked
      status.value = 'Prochains fils nus en étain.'
    } else {
      bareColor.value = color
      status.value = 'Prochains fils nus de cette couleur ; la recliquer revient à l’étain.'
    }
    recolorWires(selectedWires.value, picked)
  }

  /**
   * Remplace une couleur de ce montage par une autre (clic droit sur sa pastille,
   * « Modifier… ») : une commande. Seule la pastille change, les fils déjà tracés gardent leur
   * couleur. Les couleurs de l'application ne se modifient que dans les paramètres.
   */
  function changeColorChoice(hex: string, next: string): void {
    const colors = recoloredCustom(library.palette, doc.value.customColors, hex, next)
    if (!colors) {
      if (!sameColor(hex, next) && doc.value.customColors.some((color) => sameColor(color, hex))) {
        status.value = 'Cette couleur est déjà dans la palette.'
      }
      return
    }
    apply('Modifier une couleur', (draft) => {
      draft.customColors = colors
    })
    if (sameColor(currentColor.value, hex)) currentColor.value = next
    if (sameColor(bareColor.value, hex)) bareColor.value = next
  }

  /**
   * Retire une couleur de ce montage (clic droit sur sa pastille, « Supprimer ») : une commande.
   * Les fils de cette couleur la gardent. Les couleurs de l'application ne se suppriment que
   * dans les paramètres.
   */
  function removeColorChoice(hex: string): void {
    const colors = removedCustom(doc.value.customColors, hex)
    if (!colors) return
    const rest = colorChoices.value.filter((choice) => !sameColor(choice.hex, hex))
    apply('Supprimer une couleur', (draft) => {
      draft.customColors = colors
    })
    // La couleur des prochains fils n'est plus proposée : on passe à la première qui l'est.
    const fallback = rest[0]
    if (fallback && sameColor(currentColor.value, hex)) currentColor.value = fallback.hex
    // Les prochains fils nus reviennent à l'étain.
    if (sameColor(bareColor.value, hex)) bareColor.value = BARE_WIRE_COLOR
  }

  /**
   * Fait de fils isolés des fils nus, ou l'inverse (`bare` ou null). Un pont reste un pont : sa
   * géométrie n'est pas celle d'un fil. Le fil prend la couleur des prochains fils de sa
   * nouvelle sorte : l'étain (ou la dernière couleur de fil nu) en devenant nu, celle des fils
   * en redevenant isolé.
   */
  function setWiresKind(ids: readonly string[], kind: 'bare' | null): void {
    const wanted = kind ?? undefined
    const changing = doc.value.wires.filter(
      (wire) => ids.includes(wire.id) && wire.kind !== 'jumper' && wire.kind !== wanted
    )
    if (changing.length === 0) return
    const targets = new Set(changing.map((wire) => wire.id))
    const color = kind === 'bare' ? bareColor.value : currentColor.value
    apply(kind === 'bare' ? 'Fil nu' : 'Fil isolé', (draft) => {
      for (const wire of draft.wires) {
        if (!targets.has(wire.id)) continue
        if (kind === 'bare') wire.kind = 'bare'
        else delete wire.kind
        wire.color = color
      }
    })
  }

  /**
   * Donne son bombé à un pont (Ctrl+glisser sur sa courbe, champ « Courbure » du panneau) : en
   * cellules, positif à gauche de son sens de tracé, négatif à droite ; ramené au pas et entre
   * les bornes. Le pont le garde ensuite, quelle que soit sa longueur.
   */
  function setJumperBulge(id: string, bulge: number): void {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    if (wire?.kind !== 'jumper') return
    const current = jumperBulge(wire.points, wire.bulge)
    const wanted = normalizedBulge(bulge, current)
    if (wanted === current) return
    apply('Courber le pont', (draft) => {
      const target = draft.wires.find((candidate) => candidate.id === id)
      if (target) target.bulge = wanted
    })
    const size = Math.abs(wanted)
    status.value = `Pont bombé de ${formatCells(size)} cellule${size >= 2 ? 's' : ''}.`
  }

  /** Retourne un pont : ses bouts échangés, il se bombe de l'autre côté, d'autant. */
  function flipJumper(id: string): void {
    const wire = doc.value.wires.find((candidate) => candidate.id === id)
    if (wire?.kind !== 'jumper') return
    apply('Retourner le pont', (draft) => {
      const target = draft.wires.find((candidate) => candidate.id === id)
      if (!target) return
      target.points.reverse()
      const { start, end } = target.endLabels
      target.endLabels = { start: end, end: start }
    })
    status.value = 'Pont bombé de l’autre côté.'
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
    const order = restackedIds(
      sortedWires.value.map((wire) => wire.id),
      ids,
      move
    )
    const rank = new Map(order.map((id, index) => [id, index]))
    apply('Ordre des fils', (draft) => {
      for (const wire of draft.wires) wire.stack = rank.get(wire.id) ?? wire.stack
    })
  }

  /**
   * Ordre des composants sélectionnés dans la pile du montage (décision du 17 novembre 2026). La
   * pile va des composants derrière les fils, dans l'ordre de la liste, aux composants devant
   * eux ; les fils y tiennent une seule place, entre les deux. Avancer le composant le plus haut
   * de derrière le fait donc passer devant les fils, reculer le plus bas de devant le ramène
   * derrière ; « Premier plan » met devant tout, fils compris, « Arrière-plan » derrière tout.
   * Il n'y a pas d'autre réglage pour la couche d'un composant (`behindWires`) : l'ordre suffit.
   */
  function reorderInstances(move: StackMove): void {
    const ids = new Set(selection.value)
    if (ids.size === 0) return
    const components = doc.value.components
    const stack = [
      ...components.filter((instance) => instance.behindWires).map((instance) => instance.id),
      WIRES_IN_STACK,
      ...components.filter((instance) => !instance.behindWires).map((instance) => instance.id)
    ]
    const restacked = restackedIds(stack, ids, move)
    if (restacked.join(' ') === stack.join(' ')) return
    const behind = new Set(restacked.slice(0, restacked.indexOf(WIRES_IN_STACK)))
    const rank = new Map(restacked.map((id, index) => [id, index]))
    const crossed = components.find(
      (instance) => ids.has(instance.id) && instance.behindWires !== behind.has(instance.id)
    )
    apply('Ordre des composants', (draft) => {
      draft.components.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      for (const instance of draft.components) instance.behindWires = behind.has(instance.id)
    })
    // Passer les fils se dit : rien d'autre ne le montre quand aucun fil ne croise le composant.
    if (crossed) {
      status.value = behind.has(crossed.id)
        ? 'Derrière les fils : ils restent visibles sur le composant.'
        : 'Devant les fils : le composant cache ceux qui passent dessous.'
    }
  }

  /**
   * Ctrl+Page haut / bas sur la sélection : les fils avancent ou reculent entre eux, les
   * composants dans leur pile, où ils peuvent passer devant ou derrière les fils
   * (`reorderInstances`).
   */
  function restackSelection(move: StackMove): void {
    reorderWires(move)
    reorderInstances(move)
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
    // Ce que porte une plaque sélectionnée tourne avec elle, autour d'elle, et non sur soi-même,
    // même sélectionné : la plaque l'emmène (`settleWires`).
    const boards = selectedInstances.value.filter((instance) => {
      const def = instanceDefinition(doc.value, instance)
      return def !== undefined && isBoard(def)
    })
    const carried = new Set(
      loadOfBoards(doc.value, {
        instances: new Set(boards.map((board) => board.id)),
        wires: new Set(),
        labels: new Set()
      }).instances
    )
    const updates = new Map<string, ComponentInstance>()
    for (const instance of selectedInstances.value) {
      if (carried.has(instance.id)) continue
      const def = instanceDefinition(doc.value, instance)
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
    const items = selectedInstances.value.flatMap((instance) => {
      const def = doc.value.embeddedDefs[instance.defId]
      return def ? [{ instance, def }] : []
    })
    const wires = doc.value.wires.filter((wire) => selectedWires.value.includes(wire.id))
    const labels = doc.value.labels.filter((label) => selectedLabels.value.includes(label.id))
    // Les styles propres des éléments copiés les accompagnent.
    const used = styleCounts({ components: items.map((item) => item.instance), wires, labels })
    const styles = doc.value.styles.filter((style) => used.has(style.name))
    return { items, wires, labels, styles }
  }

  function insertCopies(data: ClipboardData, dx: number, dy: number, label: string): void {
    if (data.items.length === 0 && data.wires.length === 0 && data.labels.length === 0) return
    // Styles propres : ceux qui manquent à ce montage arrivent avec les copies ; un style du
    // même nom déjà là est gardé, les copies le prennent. Une copie dont le style n'est nulle
    // part suit le style du montage.
    const known = new Set(doc.value.styles.map((style) => style.name))
    const newStyles = data.styles.filter((style) => !known.has(style.name))
    for (const style of newStyles) known.add(style.name)
    const styled = <T extends Styled>(element: T): T =>
      element.style !== undefined && !known.has(element.style)
        ? withStyle(element, undefined)
        : element
    const instanceIds = doc.value.components.map((instance) => instance.id)
    const copies: ClipboardItem[] = []
    for (const item of data.items) {
      const id = nextNumberedId('c', [...instanceIds, ...copies.map((copy) => copy.instance.id)])
      copies.push({
        def: item.def,
        instance: {
          ...styled(item.instance),
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
      wireCopies.push({
        ...styled(wire),
        id,
        stack: stack++,
        points: translatePoints(wire.points, dx, dy)
      })
    }
    const labelIds = doc.value.labels.map((entry) => entry.id)
    const labelCopies: TextLabel[] = []
    for (const entry of data.labels) {
      const id = nextNumberedId('t', [...labelIds, ...labelCopies.map((copy) => copy.id)])
      labelCopies.push({ ...styled(entry), id, x: entry.x + dx, y: entry.y + dy })
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
      for (const style of newStyles) draft.styles.push(castDraft(structuredClone(style)))
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
      const bounds = wireBounds(wireOutline(wire))
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
    return sameComponentContent(entry.def, embedded) ? null : entry.def
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
    wireKind,
    currentColor,
    bareColor,
    paletteOnBare,
    paletteColor,
    paletteSwatches,
    drawingColor,
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
    styles,
    styleFor,
    styleChoices,
    selectionStyles,
    styleUsage,
    newerSavedStyle,
    setSelectionStyle,
    updateStyle,
    selectStyled,
    placed,
    selectedInstances,
    sortedWires,
    pinRefs,
    faces,
    throughs,
    footprints,
    selectionLoad,
    connectivity,
    crossings,
    pieces,
    hoverNet,
    hasSelection,
    selectionReadout,
    clipboardEmpty,
    undo,
    redo,
    newProject,
    openProject,
    openPath,
    restoreProject,
    markSaved,
    activateTab,
    pinTab,
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
    setInstancesVariant,
    setInstanceCount,
    setInstanceUnderside,
    spreadBoardFaces,
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
    finishJumper,
    setJumperBulge,
    stopWireDrawing,
    setWirePoints,
    addWireVertex,
    toggleWireVertex,
    startWireFrom,
    removeWireVertex,
    splitWire,
    selectNet,
    selectConnectedWires,
    crossingNear,
    recolorWires,
    setCurrentColor,
    addCustomColor,
    changeColorChoice,
    removeColorChoice,
    colorChoices,
    setWireFreeEnds,
    setWiresKind,
    flipJumper,
    setWireEndLabel,
    removeWires,
    reorderWires,
    restackSelection,
    reorderInstances,
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
