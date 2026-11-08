import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  componentIssues,
  createEmptyComponent,
  PNG_PX_PER_CELL,
  translatePrimitive,
  type ComponentDefinition,
  type LocalPoint,
  type Pin,
  type Primitive,
  type ShapeStyle,
  type Size
} from '@/domain'
import { History } from '@/state/history'
import type { ToolId } from './tools'

export type Selection = { kind: 'primitive'; index: number } | { kind: 'pin'; id: string } | null

const ZOOM_LEVELS = [20, 30, 40, 60, 80]

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
  const cellPx = ref(40)
  const status = ref('')
  const undoLabel = ref<string | null>(null)
  const redoLabel = ref<string | null>(null)

  const dirty = computed(() => doc.value !== savedDoc.value)
  const issues = computed(() => componentIssues(doc.value))
  const hasErrors = computed(() => issues.value.some((issue) => issue.level === 'error'))
  const selectedPrimitive = computed<Primitive | null>(() => {
    const current = selection.value
    if (current?.kind !== 'primitive' || doc.value.visual.kind !== 'drawing') return null
    return doc.value.visual.primitives[current.index] ?? null
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
    if (
      current?.kind === 'primitive' &&
      (doc.value.visual.kind !== 'drawing' || current.index >= doc.value.visual.primitives.length)
    ) {
      selection.value = null
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
  }

  function markSaved(savedFolder: string): void {
    savedDoc.value = doc.value
    folder.value = savedFolder
  }

  function confirmDiscard(): boolean {
    return (
      !dirty.value || window.confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')
    )
  }

  function drawing(draft: Draft<ComponentDefinition>): Draft<Primitive>[] | null {
    return draft.visual.kind === 'drawing' ? draft.visual.primitives : null
  }

  // Commandes du composant

  function setMeta(
    patch: Partial<Pick<ComponentDefinition, 'name' | 'category' | 'description' | 'labelPrefix'>>
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

  function setSize(size: Size): void {
    apply('Redimensionner', (draft) => {
      draft.size = { widthCells: size.widthCells, heightCells: size.heightCells }
    })
  }

  function setVisualPng(dataUrl: string, size: Size): void {
    apply('Importer un PNG', (draft) => {
      draft.visual = { kind: 'png', file: 'image.png', pxPerCell: PNG_PX_PER_CELL, dataUrl }
      draft.size = { widthCells: size.widthCells, heightCells: size.heightCells }
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
    if (index >= 0) selection.value = { kind: 'primitive', index }
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

  function updateStyle(index: number, patch: Partial<ShapeStyle>): void {
    updatePrimitive(index, 'Modifier le style', (primitive) => {
      if (primitive.kind !== 'text') Object.assign(primitive.style, patch)
    })
  }

  function movePrimitive(index: number, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    apply('Déplacer la forme', (draft) => {
      const list = drawing(draft)
      const primitive = list?.[index]
      if (list && primitive) list[index] = castDraft(translatePrimitive(primitive, dx, dy))
    })
  }

  function removePrimitive(index: number): void {
    apply('Supprimer la forme', (draft) => {
      drawing(draft)?.splice(index, 1)
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

  function removePin(id: string): void {
    apply('Supprimer la broche', (draft) => {
      draft.pins = draft.pins.filter((pin) => pin.id !== id)
    })
    selection.value = null
  }

  function removeSelection(): void {
    const current = selection.value
    if (current?.kind === 'primitive') removePrimitive(current.index)
    else if (current?.kind === 'pin') removePin(current.id)
  }

  // Affichage

  function zoom(direction: 1 | -1): void {
    const position = ZOOM_LEVELS.indexOf(cellPx.value)
    const next = ZOOM_LEVELS[position + direction]
    if (next !== undefined) cellPx.value = next
  }

  return {
    doc,
    folder,
    selection,
    tool,
    cellPx,
    status,
    undoLabel,
    redoLabel,
    dirty,
    issues,
    hasErrors,
    selectedPrimitive,
    selectedPin,
    undo,
    redo,
    open,
    markSaved,
    confirmDiscard,
    setMeta,
    setId,
    setSize,
    setVisualPng,
    setVisualDrawing,
    addPrimitive,
    updatePrimitive,
    updateStyle,
    movePrimitive,
    removePrimitive,
    addPin,
    updatePin,
    movePin,
    removePin,
    removeSelection,
    zoom
  }
})
