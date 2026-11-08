<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import {
  componentFields,
  FileFormatError,
  type ComponentDefinition,
  type ComponentField,
  type ComponentInstance,
  type Wire
} from '@/domain'
import ExportDialog from '@/features/export/ExportDialog.vue'
import { useLibraryStore } from '@/features/library/store'
import { clearAutosave } from '@/io/autosave'
import { chooseProjectToOpen, chooseProjectToSave, writeProject } from '@/io/projectFiles'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, SEPARATOR, type MenuItem } from '@/ui/contextMenu'
import { openModals } from '@/ui/modalState'
import PromptDialog from '@/ui/PromptDialog.vue'
import type { MenuRequest } from './menu'
import ProfileDialog from './ProfileDialog.vue'
import SchematicCanvas from './SchematicCanvas.vue'
import SchematicInspector from './SchematicInspector.vue'
import SchematicToolbar from './SchematicToolbar.vue'
import { useSchematicStore } from './store'

// Éditeur de montage : barre d'outils, canevas, inspecteur (replié par défaut), raccourcis,
// menu contextuel, boîtes de saisie, fichiers de projet, export et profil de style.

const store = useSchematicStore()
const library = useLibraryStore()
const canvas = useTemplateRef<InstanceType<typeof SchematicCanvas>>('canvas')
const showExport = ref(false)
const showProfile = ref(false)

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
    await clearAutosave()
    await library.addRecentFile(path)
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${describe(error)}`
  }
}

async function open(): Promise<void> {
  if (!store.confirmDiscard()) return
  const path = await chooseProjectToOpen()
  if (path === null) return
  await store.openPath(path)
}

async function openRecent(path: string): Promise<void> {
  if (!store.confirmDiscard()) return
  await store.openPath(path)
}

function createNew(): void {
  if (!store.confirmDiscard()) return
  store.newProject()
}

function openExport(): void {
  if (store.doc.components.length === 0 && store.doc.wires.length === 0) {
    store.status = 'Le montage est vide : rien à exporter.'
    return
  }
  showExport.value = true
}

// Saisie des valeurs (repère, champs, texte d'étiquette)

function instanceOf(id: string): { instance: ComponentInstance; def: ComponentDefinition } | null {
  const instance = store.doc.components.find((candidate) => candidate.id === id)
  const def = instance ? store.doc.embeddedDefs[instance.defId] : undefined
  return instance && def ? { instance, def } : null
}

function instanceTitle(instance: ComponentInstance, def: ComponentDefinition): string {
  return instance.label.length > 0 ? `${def.name} · ${instance.label}` : def.name
}

function withUnit(value: string, unit: string): string {
  return unit.length > 0 ? `${value} ${unit}` : value
}

function editField(id: string, field: ComponentField): void {
  const found = instanceOf(id)
  if (!found) return
  const unitLabel = field.unit.length > 0 ? ` (${field.unit})` : ''
  prompt.value = {
    title: instanceTitle(found.instance, found.def),
    label: `Valeur de « ${field.name} »${unitLabel}`,
    value: found.instance.fields[field.name] ?? '',
    placeholder: field.defaultValue,
    hint:
      field.defaultValue.length > 0
        ? `Vide : valeur par défaut « ${withUnit(field.defaultValue, field.unit)} ».`
        : 'Vide : le nom du champ s’affiche.',
    onSubmit: (value) => store.setInstanceField(id, field.name, value)
  }
}

function editInstanceLabel(id: string): void {
  const found = instanceOf(id)
  if (!found) return
  prompt.value = {
    title: found.def.name,
    label: 'Repère',
    value: found.instance.label,
    placeholder: 'R1, U2…',
    onSubmit: (value) => store.setInstanceLabel(id, value.trim())
  }
}

function editLabelText(id: string): void {
  const label = store.doc.labels.find((candidate) => candidate.id === id)
  if (!label) return
  prompt.value = {
    title: 'Étiquette',
    label: 'Texte',
    value: label.text,
    onSubmit: (value) => store.setLabelText(id, value)
  }
}

/** Double-clic : la valeur s'il y a un seul champ, le panneau s'il y en a plusieurs, sinon le repère. */
function editInstance(id: string): void {
  const found = instanceOf(id)
  if (!found) return
  const fields = componentFields(found.def)
  const only = fields[0]
  if (fields.length === 1 && only) editField(id, only)
  else if (fields.length > 1) store.inspectorOpen = true
  else editInstanceLabel(id)
}

function editWireEnd(wireId: string, endIndex: number): void {
  const wire = store.doc.wires.find((candidate) => candidate.id === wireId)
  if (!wire) return
  const atStart = endIndex === 0
  prompt.value = {
    title: 'Étiquette d’extrémité',
    label: atStart ? 'Texte au départ du fil' : 'Texte à l’arrivée du fil',
    value: atStart ? wire.endLabels.start : wire.endLabels.end,
    placeholder: 'VCC, GND, vers J3…',
    hint: 'Un point marque le bout libre, le texte se place dans le prolongement du fil. Vide : aucune.',
    onSubmit: (value) => store.setWireEndLabel(wireId, endIndex, value)
  }
}

function endLabelTitle(wire: Wire, endIndex: number): string {
  const text = endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
  const where = endIndex === 0 ? 'Étiquette au départ' : 'Étiquette à l’arrivée'
  return text.length > 0 ? `${where} : ${text}…` : `${where}…`
}

// Menu contextuel

function swatchItem(current: string | null): MenuItem {
  const matches = (hex: string): boolean => current?.toLowerCase() === hex.toLowerCase()
  return {
    kind: 'swatches',
    swatches: [
      ...library.palette.map((color) => ({
        hex: color.hex,
        name: color.name,
        current: matches(color.hex)
      })),
      ...library.customColors.map((hex) => ({ hex, name: hex, current: matches(hex) }))
    ],
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

function openMenu(request: MenuRequest): void {
  const items: MenuItem[] = []
  const count = store.selection.length + store.selectedWires.length + store.selectedLabels.length
  const multi = count > 1
  const target = request.target

  if (target.kind === 'instance') {
    const found = instanceOf(target.id)
    if (!found) return
    const { instance, def } = found
    items.push(heading(multi ? `${count} éléments` : instanceTitle(instance, def)))
    if (!multi) {
      for (const field of componentFields(def)) {
        const shown = instance.fields[field.name] ?? field.defaultValue
        const text = shown.length > 0 ? withUnit(shown, field.unit) : '(vide)'
        items.push(
          item(`${field.name} : ${text}…`, () => editField(instance.id, field), { icon: 'edit' })
        )
      }
      items.push(item('Repère…', () => editInstanceLabel(instance.id), { icon: 'tag' }))
      const newer = store.newerLibraryDefinition(def.id)
      if (newer) {
        items.push(
          item('Mettre à jour depuis la bibliothèque', () => store.updateDefinition(newer), {
            icon: 'refresh'
          })
        )
      }
      items.push(SEPARATOR)
    }
    items.push(
      item('Rotation horaire', () => store.rotate('cw'), { hint: 'R', icon: 'rotate-cw' }),
      item('Rotation antihoraire', () => store.rotate('ccw'), {
        hint: 'Maj+R',
        icon: 'rotate-ccw'
      }),
      item('Miroir horizontal', () => store.flip('horizontal'), { hint: 'T', icon: 'flip-h' }),
      item('Miroir vertical', () => store.flip('vertical'), { hint: 'Maj+T', icon: 'flip-v' }),
      SEPARATOR,
      ...commonItems()
    )
  } else if (target.kind === 'wire') {
    const wire = store.doc.wires.find((candidate) => candidate.id === target.id)
    if (!wire) return
    const wiresOnly = count === store.selectedWires.length
    items.push(heading(multi ? (wiresOnly ? `${count} fils` : `${count} éléments`) : 'Fil'))
    items.push(swatchItem(multi ? null : wire.color))
    if (!multi) {
      const last = wire.points.length - 1
      items.push(
        SEPARATOR,
        heading('Extrémités libres'),
        item('Nettes', () => store.setWireFreeEnds(wire.id, 'flat'), {
          checked: wire.freeEnds === 'flat'
        }),
        item('En flèche', () => store.setWireFreeEnds(wire.id, 'arrow'), {
          checked: wire.freeEnds === 'arrow',
          icon: 'arrow-right'
        }),
        item('En pointillés', () => store.setWireFreeEnds(wire.id, 'dotted'), {
          checked: wire.freeEnds === 'dotted',
          icon: 'dots'
        }),
        item(endLabelTitle(wire, 0), () => editWireEnd(wire.id, 0), { icon: 'tag' }),
        item(endLabelTitle(wire, last), () => editWireEnd(wire.id, last), { icon: 'tag' })
      )
    }
    items.push(
      SEPARATOR,
      item('Avancer', () => store.reorderWires('up'), {
        hint: 'Ctrl+Page haut',
        icon: 'arrow-up'
      }),
      item('Reculer', () => store.reorderWires('down'), {
        hint: 'Ctrl+Page bas',
        icon: 'arrow-down'
      }),
      item('Premier plan', () => store.reorderWires('top'), {
        hint: 'Ctrl+Maj+Page haut',
        icon: 'arrow-up-line'
      }),
      item('Arrière-plan', () => store.reorderWires('bottom'), {
        hint: 'Ctrl+Maj+Page bas',
        icon: 'arrow-down-line'
      }),
      SEPARATOR,
      ...commonItems()
    )
  } else if (target.kind === 'label') {
    const label = store.doc.labels.find((candidate) => candidate.id === target.id)
    if (!label) return
    items.push(heading(multi ? `${count} éléments` : 'Étiquette'))
    if (!multi) {
      items.push(
        item('Modifier le texte…', () => editLabelText(label.id), { icon: 'edit' }),
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
      item('Tracer un fil', () => store.startWireTool(), { hint: 'F', icon: 'wire' }),
      item(
        'Poser une étiquette ici',
        () => {
          store.addLabel(x, y)
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

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()
  const control = event.ctrlKey || event.metaKey
  const editable = isEditable(event.target)

  if (key === 'shift') store.shiftHeld = true
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
    case 'f':
      store.startWireTool()
      break
    case 'e':
      store.startTextTool()
      break
    case 'i':
      store.inspectorOpen = !store.inspectorOpen
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

// Actions de fichier appelées par le menu Fichier de la barre d'application.
defineExpose({ createNew, open, openRecent, save, openExport })
</script>

<template>
  <section class="editor">
    <SchematicToolbar />
    <div class="editor-body">
      <SchematicCanvas
        ref="canvas"
        @open-menu="openMenu"
        @edit-instance="editInstance"
        @edit-label="editLabelText"
        @edit-wire-end="editWireEnd"
      />
      <SchematicInspector
        v-if="store.inspectorOpen"
        @edit-profile="showProfile = true"
        @save="save(false)"
        @export-image="openExport"
      />
    </div>
    <ExportDialog v-if="showExport" @close="showExport = false" />
    <ProfileDialog v-if="showProfile" @close="showProfile = false" />
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
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
