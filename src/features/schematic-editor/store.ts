import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createEmptyProject,
  flippedInstance,
  nextLabel,
  nextNumberedId,
  projectBounds,
  rotatedInstance,
  type ComponentDefinition,
  type ComponentInstance,
  type FlipAxis,
  type Project,
  type RotateDirection,
  type Rotation
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { History } from '@/state/history'

export type SchematicTool = 'select' | 'place'

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

export interface PlacedInstance {
  instance: ComponentInstance
  def: ComponentDefinition
}

const MIN_ZOOM = 0.2
const MAX_ZOOM = 6
const FIT_MARGIN_CELLS = 2
const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 80, panY: 80 }

/**
 * Montage en cours d'édition. Le projet est immuable ; chaque commande passe par l'historique.
 * Le store porte aussi l'état de vue (zoom, pan) pour que la barre d'outils et le clavier
 * puissent agir dessus.
 */
export const useSchematicStore = defineStore('schematic', () => {
  const library = useLibraryStore()
  const history = new History<Project>(
    createEmptyProject('Nouveau montage', library.defaultProfile)
  )

  const doc = shallowRef<Project>(history.value)
  const savedDoc = shallowRef<Project | null>(null)
  const filePath = ref<string | null>(null)
  const selection = ref<string[]>([])
  const tool = ref<SchematicTool>('select')
  const placement = shallowRef<Placement | null>(null)
  const clipboard = shallowRef<ClipboardItem[]>([])
  const view = ref<ViewState>({ ...DEFAULT_VIEW })
  const viewport = ref({ width: 1200, height: 800 })
  const showPins = ref(true)
  const panKeyHeld = ref(false)
  const status = ref('')
  const undoLabel = ref<string | null>(null)
  const redoLabel = ref<string | null>(null)

  const dirty = computed(() => doc.value !== savedDoc.value)
  const cellPx = computed(() => doc.value.profile.cellPx * view.value.zoom)
  const placed = computed<PlacedInstance[]>(() =>
    doc.value.components.flatMap((instance) => {
      const def = doc.value.embeddedDefs[instance.defId]
      return def ? [{ instance, def }] : []
    })
  )
  const selectedInstances = computed(() =>
    doc.value.components.filter((instance) => selection.value.includes(instance.id))
  )

  function sync(): void {
    doc.value = history.value
    undoLabel.value = history.undoLabel
    redoLabel.value = history.redoLabel
    const ids = new Set(doc.value.components.map((instance) => instance.id))
    if (selection.value.some((id) => !ids.has(id))) {
      selection.value = selection.value.filter((id) => ids.has(id))
    }
  }

  function apply(label: string, recipe: (draft: Draft<Project>) => void): boolean {
    const changed = history.apply(label, recipe)
    if (changed) sync()
    return changed
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

  // Fichier

  function newProject(): void {
    history.reset(createEmptyProject('Nouveau montage', library.defaultProfile))
    savedDoc.value = null
    filePath.value = null
    selection.value = []
    placement.value = null
    tool.value = 'select'
    view.value = { ...DEFAULT_VIEW }
    status.value = ''
    sync()
  }

  function openProject(project: Project, path: string): void {
    history.reset(project)
    savedDoc.value = project
    filePath.value = path
    selection.value = []
    placement.value = null
    tool.value = 'select'
    status.value = ''
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

  // Pose d'un composant

  function startPlacing(def: ComponentDefinition): void {
    placement.value = { def, rotation: 0, mirror: false }
    tool.value = 'place'
    selection.value = []
    status.value = `Pose de ${def.name} : clic pour poser, R et T pour tourner et retourner, Échap pour arrêter.`
  }

  function stopPlacing(): void {
    placement.value = null
    tool.value = 'select'
  }

  function rotatePlacement(direction: RotateDirection): void {
    const current = placement.value
    if (!current) return
    const probe: ComponentInstance = {
      id: '',
      defId: current.def.id,
      x: 0,
      y: 0,
      rotation: current.rotation,
      mirror: current.mirror,
      label: ''
    }
    const turned = rotatedInstance(probe, current.def, direction)
    placement.value = { ...current, rotation: turned.rotation }
  }

  function flipPlacement(axis: FlipAxis): void {
    const current = placement.value
    if (!current) return
    const probe: ComponentInstance = {
      id: '',
      defId: current.def.id,
      x: 0,
      y: 0,
      rotation: current.rotation,
      mirror: current.mirror,
      label: ''
    }
    const flipped = flippedInstance(probe, axis)
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
    const label = nextLabel(
      def.labelPrefix,
      doc.value.components.map((instance) => instance.label)
    )
    apply(`Poser ${def.name}`, (draft) => {
      if (!Object.hasOwn(draft.embeddedDefs, def.id)) {
        draft.embeddedDefs[def.id] = castDraft(structuredClone(def))
      }
      draft.components.push({
        id,
        defId: def.id,
        x,
        y,
        rotation: current.rotation,
        mirror: current.mirror,
        label
      })
    })
    status.value = `${def.name} posé${label ? ` (${label})` : ''}. Échap pour arrêter.`
    return id
  }

  // Sélection

  function selectAll(): void {
    selection.value = doc.value.components.map((instance) => instance.id)
  }

  function moveInstances(ids: readonly string[], dx: number, dy: number): void {
    if ((dx === 0 && dy === 0) || ids.length === 0) return
    apply(ids.length > 1 ? 'Déplacer la sélection' : 'Déplacer le composant', (draft) => {
      for (const instance of draft.components) {
        if (ids.includes(instance.id)) {
          instance.x += dx
          instance.y += dy
        }
      }
    })
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
    apply(label, (draft) => {
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
    const ids = selection.value
    if (ids.length === 0) return
    apply(ids.length > 1 ? 'Supprimer la sélection' : 'Supprimer le composant', (draft) => {
      draft.components = draft.components.filter((instance) => !ids.includes(instance.id))
    })
    selection.value = []
  }

  function insertCopies(
    items: readonly ClipboardItem[],
    dx: number,
    dy: number,
    label: string
  ): void {
    if (items.length === 0) return
    const ids = doc.value.components.map((instance) => instance.id)
    const labels = doc.value.components.map((instance) => instance.label)
    const copies: ClipboardItem[] = []
    for (const item of items) {
      const id = nextNumberedId('c', [...ids, ...copies.map((copy) => copy.instance.id)])
      const copyLabel = nextLabel(item.def.labelPrefix, [
        ...labels,
        ...copies.map((copy) => copy.instance.label)
      ])
      copies.push({
        def: item.def,
        instance: {
          ...item.instance,
          id,
          label: copyLabel,
          x: item.instance.x + dx,
          y: item.instance.y + dy
        }
      })
    }
    apply(label, (draft) => {
      for (const copy of copies) {
        if (!Object.hasOwn(draft.embeddedDefs, copy.def.id)) {
          draft.embeddedDefs[copy.def.id] = castDraft(structuredClone(copy.def))
        }
        draft.components.push(castDraft(copy.instance))
      }
    })
    selection.value = copies.map((copy) => copy.instance.id)
  }

  function selectionItems(): ClipboardItem[] {
    return selectedInstances.value.flatMap((instance) => {
      const def = doc.value.embeddedDefs[instance.defId]
      return def ? [{ instance, def }] : []
    })
  }

  function duplicateSelection(): void {
    insertCopies(selectionItems(), 1, 1, 'Dupliquer')
  }

  function copySelection(): void {
    const items = selectionItems()
    if (items.length === 0) return
    clipboard.value = items
    status.value = `${items.length} composant(s) copié(s).`
  }

  function pasteClipboard(): void {
    insertCopies(clipboard.value, 1, 1, 'Coller')
  }

  function setInstanceLabel(id: string, label: string): void {
    apply('Modifier le repère', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (instance) instance.label = label
    })
  }

  function setInstancePosition(id: string, x: number, y: number): void {
    apply('Déplacer le composant', (draft) => {
      const instance = draft.components.find((candidate) => candidate.id === id)
      if (instance) {
        instance.x = x
        instance.y = y
      }
    })
  }

  function setInstanceOrientation(id: string, rotation: Rotation, mirror: boolean): void {
    apply('Orienter le composant', (draft) => {
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
    const base = doc.value.profile.cellPx
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
    const base = doc.value.profile.cellPx
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
    tool,
    placement,
    view,
    viewport,
    showPins,
    panKeyHeld,
    status,
    undoLabel,
    redoLabel,
    dirty,
    cellPx,
    placed,
    selectedInstances,
    undo,
    redo,
    newProject,
    openProject,
    markSaved,
    confirmDiscard,
    setProjectName,
    startPlacing,
    stopPlacing,
    rotatePlacement,
    flipPlacement,
    placeAt,
    selectAll,
    moveInstances,
    rotateSelection,
    flipSelection,
    rotate,
    flip,
    removeSelection,
    duplicateSelection,
    copySelection,
    pasteClipboard,
    setInstanceLabel,
    setInstancePosition,
    setInstanceOrientation,
    zoomAround,
    resetZoom,
    panBy,
    fitToContent
  }
})
