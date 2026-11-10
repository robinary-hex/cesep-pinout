<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { QUARTERS_PER_CELL } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { openModals } from '@/ui/modalState'
import { saveComponentDoc } from './componentActions'
import EditorCanvas from './EditorCanvas.vue'
import EditorInspector from './EditorInspector.vue'
import EditorToolbar from './EditorToolbar.vue'
import { useComponentEditorStore } from './store'
import { TOOL_BY_KEY } from './tools'

// Éditeur de composants : barre d'outils, canevas, inspecteur (replié par défaut, comme dans les
// autres éditeurs), raccourcis clavier,
// enregistrement dans la bibliothèque. Les touches communes aux trois éditeurs (flèches, Ctrl+A,
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
      <EditorCanvas ref="canvas" />
      <EditorInspector v-if="store.inspectorOpen" :class="{ floating: store.inspectorFloating }" />
    </div>
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
