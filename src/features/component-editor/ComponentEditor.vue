<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useLibraryStore } from '@/features/library/store'
import { openModals } from '@/ui/modalState'
import { saveComponentDoc } from './componentActions'
import EditorCanvas from './EditorCanvas.vue'
import EditorInspector from './EditorInspector.vue'
import EditorToolbar from './EditorToolbar.vue'
import { useComponentEditorStore } from './store'
import { TOOL_BY_KEY } from './tools'

// Éditeur de composants : barre d'outils, canevas, inspecteur, raccourcis clavier,
// enregistrement dans la bibliothèque.

const store = useComponentEditorStore()
const library = useLibraryStore()
const canvas = useTemplateRef<InstanceType<typeof EditorCanvas>>('canvas')

async function save(): Promise<void> {
  await saveComponentDoc(store, library)
}

function createNew(): void {
  store.newComponent()
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
    else if (key === 'c') store.copySelection()
    else if (key === 'v') store.pasteClipboard()
    else if (key === 'd') store.duplicateSelection()
    else if (key === 'pageup') store.reorderPrimitive(event.shiftKey ? 'top' : 'up')
    else if (key === 'pagedown') store.reorderPrimitive(event.shiftKey ? 'bottom' : 'down')
    else return
    event.preventDefault()
    return
  }

  const tool = TOOL_BY_KEY[key]
  if (tool) {
    store.tool = tool
    return
  }
  if (key === 'delete' || key === 'backspace') {
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
      <EditorInspector />
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
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
