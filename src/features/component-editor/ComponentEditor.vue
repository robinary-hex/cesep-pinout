<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import {
  naturalImageSize,
  PIN_KIND_LABELS,
  PIN_KINDS,
  PRIMITIVE_KIND_LABELS,
  QUARTERS_PER_CELL,
  type Arrows,
  type Primitive
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, SEPARATOR, submenu, type MenuItem } from '@/ui/contextMenu'
import type { IconName } from '@/ui/icons'
import { openModals } from '@/ui/modalState'
import PromptDialog from '@/ui/PromptDialog.vue'
import { saveComponentDoc } from './componentActions'
import EditorCanvas from './EditorCanvas.vue'
import EditorInspector from './EditorInspector.vue'
import EditorToolbar from './EditorToolbar.vue'
import type { EditorMenuRequest } from './menu'
import { importImage } from './pngImport'
import { useComponentEditorStore } from './store'
import { TOOL_BY_KEY } from './tools'

// Éditeur de composants : barre d'outils, canevas, inspecteur (replié par défaut, comme dans les
// autres éditeurs), raccourcis clavier,
// menu contextuel (forme, broche, vide), enregistrement dans la bibliothèque. Les touches communes aux trois éditeurs (flèches, Ctrl+A,
// 0, Retour arrière pendant un tracé) font ici la même chose qu'ailleurs.

const store = useComponentEditorStore()
const library = useLibraryStore()
const canvas = useTemplateRef<InstanceType<typeof EditorCanvas>>('canvas')

async function save(): Promise<void> {
  await saveComponentDoc(store, library)
}

function createNew(): void {
  store.newComponent()
}

// Saisies et menu contextuel

interface PromptState {
  title: string
  label: string
  value: string
  multiline?: boolean
  onSubmit: (value: string) => void
}

const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)
const prompt = ref<PromptState | null>(null)

function editText(index: number): void {
  const primitive = store.shown.visual.primitives[index]
  if (primitive?.kind !== 'text') return
  prompt.value = {
    title: 'Texte',
    label: primitive.variable ? 'Nom du champ' : 'Texte',
    value: primitive.text,
    multiline: !primitive.variable,
    onSubmit: (value) =>
      store.updatePrimitive(index, 'Modifier le texte', (target) => {
        if (target.kind === 'text') target.text = value
      })
  }
}

function renamePin(id: string): void {
  const pin = store.shown.pins.find((candidate) => candidate.id === id)
  if (!pin) return
  prompt.value = {
    title: 'Broche',
    label: 'Nom',
    value: pin.name,
    onSubmit: (value) => {
      const name = value.trim()
      if (name.length > 0) store.updatePin(id, { name })
    }
  }
}

/** Entrées propres à une forme : son texte, ses flèches, sa fermeture, la taille de son image. */
function shapeItems(index: number, primitive: Primitive): MenuItem[] {
  const items: MenuItem[] = []
  if (primitive.kind === 'text') {
    items.push(
      item(primitive.variable ? 'Nom du champ…' : 'Modifier le texte…', () => editText(index), {
        icon: 'edit'
      })
    )
  }
  if (primitive.kind === 'line' || (primitive.kind === 'polyline' && !primitive.closed)) {
    const arrow = (end: keyof Arrows, label: string, icon?: IconName): MenuItem => {
      const on = !primitive.arrows[end]
      return item(
        label,
        () =>
          store.updatePrimitive(
            index,
            on ? 'Ajouter une flèche' : 'Retirer la flèche',
            (target) => {
              if (target.kind === 'line' || target.kind === 'polyline') target.arrows[end] = on
            }
          ),
        { checked: !on, ...(icon ? { icon } : {}) }
      )
    }
    items.push(
      arrow('start', 'Flèche au départ', 'arrow-left'),
      arrow('middle', 'Flèche au centre'),
      arrow('end', 'Flèche à l’arrivée', 'arrow-right')
    )
  }
  if (primitive.kind === 'polyline') {
    const closed = !primitive.closed
    items.push(
      item(
        'Fermée (polygone)',
        () =>
          store.updatePrimitive(
            index,
            closed ? 'Fermer la polyligne' : 'Ouvrir la polyligne',
            (target) => {
              if (target.kind === 'polyline') target.closed = closed
            }
          ),
        { checked: !closed }
      )
    )
  }
  if (primitive.kind === 'image') {
    const natural = naturalImageSize(primitive)
    items.push(
      item('Taille d’origine', () => store.resetImageSize(index), {
        icon: 'fit',
        disabled: !natural || (natural.w === primitive.w && natural.h === primitive.h)
      })
    )
  }
  return items
}

function orderMenu(): MenuItem {
  return submenu(
    'Ordre',
    [
      item('Avancer', () => store.reorderPrimitive('up'), {
        hint: 'Ctrl+Page haut',
        icon: 'arrow-up'
      }),
      item('Reculer', () => store.reorderPrimitive('down'), {
        hint: 'Ctrl+Page bas',
        icon: 'arrow-down'
      }),
      item('Premier plan', () => store.reorderPrimitive('top'), {
        hint: 'Ctrl+Maj+Page haut',
        icon: 'arrow-up-line'
      }),
      item('Arrière-plan', () => store.reorderPrimitive('bottom'), {
        hint: 'Ctrl+Maj+Page bas',
        icon: 'arrow-down-line'
      })
    ],
    { icon: 'arrow-up-line' }
  )
}

/** Grouper et Dégrouper, quand la sélection s'y prête. */
function groupItems(): MenuItem[] {
  const items: MenuItem[] = []
  if (store.canGroup) {
    items.push(item('Grouper', () => store.groupSelection(), { hint: 'Ctrl+G', icon: 'group' }))
  }
  if (store.canUngroup) {
    items.push(
      item('Dégrouper', () => store.ungroupSelection(), { hint: 'Ctrl+Maj+G', icon: 'ungroup' })
    )
  }
  if (items.length > 0) items.push(SEPARATOR)
  return items
}

/** Fin de tout menu d'élément, dans le même ordre que dans les autres éditeurs. */
function commonItems(): MenuItem[] {
  const noShape = store.selectedIndexes.length === 0
  return [
    ...groupItems(),
    item('Dupliquer', () => store.duplicateSelection(), {
      hint: 'Ctrl+D',
      icon: 'duplicate',
      disabled: noShape
    }),
    item('Copier', () => store.copySelection(), {
      hint: 'Ctrl+C',
      icon: 'copy',
      disabled: noShape
    }),
    item(
      'Propriétés',
      () => {
        store.inspectorOpen = true
      },
      { hint: 'I', icon: 'panel' }
    ),
    SEPARATOR,
    item('Supprimer', () => store.removeSelection(), {
      hint: 'Suppr',
      icon: 'trash',
      danger: true
    })
  ]
}

function openMenu(request: EditorMenuRequest): void {
  const items: MenuItem[] = []
  const count = store.selectedIndexes.length + store.selectedPinIds.length
  const multi = count > 1
  const target = request.target

  if (target.kind === 'primitive') {
    const primitive = store.shown.visual.primitives[target.index]
    if (!primitive) return
    items.push(heading(multi ? `${count} éléments` : PRIMITIVE_KIND_LABELS[primitive.kind]))
    if (!multi) {
      const own = shapeItems(target.index, primitive)
      if (own.length > 0) items.push(...own, SEPARATOR)
      items.push(orderMenu(), SEPARATOR)
    }
    items.push(...commonItems())
  } else if (target.kind === 'pin') {
    const pin = store.shown.pins.find((candidate) => candidate.id === target.id)
    if (!pin) return
    items.push(heading(multi ? `${count} éléments` : `Broche ${pin.name}`))
    if (!multi) {
      items.push(
        item('Renommer…', () => renamePin(pin.id), { icon: 'edit' }),
        submenu(
          'Type',
          PIN_KINDS.map((kind) =>
            item(PIN_KIND_LABELS[kind], () => store.updatePin(pin.id, { kind }), {
              checked: pin.kind === kind
            })
          ),
          { icon: 'pin' }
        ),
        SEPARATOR
      )
    }
    items.push(...commonItems())
  } else {
    const { x, y } = request.point
    items.push(
      item('Coller ici', () => store.pasteClipboardAt(x, y), {
        hint: 'Ctrl+V',
        icon: 'clipboard',
        disabled: store.clipboardEmpty
      }),
      item('Tout sélectionner', () => store.selectAll(), { hint: 'Ctrl+A', icon: 'select-all' }),
      SEPARATOR,
      item('Importer une image…', () => void importImage(store), { icon: 'image' }),
      SEPARATOR,
      item('Ajuster à la fenêtre', () => void canvas.value?.fitAndCenter(), {
        hint: '0',
        icon: 'fit'
      }),
      item('Zoom 100 %', () => store.resetZoom(), { hint: '1', icon: 'zoom-in' }),
      SEPARATOR,
      item(
        'Panneau de propriétés',
        () => {
          store.inspectorOpen = !store.inspectorOpen
        },
        { hint: 'I', icon: 'panel', checked: store.inspectorOpen }
      )
    )
  }
  menu.value = { x: request.x, y: request.y, items }
}

const ARROWS: Record<string, readonly [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1]
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()
  const control = event.ctrlKey || event.metaKey
  if (openModals.value > 0) return

  if (control && key === 's') {
    event.preventDefault()
    void save()
    return
  }
  if (isEditable(event.target)) return

  if (control) {
    if (key === 'z' && !event.shiftKey) store.undo()
    else if (key === 'y' || (key === 'z' && event.shiftKey)) store.redo()
    else if (key === 'n') createNew()
    else if (key === 'a') store.selectAll()
    else if (key === 'c') store.copySelection()
    else if (key === 'v') store.pasteClipboard()
    else if (key === 'd') store.duplicateSelection()
    else if (key === 'g' && event.shiftKey) store.ungroupSelection()
    else if (key === 'g') store.groupSelection()
    else if (key === 'pageup') store.reorderPrimitive(event.shiftKey ? 'top' : 'up')
    else if (key === 'pagedown') store.reorderPrimitive(event.shiftKey ? 'bottom' : 'down')
    else return
    event.preventDefault()
    return
  }

  // Le chiffre de la rangée du haut demande Maj sur un clavier belge : on lit la touche physique.
  if (event.code === 'Digit0' || event.code === 'Numpad0') {
    void canvas.value?.fitAndCenter()
    event.preventDefault()
    return
  }
  if (event.code === 'Digit1' || event.code === 'Numpad1') {
    store.resetZoom()
    event.preventDefault()
    return
  }
  const arrow = ARROWS[key]
  if (arrow) {
    // D'un quart de cellule, le pas des formes ; d'une cellule dès qu'une broche est du voyage.
    const step = store.selectedPinIds.length > 0 ? QUARTERS_PER_CELL : 1
    store.moveSelection(
      store.selectedIndexes,
      store.selectedPinIds,
      arrow[0] * step,
      arrow[1] * step
    )
    event.preventDefault()
    return
  }
  const tool = TOOL_BY_KEY[key]
  if (tool) {
    store.tool = tool
    return
  }
  if (key === 'i') {
    store.inspectorOpen = !store.inspectorOpen
    return
  }
  if (key === 'backspace') {
    // Pendant une polyligne : retire son dernier point, comme pour un fil ou un lien.
    if (!canvas.value?.popPolylinePoint()) store.removeSelection()
    return
  }
  if (key === 'delete') {
    store.removeSelection()
    return
  }
  if (key === 'escape') {
    if (canvas.value?.cancel()) return
    if (store.selection) store.selection = null
    else store.tool = 'select'
    return
  }
  if (key === 'enter') canvas.value?.finishPolyline()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// Actions de fichier appelées par le menu Fichier de la barre d'application.
defineExpose({ save, createNew })
</script>

<template>
  <section class="editor">
    <EditorToolbar @save="save" />
    <div class="editor-body">
      <EditorCanvas ref="canvas" @open-menu="openMenu" />
      <EditorInspector v-if="store.inspectorOpen" :class="{ floating: store.inspectorFloating }" />
    </div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" @close="menu = null" />
    <PromptDialog
      v-if="prompt"
      :title="prompt.title"
      :label="prompt.label"
      :value="prompt.value"
      :multiline="prompt.multiline"
      @submit="prompt.onSubmit($event)"
      @close="prompt = null"
    />
  </section>
</template>

<style scoped>
.editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.editor-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
