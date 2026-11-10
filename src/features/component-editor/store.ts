import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  componentIssues,
  createEmptyComponent,
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
import { History } from '@/state/history'
import { fittingCellPx } from './pinLabelLayout'
import type { ToolId } from './tools'

/** Sélection : une ou plusieurs formes (indices, triés), ou une broche. */
export type Selection =
  { kind: 'primitives'; indexes: number[] } | { kind: 'pin'; id: string } | null

const MIN_CELL_PX = 8
const MAX_CELL_PX = 200
const FIT_PADDING_PX = 48
const FIT_SAFETY_PX = 2

function nextPinId(pins: ReadonlyArray<Pin>): string {
  const taken = new Set(pins.map((pin) => pin.id))
  for (let n = 1; ; n++) {
    const id = `p${n}`
    if (!taken.has(id)) return id
  }
}

/**
 * Document en cours d'édition dans l'éditeur de composants.
 * Le document est immuable ; chaque commande passe par l'historique (patches Immer).
 */
export const useComponentEditorStore = defineStore('componentEditor', () => {
  const history = new History<ComponentDefinition>(
    createEmptyComponent('nouveau-composant', 'Nouveau composant')
  )

  const doc = shallowRef<ComponentDefinition>(history.value)
  /** Dernier état enregistré (même objet que doc quand rien n'a changé) ; null = jamais enregistré. */
  const savedDoc = shallowRef<ComponentDefinition | null>(null)
  const folder = ref<string | null>(null)
  const selection = ref<Selection>(null)
  const tool = ref<ToolId>('select')
  /** Pixels par cellule dans l'éditeur (zoom), continu. */
  const cellPx = ref(40)
  const viewport = ref({ width: 800, height: 600 })
  const hoverPinId = ref<string | null>(null)
  const status = ref('')
  const undoLabel = ref<string | null>(null)
  const redoLabel = ref<string | null>(null)

  const dirty = computed(() => doc.value !== savedDoc.value)
  const issues = computed(() => componentIssues(doc.value))
  const hasErrors = computed(() => issues.value.some((issue) => issue.level === 'error'))
  const selectedIndexes = computed<readonly number[]>(() =>
    selection.value?.kind === 'primitives' ? selection.value.indexes : []
  )
  /** La forme sélectionnée quand il y en a exactement une. */
  const selectedPrimitive = computed<Primitive | null>(() => {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (indexes.length !== 1 || index === undefined || doc.value.visual.kind !== 'drawing') {
      return null
    }
    return doc.value.visual.primitives[index] ?? null
  })
  const selectedPin = computed<Pin | null>(() => {
    const current = selection.value
    if (current?.kind !== 'pin') return null
    return doc.value.pins.find((pin) => pin.id === current.id) ?? null
  })

  function sync(): void {
    doc.value = history.value
    undoLabel.value = history.undoLabel
    redoLabel.value = history.redoLabel
    const current = selection.value
    if (current?.kind === 'primitives') {
      const count = doc.value.visual.kind === 'drawing' ? doc.value.visual.primitives.length : 0
      const kept = current.indexes.filter((index) => index < count)
      if (kept.length === 0) selection.value = null
      else if (kept.length !== current.indexes.length) {
        selection.value = { kind: 'primitives', indexes: kept }
      }
    }
    if (current?.kind === 'pin' && !doc.value.pins.some((pin) => pin.id === current.id)) {
      selection.value = null
    }
  }

  function apply(label: string, recipe: (draft: Draft<ComponentDefinition>) => void): boolean {
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

  /** Charge un composant ; sourceFolder null = nouveau, jamais enregistré. */
  function open(def: ComponentDefinition, sourceFolder: string | null): void {
    history.reset(def)
    savedDoc.value = sourceFolder === null ? null : def
    folder.value = sourceFolder
    selection.value = null
    tool.value = 'select'
    status.value = ''
    sync()
    // Un composant qui s'ouvre occupe toute la zone d'édition.
    fitToViewport()
  }

  function markSaved(savedFolder: string): void {
    savedDoc.value = doc.value
    folder.value = savedFolder
  }

  /** Composant vierge : rien de dessiné, aucune broche. Il s'abandonne sans question. */
  const blank = computed(
    () =>
      doc.value.visual.kind === 'drawing' &&
      doc.value.visual.primitives.length === 0 &&
      doc.value.pins.length === 0
  )

  function confirmDiscard(): boolean {
    return (
      !dirty.value ||
      blank.value ||
      window.confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')
    )
  }

  function drawing(draft: Draft<ComponentDefinition>): Draft<Primitive>[] | null {
    return draft.visual.kind === 'drawing' ? draft.visual.primitives : null
  }

  // Sélection

  function selectPrimitives(indexes: readonly number[]): void {
    const unique = [...new Set(indexes)].sort((a, b) => a - b)
    selection.value = unique.length > 0 ? { kind: 'primitives', indexes: unique } : null
  }

  function togglePrimitive(index: number): void {
    const current = selectedIndexes.value
    selectPrimitives(
      current.includes(index) ? current.filter((other) => other !== index) : [...current, index]
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
      if (primitive.kind !== 'text') Object.assign(primitive.style, patch)
    })
  }

  /** Déplace plusieurs formes d'un même vecteur, en quarts de cellule. */
  function movePrimitives(indexes: readonly number[], dx: number, dy: number): void {
    if ((dx === 0 && dy === 0) || indexes.length === 0) return
    apply(indexes.length > 1 ? 'Déplacer les formes' : 'Déplacer la forme', (draft) => {
      const list = drawing(draft)
      if (!list) return
      for (const index of indexes) {
        const primitive = list[index]
        if (primitive) list[index] = castDraft(translatePrimitive(primitive, dx, dy))
      }
    })
  }

  /** Ordre d'empilement de la forme sélectionnée (seule) ; la sélection la suit. */
  function reorderPrimitive(move: StackMove): void {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (indexes.length !== 1 || index === undefined) return
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
    selection.value = { kind: 'primitives', indexes: [result.index] }
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
    selection.value = { kind: 'pin', id }
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

  function removeSelection(): void {
    const current = selection.value
    if (current?.kind === 'primitives') removePrimitives(current.indexes)
    else if (current?.kind === 'pin') removePin(current.id)
  }

  // Presse-papiers des formes

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
    selectedPrimitive,
    selectedPin,
    undo,
    redo,
    open,
    markSaved,
    confirmDiscard,
    selectPrimitives,
    togglePrimitive,
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
