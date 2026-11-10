<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import {
  buildDiagramSvg,
  isEmptyDiagram,
  NODE_SPECS,
  type ExportSettings,
  type SvgExport
} from '@/domain'
import ExportDialog from '@/features/export/ExportDialog.vue'
import { useLibraryStore } from '@/features/library/store'
import { chooseDiagramToOpen } from '@/io/diagramFiles'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, SEPARATOR, type MenuItem } from '@/ui/contextMenu'
import { openModals } from '@/ui/modalState'
import PromptDialog from '@/ui/PromptDialog.vue'
import { lastDiagramDir, saveDiagram } from './diagramActions'
import DiagramCanvas from './DiagramCanvas.vue'
import DiagramInspector from './DiagramInspector.vue'
import DiagramToolbar from './DiagramToolbar.vue'
import type { DiagramMenuRequest } from './menu'
import { useDiagramStore } from './store'

// Éditeur de diagramme : barre d'outils, canevas, panneau de propriétés (replié par défaut),
// raccourcis, menu contextuel, boîtes de saisie et fichiers. Mêmes touches que le montage partout
// où le geste est le même (V, F, E, I, Suppr, flèches, Ctrl+…).

const store = useDiagramStore()
const library = useLibraryStore()
const canvas = useTemplateRef<InstanceType<typeof DiagramCanvas>>('canvas')

interface PromptState {
  title: string
  label: string
  value: string
  placeholder?: string
  hint?: string
  onSubmit: (value: string) => void
}

const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)
const prompt = ref<PromptState | null>(null)
const showExport = ref(false)

async function save(as = false): Promise<void> {
  await saveDiagram(store, library, as)
}

async function open(): Promise<void> {
  const path = await chooseDiagramToOpen(lastDiagramDir(library))
  if (path === null) return
  await store.openPath(path)
}

async function openRecent(path: string): Promise<void> {
  await store.openPath(path)
}

function createNew(): void {
  store.newDiagram()
}

function buildSvg(options: ExportSettings, darkPage: boolean): SvgExport | null {
  return buildDiagramSvg(store.doc, options, darkPage)
}

function openExport(): void {
  if (isEmptyDiagram(store.doc)) {
    store.status = 'Le diagramme est vide : rien à exporter.'
    return
  }
  showExport.value = true
}

// Saisies

function editLinkLabel(id: string): void {
  const link = store.doc.links.find((candidate) => candidate.id === id)
  if (!link) return
  prompt.value = {
    title: 'Lien',
    label: 'Étiquette',
    value: link.label,
    placeholder: 'vrai, [sinon], topic : message…',
    hint: 'Elle longe le trait : glisse-la le long du lien, ou de l’autre côté. Vide : aucune.',
    onSubmit: (value) => store.setLinkLabel(id, value)
  }
}

function editText(id: string): void {
  const text = store.doc.texts.find((candidate) => candidate.id === id)
  if (!text) return
  prompt.value = {
    title: 'Texte',
    label: 'Texte',
    value: text.text,
    onSubmit: (value) => store.setTextContent(id, value)
  }
}

// Menu contextuel

function swatchItem(current: string | null): MenuItem {
  const matches = (hex: string): boolean => current?.toLowerCase() === hex.toLowerCase()
  return {
    kind: 'swatches',
    swatches: store.colorChoices.map((choice) => ({ ...choice, current: matches(choice.hex) })),
    pick: (hex) => store.setCurrentColor(hex)
  }
}

function commonItems(): MenuItem[] {
  return [
    item('Dupliquer', () => store.duplicateSelection(), { hint: 'Ctrl+D', icon: 'duplicate' }),
    item('Copier', () => store.copySelection(), { hint: 'Ctrl+C', icon: 'copy' }),
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

function orderItems(): MenuItem[] {
  return [
    item('Avancer', () => store.reorderNodes('up'), { hint: 'Ctrl+Page haut', icon: 'arrow-up' }),
    item('Reculer', () => store.reorderNodes('down'), {
      hint: 'Ctrl+Page bas',
      icon: 'arrow-down'
    }),
    item('Premier plan', () => store.reorderNodes('top'), {
      hint: 'Ctrl+Maj+Page haut',
      icon: 'arrow-up-line'
    }),
    item('Arrière-plan', () => store.reorderNodes('bottom'), {
      hint: 'Ctrl+Maj+Page bas',
      icon: 'arrow-down-line'
    })
  ]
}

function openMenu(request: DiagramMenuRequest): void {
  const items: MenuItem[] = []
  const count = store.selectedNodes.length + store.selectedLinks.length + store.selectedTexts.length
  const multi = count > 1
  const target = request.target

  if (target.kind === 'node') {
    const node = store.doc.nodes.find((candidate) => candidate.id === target.id)
    if (!node) return
    const spec = NODE_SPECS[node.shape]
    items.push(heading(multi ? `${count} éléments` : spec.label))
    if (!multi && spec.text) {
      items.push(
        item('Modifier le texte…', () => canvas.value?.openEditor(node.id), { icon: 'edit' }),
        item('Ajuster au texte', () => store.fitNodeToText(node.id), { icon: 'fit' })
      )
    }
    if (!multi && spec.line) {
      items.push(item('Tourner', () => store.turnBar(node.id), { hint: 'R', icon: 'rotate-cw' }))
    }
    items.push(
      swatchItem(multi ? null : node.color),
      SEPARATOR,
      heading('Fond'),
      item('Contour', () => store.setCurrentFill('none'), {
        checked: !multi && node.fill === 'none'
      }),
      item('Teinté', () => store.setCurrentFill('tint'), {
        checked: !multi && node.fill === 'tint'
      }),
      item('Plein', () => store.setCurrentFill('solid'), {
        checked: !multi && node.fill === 'solid'
      }),
      SEPARATOR,
      ...orderItems(),
      SEPARATOR,
      ...commonItems()
    )
  } else if (target.kind === 'link') {
    const link = store.doc.links.find((candidate) => candidate.id === target.id)
    if (!link) return
    const ids = multi ? store.selectedLinks : [link.id]
    items.push(heading(multi ? `${count} éléments` : 'Lien'))
    if (!multi) {
      items.push(
        item(
          link.label.length > 0 ? `Étiquette : ${link.label}…` : 'Étiquette…',
          () => editLinkLabel(link.id),
          { icon: 'tag' }
        )
      )
    }
    items.push(
      swatchItem(multi ? null : link.color),
      SEPARATOR,
      item('Flèche au départ', () => store.setLinksStyle(ids, { startArrow: !link.startArrow }), {
        checked: link.startArrow,
        icon: 'arrow-left'
      }),
      item('Flèche à l’arrivée', () => store.setLinksStyle(ids, { endArrow: !link.endArrow }), {
        checked: link.endArrow,
        icon: 'arrow-right'
      }),
      item(
        'Pointillés',
        () => store.setLinksStyle(ids, { dash: link.dash === 'dashed' ? 'solid' : 'dashed' }),
        { checked: link.dash === 'dashed', icon: 'dash' }
      ),
      item('Inverser le sens', () => store.reverseLinks(ids), { icon: 'swap' }),
      SEPARATOR,
      ...commonItems()
    )
  } else if (target.kind === 'text') {
    const text = store.doc.texts.find((candidate) => candidate.id === target.id)
    if (!text) return
    items.push(heading(multi ? `${count} éléments` : 'Texte'))
    if (!multi) {
      items.push(
        item('Modifier le texte…', () => editText(text.id), { icon: 'edit' }),
        item(
          'Gras',
          () =>
            store.setTextStyle(text.id, text.bold ? 'Gras retiré' : 'Gras activé', {
              bold: !text.bold
            }),
          { checked: text.bold, icon: 'bold' }
        ),
        SEPARATOR
      )
    }
    items.push(...commonItems())
  } else {
    const [x, y] = request.cell
    items.push(
      item('Coller ici', () => store.pasteClipboardAt(x, y), {
        hint: 'Ctrl+V',
        icon: 'clipboard',
        disabled: store.clipboardEmpty
      }),
      item('Tout sélectionner', () => store.selectAll(), { hint: 'Ctrl+A', icon: 'select-all' }),
      SEPARATOR,
      item('Tracer un lien', () => store.startLinkTool(), { hint: 'F', icon: 'link' }),
      item(
        'Poser un texte ici',
        () => {
          store.addText(x, y)
        },
        { hint: 'E', icon: 'type' }
      ),
      SEPARATOR,
      item('Ajuster au contenu', () => store.fitToContent(), { hint: '0', icon: 'fit' }),
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

// Clavier

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** R : tourne les barres sélectionnées. */
function turnSelectedBars(): void {
  for (const id of store.selectedNodes) store.turnBar(id)
}

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()
  const control = event.ctrlKey || event.metaKey
  const editable = isEditable(event.target)

  if (key === 'shift') store.shiftHeld = true
  if (key === 'control') store.ctrlHeld = true
  if (openModals.value > 0) return

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
  if (control && key === 'e') {
    event.preventDefault()
    openExport()
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
        store.reorderNodes(event.shiftKey ? 'top' : 'up')
        break
      case 'pagedown':
        store.reorderNodes(event.shiftKey ? 'bottom' : 'down')
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
    case 'f':
      store.startLinkTool()
      break
    case 'e':
      store.startTextTool()
      break
    case 'i':
      store.inspectorOpen = !store.inspectorOpen
      break
    case 'r':
      turnSelectedBars()
      break
    case 'enter':
      if (store.drawing) {
        store.finishLink()
      } else if (
        store.selectedNodes.length === 1 &&
        store.selectedLinks.length === 0 &&
        store.selectedTexts.length === 0
      ) {
        // Entrée sur un nœud seul sélectionné : on tape son texte.
        const id = store.selectedNodes[0]
        if (id !== undefined) canvas.value?.openEditor(id)
      }
      break
    case 'backspace':
      if (store.drawing) store.popLinkVertex()
      else store.removeSelection()
      break
    case 'delete':
      store.removeSelection()
      break
    case 'escape':
      if (canvas.value?.cancel()) break
      if (store.stopLinkDrawing()) break
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
  if (event.key === 'Control') store.ctrlHeld = false
}

function onBlur(): void {
  store.panKeyHeld = false
  store.shiftHeld = false
  store.ctrlHeld = false
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
  store.ctrlHeld = false
})

// Actions de fichier appelées par le menu Fichier de la barre d'application.
defineExpose({ createNew, open, openRecent, save, openExport })
</script>

<template>
  <section class="editor">
    <DiagramToolbar />
    <div class="editor-body">
      <DiagramCanvas
        ref="canvas"
        @open-menu="openMenu"
        @edit-link="editLinkLabel"
        @edit-text="editText"
      />
      <DiagramInspector
        v-if="store.inspectorOpen"
        :class="{ floating: store.inspectorFloating }"
        @export-image="openExport"
      />
    </div>
    <ExportDialog
      v-if="showExport"
      what="diagramme"
      :name="store.doc.name"
      :file-path="store.filePath"
      :cell-px="store.doc.style.cellPx"
      ink-follows-background
      :build="buildSvg"
      @close="showExport = false"
    />
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" @close="menu = null" />
    <PromptDialog
      v-if="prompt"
      :title="prompt.title"
      :label="prompt.label"
      :value="prompt.value"
      :placeholder="prompt.placeholder"
      :hint="prompt.hint"
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
