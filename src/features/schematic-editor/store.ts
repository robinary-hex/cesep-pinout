import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  computeConnectivity,
  computeCrossings,
  createEmptyProject,
  crossingPieces,
  flippedInstance,
  instanceBounds,
  nearestCrossing,
  nextNumberedId,
  normalizePoints,
  projectBounds,
  projectPins,
  pruneCrossingOverrides,
  rotatedInstance,
  simplifyPoints,
  textLabelBounds,
  toggledOverrides,
  translatePoints,
  unionRects,
  wireBounds,
  wireGeometryProblem,
  wiresFollowingPins,
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
  type TextLabel,
  type Wire
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { readProject } from '@/io/projectFiles'
import { History } from '@/state/history'

export type SchematicTool = 'select' | 'place' | 'wire' | 'text'
export type StackMove = 'up' | 'down' | 'top' | 'bottom'

export interface Placement {
  def: ComponentDefinition
  rotation: Rotation
  mirror: boolean
}

export interface ViewState {
  /** Facteur appliqué à la taille de cellule du profil. */
  zoom: number
  /** Position, en pixels d'écran, de l'origine de la grille. */
  panX: number
  panY: number
}

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

const MIN_ZOOM = 0.2
const MAX_ZOOM = 6
const FIT_MARGIN_CELLS = 2
const CROSSING_PICK_CELLS = 0.6
const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 80, panY: 80 }

/**
 * Montage en cours d'édition. Le projet est immuable ; chaque commande passe par l'historique.
 * Le store porte aussi l'état de vue (zoom, pan) et l'état des outils, pour que la barre
 * d'outils, le clavier et le canevas agissent sur la même chose.
 */
export const useSchematicStore = defineStore('schematic', () => {
  const library = useLibraryStore()
  const history = new History<Project>(
    createEmptyProject('Nouveau montage', library.defaultProfile)
  )

  const doc = shallowRef<Project>(history.value)
  const savedDoc = shallowRef<Project | null>(null)
  const filePath = ref<string | null>(null)
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
  const showPins = ref(true)
  const showUnconnected = ref(true)
  /** Panneau de propriétés à droite : replié par défaut (touche I). */
  const inspectorOpen = ref(false)
  /** Profil en cours d'édition dans la boîte de dialogue : affiché à la place de celui du projet. */
  const profilePreview = shallowRef<StyleProfile | null>(null)
  const panKeyHeld = ref(false)
  const shiftHeld = ref(false)
  const hoverWireId = ref<string | null>(null)
  const status = ref('')
  const undoLabel = ref<string | null>(null)
  const redoLabel = ref<string | null>(null)

  const dirty = computed(() => doc.value !== savedDoc.value)
  /** Profil effectif pour l'affichage : l'aperçu de la boîte de dialogue, sinon celui du projet. */
  const profile = computed<StyleProfile>(() => profilePreview.value ?? doc.value.profile)
  const cellPx = computed(() => profile.value.cellPx * view.value.zoom)
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

  function sync(): void {
    doc.value = history.value
    undoLabel.value = history.undoLabel
    redoLabel.value = history.redoLabel
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

  /** Toute commande passe ici ; les exceptions de croisement orphelines sont élaguées au passage. */
  function apply(label: string, recipe: (draft: Draft<Project>) => void): boolean {
    const changed = history.apply(label, (draft) => {
      recipe(draft)
      const pruned = pruneCrossingOverrides(draft.crossingOverrides, computeCrossings(draft.wires))
      if (pruned.length !== draft.crossingOverrides.length) {
        draft.crossingOverrides = castDraft(pruned)
      }
    })
    if (changed) sync()
    return changed
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
    const label = history.undo()
    if (label === null) return
    sync()
    status.value = `Annulé : ${label}`
  }

  function redo(): void {
    const label = history.redo()
    if (label === null) return
    sync()
    status.value = `Rétabli : ${label}`
  }

  function clearSelection(): void {
    selection.value = []
    selectedWires.value = []
    selectedLabels.value = []
  }

  // Fichier

  /** Couleur des prochains fils : celle du dernier fil du montage, sinon celle des paramètres. */
  function syncCurrentColor(): void {
    const last = history.value.wires.reduce<Wire | null>(
      (best, wire) => (best === null || wire.stack > best.stack ? wire : best),
      null
    )
    currentColor.value = last?.color ?? library.defaultWireColor
  }

  function resetEditing(): void {
    syncCurrentColor()
    clearSelection()
    placement.value = null
    // Le document change : un tracé en cours n'a plus de sens, il est abandonné.
    drawing.value = null
    tool.value = 'select'
  }

  function newProject(): void {
    history.reset(createEmptyProject('Nouveau montage', library.defaultProfile))
    savedDoc.value = null
    filePath.value = null
    resetEditing()
    view.value = { ...DEFAULT_VIEW }
    status.value = ''
    sync()
  }

  function openProject(project: Project, path: string): void {
    history.reset(project)
    savedDoc.value = project
    filePath.value = path
    resetEditing()
    status.value = ''
    sync()
  }

  /** Ouvre un fichier de projet par son chemin ; vrai si l'ouverture a réussi. */
  async function openPath(path: string): Promise<boolean> {
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

  /** Reprend une copie de secours : le projet s'ouvre comme non enregistré. */
  function restoreProject(project: Project, originalPath: string | null): void {
    history.reset(project)
    savedDoc.value = null
    filePath.value = originalPath
    resetEditing()
    status.value = 'Copie de secours récupérée : pense à enregistrer.'
    sync()
  }

  function markSaved(path: string): void {
    savedDoc.value = doc.value
    filePath.value = path
  }

  function confirmDiscard(): boolean {
    return (
      !dirty.value ||
      window.confirm('Le montage a des modifications non enregistrées. Les abandonner ?')
    )
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
      'Fil : clic sur une broche ou une intersection pour partir, clic pour chaque coude, Maj inverse le L, double-clic ou Entrée pour finir, Échap annule.'
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
      fields: {}
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
        fields: {}
      })
    })
    status.value = `${def.name} posé.`
    return id
  }

  // Étiquettes texte

  function addLabel(x: number, y: number): string {
    const id = nextNumberedId(
      't',
      doc.value.labels.map((label) => label.id)
    )
    const size = doc.value.profile.labelFont.size
    apply('Ajouter une étiquette', (draft) => {
      draft.labels.push({ id, x, y, text: 'Texte', size, bold: false })
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

  function setLabelBold(id: string, bold: boolean): void {
    apply(bold ? 'Étiquette en gras' : 'Étiquette normale', (draft) => {
      const label = draft.labels.find((candidate) => candidate.id === id)
      if (label) label.bold = bold
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

  function recolorWires(ids: readonly string[], color: string): void {
    if (ids.length === 0) return
    apply('Colorer les fils', (draft) => {
      for (const wire of draft.wires) if (ids.includes(wire.id)) wire.color = color
    })
  }

  /** Couleur des prochains fils ; recolore aussi les fils sélectionnés. */
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
    for (const label of data.labels) include(textLabelBounds(label, profile.value.cellPx))
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
    apply('Modifier le repère', (draft) => {
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

  function clampZoom(zoom: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  }

  /** Zoom par un facteur autour d'un point d'écran (par défaut le centre de la zone visible). */
  function zoomAround(factor: number, screenX?: number, screenY?: number): void {
    const current = view.value
    const zoom = clampZoom(current.zoom * factor)
    if (zoom === current.zoom) return
    const base = profile.value.cellPx
    const anchorX = screenX ?? viewport.value.width / 2
    const anchorY = screenY ?? viewport.value.height / 2
    const worldX = (anchorX - current.panX) / (base * current.zoom)
    const worldY = (anchorY - current.panY) / (base * current.zoom)
    view.value = {
      zoom,
      panX: anchorX - worldX * base * zoom,
      panY: anchorY - worldY * base * zoom
    }
  }

  function resetZoom(): void {
    zoomAround(1 / view.value.zoom)
  }

  function panBy(dx: number, dy: number): void {
    view.value = { ...view.value, panX: view.value.panX + dx, panY: view.value.panY + dy }
  }

  function fitToContent(): void {
    const bounds = projectBounds(doc.value)
    if (!bounds) {
      view.value = { ...DEFAULT_VIEW }
      return
    }
    const base = profile.value.cellPx
    const width = bounds.width + 2 * FIT_MARGIN_CELLS
    const height = bounds.height + 2 * FIT_MARGIN_CELLS
    const zoom = clampZoom(
      Math.min(viewport.value.width / (width * base), viewport.value.height / (height * base))
    )
    const scale = base * zoom
    view.value = {
      zoom,
      panX: (viewport.value.width - bounds.width * scale) / 2 - bounds.x * scale,
      panY: (viewport.value.height - bounds.height * scale) / 2 - bounds.y * scale
    }
  }

  return {
    doc,
    filePath,
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
    inspectorOpen,
    profilePreview,
    panKeyHeld,
    shiftHeld,
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
    confirmDiscard,
    syncCurrentColor,
    setProjectName,
    setProfile,
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
    setLabelText,
    setLabelSize,
    setLabelBold,
    addWire,
    beginWire,
    appendWirePoints,
    popWireVertex,
    finishWire,
    stopWireDrawing,
    setWirePoints,
    recolorWires,
    setCurrentColor,
    setWireFreeEnds,
    setWireEndLabel,
    removeWires,
    reorderWires,
    toggleCrossing,
    clearSelection,
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
    setInstancePosition,
    setInstanceOrientation,
    zoomAround,
    resetZoom,
    panBy,
    fitToContent
  }
})
