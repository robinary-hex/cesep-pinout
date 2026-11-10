import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  componentIssues,
  createEmptyComponent,
  isInsideBox,
  pinsInside,
  PNG_PX_PER_CELL,
  QUARTERS_PER_CELL,
  renumberPins,
  reorderItem,
  translatePrimitive,
  type Box,
  type ComponentDefinition,
  type LocalPoint,
  type Pin,
  type Primitive,
  type ShapeStyle,
  type Size,
  type StackMove
} from '@/domain'
import { samePath } from '@/io/paths'
import { useDocumentTabs } from '@/state/tabs'
import { fittingCellPx } from './pinLabelLayout'
import type { ToolId } from './tools'

/** Sélection : des formes (indices, triés) et des broches (identifiants), ensemble. */
export interface Selection {
  indexes: number[]
  pinIds: string[]
}

/** Onglet affiché dans la barre d'application. */
export interface ComponentTabInfo {
  id: number
  name: string
  folder: string | null
  dirty: boolean
}

/** État d'édition qu'un onglet garde quand il n'est pas affiché : sa sélection et son zoom. */
interface TabEditing {
  selection: Selection | null
  cellPx: number
}

const MIN_CELL_PX = 8
const MAX_CELL_PX = 200
const FIT_PADDING_PX = 48
const FIT_SAFETY_PX = 2
const DEFAULT_CELL_PX = 40

function nextPinId(pins: ReadonlyArray<Pin>): string {
  const taken = new Set(pins.map((pin) => pin.id))
  for (let n = 1; ; n++) {
    const id = `p${n}`
    if (!taken.has(id)) return id
  }
}

/** Composant vierge : rien de dessiné, aucune broche. */
function isBlank(def: ComponentDefinition): boolean {
  return (
    def.visual.kind === 'drawing' && def.visual.primitives.length === 0 && def.pins.length === 0
  )
}

/**
 * Des modifications à enregistrer ? Pas si le composant est intact, ni s'il n'a jamais été
 * enregistré et qu'il est encore vierge : on le ferme, et on quitte l'application, sans question.
 */
function needsSaving(
  def: ComponentDefinition,
  saved: ComponentDefinition | null,
  folder: string | null
): boolean {
  return def !== saved && !(folder === null && isBlank(def))
}

/**
 * Composants ouverts dans l'éditeur, un par onglet, et celui en cours d'édition. Le document est
 * immuable ; chaque commande passe par l'historique de son onglet (patches Immer). Les onglets
 * sont ceux de `useDocumentTabs` (`src/state/tabs.ts`) : l'onglet actif vit dans des refs, les
 * autres attendent, rangés. Le presse-papiers des formes est commun aux onglets.
 */
export const useComponentEditorStore = defineStore('componentEditor', () => {
  function blankComponent(): ComponentDefinition {
    return createEmptyComponent('nouveau-composant', 'Nouveau composant')
  }

  const selection = ref<Selection | null>(null)
  const tool = ref<ToolId>('select')
  /** Pixels par cellule dans l'éditeur (zoom), continu. */
  const cellPx = ref(DEFAULT_CELL_PX)
  const viewport = ref({ width: 800, height: 600 })
  const hoverPinId = ref<string | null>(null)
  const status = ref('')

  // Onglets : mécanique partagée (`useDocumentTabs`) ; ici, ce qu'un onglet garde de l'édition.
  const base = useDocumentTabs<ComponentDefinition, TabEditing>({
    blank: blankComponent,
    needsSaving,
    freshEditing: () => ({ selection: null, cellPx: DEFAULT_CELL_PX }),
    capture: () => ({ selection: selection.value, cellPx: cellPx.value }),
    restore: (editing) => {
      selection.value = editing.selection
      cellPx.value = editing.cellPx
      tool.value = 'select'
      hoverPinId.value = null
      status.value = ''
    },
    afterSync: pruneSelection
  })
  const { doc, activeTabId, pristine, anyDirty, undoLabel, redoLabel, apply, cycleTab, moveTab } =
    base
  /** Dossier du composant dans la bibliothèque ; null tant qu'il n'y est pas enregistré. */
  const folder = base.path
  const dirty = base.dirty
  const tabs = computed<ComponentTabInfo[]>(() =>
    base.tabs.value.map((tab) => ({
      id: tab.id,
      name: tab.name,
      folder: tab.path,
      dirty: tab.dirty
    }))
  )
  const issues = computed(() => componentIssues(doc.value))
  const hasErrors = computed(() => issues.value.some((issue) => issue.level === 'error'))
  const selectedIndexes = computed<readonly number[]>(() => selection.value?.indexes ?? [])
  const selectedPinIds = computed<readonly string[]>(() => selection.value?.pinIds ?? [])
  /** La forme sélectionnée quand la sélection se réduit à elle. */
  const selectedPrimitive = computed<Primitive | null>(() => {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (
      indexes.length !== 1 ||
      index === undefined ||
      selectedPinIds.value.length > 0 ||
      doc.value.visual.kind !== 'drawing'
    ) {
      return null
    }
    return doc.value.visual.primitives[index] ?? null
  })
  /** La broche sélectionnée quand la sélection se réduit à elle. */
  const selectedPin = computed<Pin | null>(() => {
    const ids = selectedPinIds.value
    const id = ids[0]
    if (ids.length !== 1 || id === undefined || selectedIndexes.value.length > 0) return null
    return doc.value.pins.find((pin) => pin.id === id) ?? null
  })

  /** Après chaque changement du composant : la sélection ne garde que ce qui existe encore. */
  function pruneSelection(): void {
    const current = selection.value
    if (!current) return
    const count = doc.value.visual.kind === 'drawing' ? doc.value.visual.primitives.length : 0
    const indexes = current.indexes.filter((index) => index < count)
    const pinIds = current.pinIds.filter((id) => doc.value.pins.some((pin) => pin.id === id))
    if (indexes.length !== current.indexes.length || pinIds.length !== current.pinIds.length) {
      select(indexes, pinIds)
    }
  }

  function undo(): void {
    const label = base.undo()
    if (label !== null) status.value = `Annulé : ${label}`
  }

  function redo(): void {
    const label = base.redo()
    if (label !== null) status.value = `Rétabli : ${label}`
  }

  // Onglets

  function activateTab(id: number): void {
    base.activateTab(id)
  }

  /** Montre un composant dans un onglet : l'onglet actif s'il est vierge, sinon un nouveau. */
  function showInTab(
    def: ComponentDefinition,
    saved: ComponentDefinition | null,
    sourceFolder: string | null
  ): void {
    base.showInTab(def, saved, sourceFolder)
    // Un composant qui s'ouvre occupe toute la zone d'édition.
    fitToViewport()
  }

  /** Nouveau composant vierge, dans son onglet. */
  function newComponent(): void {
    const blank = blankComponent()
    showInTab(blank, blank, null)
  }

  /**
   * Ouvre un composant dans un onglet ; `sourceFolder` null = jamais enregistré (copie, import) :
   * il est alors à enregistrer. Un composant de la bibliothèque déjà ouvert n'est pas rechargé :
   * son onglet revient devant.
   */
  function open(def: ComponentDefinition, sourceFolder: string | null): void {
    if (sourceFolder !== null) {
      const already = tabs.value.find(
        (tab) => tab.folder !== null && samePath(tab.folder, sourceFolder)
      )
      if (already) {
        activateTab(already.id)
        return
      }
    }
    showInTab(def, sourceFolder === null ? null : def, sourceFolder)
  }

  function markSaved(savedFolder: string): void {
    base.markSaved(savedFolder)
  }

  /**
   * Ferme un onglet sans rien demander ; vrai s'il existait. La question « enregistrer ? » d'un
   * composant modifié se pose avant, dans `closeComponentTabAsking`. Fermer le dernier laisse un
   * composant vierge.
   */
  function closeTab(id: number): boolean {
    return base.closeTab(id)
  }

  /** Ferme les onglets d'un composant qui vient d'être supprimé de la bibliothèque. */
  function closeFolderTabs(removedFolder: string): void {
    for (const tab of tabs.value) {
      if (tab.folder !== null && samePath(tab.folder, removedFolder)) closeTab(tab.id)
    }
  }

  function drawing(draft: Draft<ComponentDefinition>): Draft<Primitive>[] | null {
    return draft.visual.kind === 'drawing' ? draft.visual.primitives : null
  }

  // Sélection

  /** Sélectionne des formes et des broches ; rien du tout vide la sélection. */
  function select(indexes: readonly number[], pinIds: readonly string[] = []): void {
    const uniqueIndexes = [...new Set(indexes)].sort((a, b) => a - b)
    const uniquePins = [...new Set(pinIds)]
    selection.value =
      uniqueIndexes.length > 0 || uniquePins.length > 0
        ? { indexes: uniqueIndexes, pinIds: uniquePins }
        : null
  }

  function selectPrimitives(indexes: readonly number[]): void {
    select(indexes, [])
  }

  function selectPin(id: string): void {
    select([], [id])
  }

  function togglePrimitive(index: number): void {
    const current = selectedIndexes.value
    select(
      current.includes(index) ? current.filter((other) => other !== index) : [...current, index],
      selectedPinIds.value
    )
  }

  function togglePin(id: string): void {
    const current = selectedPinIds.value
    select(
      selectedIndexes.value,
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    )
  }

  // Commandes du composant

  function setMeta(
    patch: Partial<Pick<ComponentDefinition, 'name' | 'category' | 'description'>>
  ): void {
    apply('Modifier les propriétés', (draft) => {
      Object.assign(draft, patch)
    })
  }

  function setId(id: string): void {
    apply('Identifiant', (draft) => {
      draft.id = id
    })
  }

  /** Redimensionne ; les broches qui sortent de la boîte disparaissent, les autres sont renumérotées. */
  function setSize(size: Size): void {
    const kept = pinsInside(doc.value.pins, size)
    const removed = doc.value.pins.length - kept.length
    apply('Redimensionner', (draft) => {
      draft.size = { widthCells: size.widthCells, heightCells: size.heightCells }
      if (removed > 0) draft.pins = castDraft(renumberPins(kept))
    })
    if (removed > 0) {
      status.value = `${removed} broche(s) hors de la nouvelle boîte supprimée(s).`
    }
  }

  /**
   * Nouvelle boîte du composant, en cellules par rapport à l'origine actuelle (poignées avec Ctrl) :
   * le dessin et les broches suivent l'origine, les broches qui sortent disparaissent.
   */
  function setBox(box: Box): void {
    const before = doc.value
    const size = {
      widthCells: Math.max(1, Math.round(box.w)),
      heightCells: Math.max(1, Math.round(box.h))
    }
    const dx = -Math.round(box.x)
    const dy = -Math.round(box.y)
    if (
      dx === 0 &&
      dy === 0 &&
      size.widthCells === before.size.widthCells &&
      size.heightCells === before.size.heightCells
    ) {
      return
    }
    const moved = before.pins.map((pin) => ({ ...pin, x: pin.x + dx, y: pin.y + dy }))
    const kept = pinsInside(moved, size)
    apply('Redimensionner', (draft) => {
      draft.size = size
      const list = drawing(draft)
      if (list && (dx !== 0 || dy !== 0)) {
        for (let i = 0; i < list.length; i++) {
          const primitive = list[i]
          if (primitive) {
            list[i] = castDraft(
              translatePrimitive(primitive, dx * QUARTERS_PER_CELL, dy * QUARTERS_PER_CELL)
            )
          }
        }
      }
      draft.pins = castDraft(kept.length !== before.pins.length ? renumberPins(kept) : kept)
    })
    const removed = before.pins.length - kept.length
    if (removed > 0) status.value = `${removed} broche(s) hors de la nouvelle boîte supprimée(s).`
  }

  function setVisualPng(dataUrl: string, size: Size): void {
    const kept = pinsInside(doc.value.pins, size)
    apply('Importer un PNG', (draft) => {
      draft.visual = { kind: 'png', file: 'image.png', pxPerCell: PNG_PX_PER_CELL, dataUrl }
      draft.size = { widthCells: size.widthCells, heightCells: size.heightCells }
      if (kept.length !== draft.pins.length) draft.pins = castDraft(renumberPins(kept))
    })
    selection.value = null
  }

  function setVisualDrawing(): void {
    apply('Revenir au dessin', (draft) => {
      draft.visual = { kind: 'drawing', primitives: [] }
    })
    selection.value = null
  }

  // Commandes des formes

  function addPrimitive(primitive: Primitive, label: string): number {
    let index = -1
    apply(label, (draft) => {
      const list = drawing(draft)
      if (!list) return
      list.push(castDraft(primitive))
      index = list.length - 1
    })
    if (index >= 0) selectPrimitives([index])
    return index
  }

  function updatePrimitive(
    index: number,
    label: string,
    mutate: (primitive: Draft<Primitive>) => void
  ): void {
    apply(label, (draft) => {
      const primitive = drawing(draft)?.[index]
      if (primitive) mutate(primitive)
    })
  }

  /** Remplace une forme entière (fin d'un glisser de poignée). */
  function setPrimitive(index: number, primitive: Primitive, label: string): void {
    apply(label, (draft) => {
      const list = drawing(draft)
      if (list && index < list.length) list[index] = castDraft(primitive)
    })
  }

  function updateStyle(index: number, patch: Partial<ShapeStyle>): void {
    updatePrimitive(index, 'Modifier le style', (primitive) => {
      if ('style' in primitive) Object.assign(primitive.style, patch)
    })
  }

  /**
   * Déplace des formes et des broches d'un même vecteur, en quarts de cellule, en une commande.
   * Avec des broches, le vecteur doit tomber sur des cellules entières, et une broche qui
   * sortirait du composant ou en rejoindrait une autre annule tout. Vrai si le déplacement est
   * fait.
   */
  function moveSelection(
    indexes: readonly number[],
    pinIds: readonly string[],
    dx: number,
    dy: number
  ): boolean {
    if (dx === 0 && dy === 0) return false
    if (indexes.length === 0 && pinIds.length === 0) return false
    const moving = new Set(pinIds)
    const cellsX = dx / QUARTERS_PER_CELL
    const cellsY = dy / QUARTERS_PER_CELL
    if (moving.size > 0) {
      if (!Number.isInteger(cellsX) || !Number.isInteger(cellsY)) return false
      const taken = new Set<string>()
      for (const pin of doc.value.pins) {
        const point = moving.has(pin.id) ? { x: pin.x + cellsX, y: pin.y + cellsY } : pin
        const key = `${point.x},${point.y}`
        if (!isInsideBox(point, doc.value.size) || taken.has(key)) {
          status.value =
            'Déplacement refusé : une broche sortirait du composant ou en rejoindrait une autre.'
          return false
        }
        taken.add(key)
      }
    }
    const count = indexes.length + pinIds.length
    const label =
      moving.size === 0
        ? count > 1
          ? 'Déplacer les formes'
          : 'Déplacer la forme'
        : count > 1
          ? 'Déplacer la sélection'
          : 'Déplacer la broche'
    return apply(label, (draft) => {
      const list = drawing(draft)
      if (list) {
        for (const index of indexes) {
          const primitive = list[index]
          if (primitive) list[index] = castDraft(translatePrimitive(primitive, dx, dy))
        }
      }
      for (const pin of draft.pins) {
        if (!moving.has(pin.id)) continue
        pin.x += cellsX
        pin.y += cellsY
      }
    })
  }

  /** Déplace plusieurs formes d'un même vecteur, en quarts de cellule. */
  function movePrimitives(indexes: readonly number[], dx: number, dy: number): void {
    moveSelection(indexes, [], dx, dy)
  }

  /** Ordre d'empilement de la forme sélectionnée (seule) ; la sélection la suit. */
  function reorderPrimitive(move: StackMove): void {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (indexes.length !== 1 || index === undefined || selectedPinIds.value.length > 0) return
    const list = doc.value.visual.kind === 'drawing' ? doc.value.visual.primitives : null
    if (!list) return
    const result = reorderItem(list, index, move)
    if (result.index === index) return
    const labels: Record<StackMove, string> = {
      up: 'Avancer la forme',
      down: 'Reculer la forme',
      top: 'Forme au premier plan',
      bottom: 'Forme à l’arrière-plan'
    }
    apply(labels[move], (draft) => {
      const target = drawing(draft)
      if (target) target.splice(0, target.length, ...castDraft(result.list))
    })
    selectPrimitives([result.index])
  }

  function removePrimitives(indexes: readonly number[]): void {
    if (indexes.length === 0) return
    apply(indexes.length > 1 ? 'Supprimer les formes' : 'Supprimer la forme', (draft) => {
      const list = drawing(draft)
      if (!list) return
      for (const index of [...indexes].sort((a, b) => b - a)) list.splice(index, 1)
    })
    selection.value = null
  }

  // Commandes des broches

  function addPin(point: LocalPoint): string {
    const id = nextPinId(doc.value.pins)
    apply('Ajouter une broche', (draft) => {
      draft.pins.push({
        id,
        name: String(draft.pins.length + 1),
        kind: 'io',
        x: point.x,
        y: point.y
      })
    })
    selectPin(id)
    return id
  }

  function updatePin(id: string, patch: Partial<Pick<Pin, 'name' | 'kind'>>): void {
    apply('Modifier la broche', (draft) => {
      const pin = draft.pins.find((candidate) => candidate.id === id)
      if (pin) Object.assign(pin, patch)
    })
  }

  function movePin(id: string, point: LocalPoint): void {
    apply('Déplacer la broche', (draft) => {
      const pin = draft.pins.find((candidate) => candidate.id === id)
      if (pin && (pin.x !== point.x || pin.y !== point.y)) {
        pin.x = point.x
        pin.y = point.y
      }
    })
  }

  /** Supprime une broche ; les noms numériques des autres suivent leur nouvel ordre. */
  function removePin(id: string): void {
    const remaining = doc.value.pins.filter((pin) => pin.id !== id)
    apply('Supprimer la broche', (draft) => {
      draft.pins = castDraft(renumberPins(remaining))
    })
    selection.value = null
  }

  /** Supprime les formes et les broches sélectionnées, en une commande. */
  function removeSelection(): void {
    const current = selection.value
    if (!current) return
    const { indexes, pinIds } = current
    const onlyPin = pinIds[0]
    if (pinIds.length === 0) {
      removePrimitives(indexes)
    } else if (indexes.length === 0 && pinIds.length === 1 && onlyPin !== undefined) {
      removePin(onlyPin)
    } else {
      const remaining = doc.value.pins.filter((pin) => !pinIds.includes(pin.id))
      apply('Supprimer la sélection', (draft) => {
        const list = drawing(draft)
        if (list) for (const index of [...indexes].sort((a, b) => b - a)) list.splice(index, 1)
        draft.pins = castDraft(renumberPins(remaining))
      })
      selection.value = null
    }
  }

  // Presse-papiers des formes, commun aux onglets : on copie d'un composant à l'autre.

  const clipboard = shallowRef<Primitive[]>([])
  const clipboardEmpty = computed(() => clipboard.value.length === 0)

  function primitivesAt(indexes: readonly number[]): Primitive[] {
    if (doc.value.visual.kind !== 'drawing') return []
    const list = doc.value.visual.primitives
    return indexes.flatMap((index) => {
      const primitive = list[index]
      return primitive ? [primitive] : []
    })
  }

  /** Ajoute des copies translatées (quarts de cellule) et les sélectionne, en une commande. */
  function insertPrimitiveCopies(
    source: readonly Primitive[],
    dx: number,
    dy: number,
    label: string
  ): void {
    if (source.length === 0) return
    let first = -1
    apply(label, (draft) => {
      const list = drawing(draft)
      if (!list) return
      first = list.length
      for (const primitive of source) list.push(castDraft(translatePrimitive(primitive, dx, dy)))
    })
    if (first >= 0) selectPrimitives(source.map((_, offset) => first + offset))
  }

  function copySelection(): void {
    const selected = primitivesAt(selectedIndexes.value)
    if (selected.length === 0) return
    clipboard.value = structuredClone(selected)
    status.value = `${selected.length} forme(s) copiée(s).`
  }

  /** Colle décalé d'une cellule, pour distinguer la copie de l'original. */
  function pasteClipboard(): void {
    insertPrimitiveCopies(clipboard.value, QUARTERS_PER_CELL, QUARTERS_PER_CELL, 'Coller')
  }

  function duplicateSelection(): void {
    insertPrimitiveCopies(
      primitivesAt(selectedIndexes.value),
      QUARTERS_PER_CELL,
      QUARTERS_PER_CELL,
      'Dupliquer'
    )
  }

  /** Alt+glisser : copie des formes déposée au décalage donné. */
  function duplicatePrimitivesAt(indexes: readonly number[], dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    insertPrimitiveCopies(primitivesAt(indexes), dx, dy, 'Dupliquer')
  }

  // Affichage

  function setCellPx(value: number): void {
    cellPx.value = Math.round(Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, value)))
  }

  function zoomBy(factor: number): void {
    setCellPx(cellPx.value * factor)
  }

  /**
   * Taille de cellule qui fait tenir le composant dans la zone visible, avec sa marge (une
   * cellule, ou la place des repères de broche qui dépassent) : arrondie vers le bas et avec une
   * petite réserve, pour ne jamais faire apparaître d'ascenseur.
   */
  function fitToViewport(): void {
    setCellPx(
      fittingCellPx(
        doc.value,
        viewport.value.width - FIT_PADDING_PX - FIT_SAFETY_PX,
        viewport.value.height - FIT_PADDING_PX - FIT_SAFETY_PX,
        cellPx.value
      )
    )
  }

  return {
    doc,
    folder,
    tabs,
    activeTabId,
    anyDirty,
    pristine,
    selection,
    tool,
    cellPx,
    viewport,
    hoverPinId,
    status,
    undoLabel,
    redoLabel,
    dirty,
    issues,
    hasErrors,
    selectedIndexes,
    selectedPinIds,
    selectedPrimitive,
    selectedPin,
    undo,
    redo,
    newComponent,
    open,
    markSaved,
    activateTab,
    cycleTab,
    moveTab,
    closeTab,
    closeFolderTabs,
    select,
    selectPrimitives,
    selectPin,
    togglePrimitive,
    togglePin,
    setMeta,
    setId,
    setSize,
    setBox,
    setVisualPng,
    setVisualDrawing,
    addPrimitive,
    updatePrimitive,
    setPrimitive,
    updateStyle,
    moveSelection,
    movePrimitives,
    removePrimitives,
    reorderPrimitive,
    addPin,
    updatePin,
    movePin,
    removePin,
    removeSelection,
    clipboardEmpty,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    duplicatePrimitivesAt,
    setCellPx,
    zoomBy,
    fitToViewport
  }
})
