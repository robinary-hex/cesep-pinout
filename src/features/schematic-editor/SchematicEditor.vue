<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { FileFormatError } from '@/domain'
import {
  chooseProjectToOpen,
  chooseProjectToSave,
  readProject,
  writeProject
} from '@/io/projectFiles'
import SchematicCanvas from './SchematicCanvas.vue'
import SchematicInspector from './SchematicInspector.vue'
import SchematicToolbar from './SchematicToolbar.vue'
import { useSchematicStore } from './store'

// Éditeur de montage : barre d'outils, canevas, inspecteur, raccourcis, fichiers de projet.

const store = useSchematicStore()
const canvas = useTemplateRef<InstanceType<typeof SchematicCanvas>>('canvas')

function describe(error: unknown): string {
  if (error instanceof FileFormatError) return [error.message, ...error.issues].join(' — ')
  return error instanceof Error ? error.message : String(error)
}

async function save(as = false): Promise<void> {
  let path = store.filePath
  if (as || path === null) {
    path = await chooseProjectToSave(store.doc.name)
    if (path === null) return
  }
  try {
    await writeProject(path, store.doc)
    store.markSaved(path)
    store.status = `Enregistré : ${path}`
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${describe(error)}`
  }
}

async function open(): Promise<void> {
  if (!store.confirmDiscard()) return
  const path = await chooseProjectToOpen()
  if (path === null) return
  try {
    const project = await readProject(path)
    store.openProject(project, path)
    store.fitToContent()
    store.status = `Ouvert : ${path}`
  } catch (error) {
    store.status = `Ouverture impossible : ${describe(error)}`
  }
}

function createNew(): void {
  if (!store.confirmDiscard()) return
  store.newProject()
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
  const editable = isEditable(event.target)

  if (key === 'shift') store.shiftHeld = true
  if (key === ' ' && !editable) {
    store.panKeyHeld = true
    event.preventDefault()
    return
  }
  if (control && key === 's') {
    event.preventDefault()
    void save(event.shiftKey)
    return
  }
  if (control && key === 'o') {
    event.preventDefault()
    void open()
    return
  }
  if (editable) return

  if (control) {
    switch (key) {
      case 'z':
        if (event.shiftKey) store.redo()
        else store.undo()
        break
      case 'y':
        store.redo()
        break
      case 'n':
        createNew()
        break
      case 'a':
        store.selectAll()
        break
      case 'd':
        store.duplicateSelection()
        break
      case 'c':
        store.copySelection()
        break
      case 'v':
        store.pasteClipboard()
        break
      case 'pageup':
        store.reorderWires(event.shiftKey ? 'top' : 'up')
        break
      case 'pagedown':
        store.reorderWires(event.shiftKey ? 'bottom' : 'down')
        break
      default:
        return
    }
    event.preventDefault()
    return
  }

  // Les chiffres de la rangée du haut demandent Maj sur un clavier belge : on lit la touche physique.
  if (event.code === 'Digit0' || event.code === 'Numpad0') {
    store.fitToContent()
    event.preventDefault()
    return
  }
  if (event.code === 'Digit1' || event.code === 'Numpad1') {
    store.resetZoom()
    event.preventDefault()
    return
  }

  switch (key) {
    case 'v':
      store.selectTool()
      break
    case 'w':
      store.startWireTool()
      break
    case 'r':
      store.rotate(event.shiftKey ? 'ccw' : 'cw')
      break
    case 't':
      store.flip(event.shiftKey ? 'vertical' : 'horizontal')
      break
    case 'enter':
      store.finishWire()
      break
    case 'backspace':
      if (store.drawing) store.popWireVertex()
      else store.removeSelection()
      break
    case 'delete':
      store.removeSelection()
      break
    case 'escape':
      if (canvas.value?.cancel()) break
      if (store.cancelWire()) break
      if (store.placement) {
        store.stopPlacing()
        break
      }
      if (store.hasSelection) {
        store.clearSelection()
        break
      }
      store.selectTool()
      break
    case 'arrowleft':
      store.moveSelection(-1, 0)
      break
    case 'arrowright':
      store.moveSelection(1, 0)
      break
    case 'arrowup':
      store.moveSelection(0, -1)
      break
    case 'arrowdown':
      store.moveSelection(0, 1)
      break
    default:
      return
  }
  event.preventDefault()
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === ' ') store.panKeyHeld = false
  if (event.key === 'Shift') store.shiftHeld = false
}

function onBlur(): void {
  store.panKeyHeld = false
  store.shiftHeld = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  store.panKeyHeld = false
  store.shiftHeld = false
})
</script>

<template>
  <section class="editor">
    <SchematicToolbar @create="createNew" @open="open" @save="save(false)" @save-as="save(true)" />
    <div class="editor-body">
      <SchematicCanvas ref="canvas" />
      <SchematicInspector />
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
