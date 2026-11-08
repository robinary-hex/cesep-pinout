<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { createEmptyComponent } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { newComponentId, saveComponent } from '@/io/library'
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
  if (store.hasErrors) {
    store.status = 'Corrige les erreurs listées à droite avant d’enregistrer.'
    return
  }
  if (library.libraryDir.length === 0) {
    store.status = 'Bibliothèque indisponible : choisis un dossier dans le panneau de gauche.'
    return
  }
  if (store.folder === null) {
    store.setId(newComponentId(store.doc.name, library.ids))
  }
  try {
    const folder = await saveComponent(library.libraryDir, store.doc)
    store.markSaved(folder)
    store.status = `Enregistré dans ${folder}`
    await library.refresh()
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${error instanceof Error ? error.message : String(error)}`
  }
}

function createNew(): void {
  if (!store.confirmDiscard()) return
  store.open(createEmptyComponent('nouveau-composant', 'Nouveau composant'), null)
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
</script>

<template>
  <section class="editor">
    <EditorToolbar @save="save" @create="createNew" />
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
