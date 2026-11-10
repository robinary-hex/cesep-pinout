<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { createEmptyComponent } from '@/domain'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import { saveComponentDoc } from '@/features/component-editor/componentActions'
import { useComponentEditorStore } from '@/features/component-editor/store'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import { closeTabAsking, saveProject } from '@/features/schematic-editor/projectActions'
import SchematicEditor from '@/features/schematic-editor/SchematicEditor.vue'
import { useSchematicStore } from '@/features/schematic-editor/store'
import ProfileDialog from '@/features/settings/ProfileDialog.vue'
import SettingsDialog from '@/features/settings/SettingsDialog.vue'
import { clearAutosave, readAutosaves, syncAutosaves } from '@/io/autosave'
import { bridge } from '@/io/bridge'
import { baseName } from '@/io/paths'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, SEPARATOR, type MenuItem } from '@/ui/contextMenu'
import Icon from '@/ui/Icon.vue'
import { openModals } from '@/ui/modalState'
import { applyTheme } from '@/ui/theme'
import type { UpdateStatus } from '../../electron/api'
import { openExternalFile } from './externalFiles'
import ShortcutsHelp from './ShortcutsHelp.vue'
import { updateButtonLabel, updateButtonTitle } from './update'

// Coque applicative : menu Fichier, bascule entre les deux modes, onglets des montages ouverts,
// thème, paramètres, aide, copies de secours et garde à la fermeture. Un seul éditeur est monté à la fois, donc un seul
// jeu de raccourcis ; le menu Fichier appelle les actions exposées par l'éditeur visible.

type Mode = 'components' | 'schematic'

const library = useLibraryStore()
const schematic = useSchematicStore()
const editor = useComponentEditorStore()
// Au lancement, le montage ; l'onglet Composants est pourtant le premier de la barre.
const mode = ref<Mode>('schematic')
const showSettings = ref(false)
const showProfile = ref(false)
const showHelp = ref(false)

const schematicEditor = useTemplateRef<InstanceType<typeof SchematicEditor>>('schematicEditor')
const componentEditor = useTemplateRef<InstanceType<typeof ComponentEditor>>('componentEditor')
const fileButton = ref<HTMLButtonElement | null>(null)
const fileMenu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)

const MAX_RECENT_IN_MENU = 8

// Mise à jour automatique : le principal vérifie GitHub au lancement et tient cet état à jour ;
// le bouton en haut à droite n'apparaît que s'il y a quelque chose à faire.
const update = ref<UpdateStatus | null>(null)
let unsubscribeUpdate: (() => void) | null = null

async function onUpdateClick(): Promise<void> {
  const current = update.value
  if (!current) return
  if (current.state === 'available' || current.state === 'error') {
    update.value = { state: 'downloading', percent: 0 }
    await bridge().downloadUpdate()
  } else if (current.state === 'downloaded') {
    if (
      anyDirty.value &&
      !window.confirm(
        'Des modifications ne sont pas enregistrées. Installer la mise à jour et relancer quand même ?'
      )
    ) {
      return
    }
    await bridge().installUpdate()
  } else if (current.state === 'manual') {
    window.open(current.url)
  }
}

const anyDirty = computed(() => schematic.anyDirty || editor.dirty)

watch(
  anyDirty,
  (value) => {
    void bridge().setDirty(value)
  },
  { immediate: true }
)

watch(() => library.theme, applyTheme, { immediate: true })

/** Bouton « Nouveau » du panneau des composants : ouvre un composant vierge dans l'éditeur. */
function createComponent(): void {
  if (!editor.confirmDiscard()) return
  editor.open(createEmptyComponent('nouveau-composant', 'Nouveau composant'), null)
  mode.value = 'components'
}

// Onglets de montage : à droite du bouton Montage, un par montage ouvert.

function showTab(id: number): void {
  schematic.activateTab(id)
  mode.value = 'schematic'
}

function newTab(): void {
  schematic.newProject()
  mode.value = 'schematic'
}

/** Ferme un onglet ; un montage modifié demande d'abord : enregistrer, ne pas enregistrer, annuler. */
async function closeTab(id: number): Promise<void> {
  await closeTabAsking(schematic, library, id)
}

function closeTabOnMiddle(id: number, event: MouseEvent): void {
  if (event.button === 1) void closeTab(id)
}

// Glisser un onglet le réordonne : il prend la place de celui qu'il survole dès que le curseur
// en dépasse le milieu (sans ce seuil, deux onglets de largeurs différentes s'échangeraient en
// boucle).
const draggedTabId = ref<number | null>(null)

function onTabDragStart(id: number, event: DragEvent): void {
  draggedTabId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(id))
  }
}

function onTabDragOver(id: number, event: DragEvent): void {
  const dragged = draggedTabId.value
  if (dragged === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const target = event.currentTarget
  if (dragged === id || !(target instanceof HTMLElement)) return
  const ids = schematic.tabs.map((tab) => tab.id)
  const from = ids.indexOf(dragged)
  const to = ids.indexOf(id)
  if (from === -1 || to === -1) return
  const rect = target.getBoundingClientRect()
  const pastMiddle = event.clientX > rect.left + rect.width / 2
  if (from < to ? pastMiddle : !pastMiddle) schematic.moveTab(dragged, to)
}

/** La molette fait défiler la rangée d'onglets quand elle déborde. */
function onTabsWheel(event: WheelEvent): void {
  const strip = event.currentTarget
  if (strip instanceof HTMLElement) strip.scrollLeft += event.deltaY
}

// Menu Fichier

function fileMenuItems(): MenuItem[] {
  const common: MenuItem[] = [
    SEPARATOR,
    item(
      'Paramètres…',
      () => {
        showSettings.value = true
      },
      { icon: 'settings' }
    ),
    item(
      'Profil de style…',
      () => {
        showProfile.value = true
      },
      { icon: 'sliders' }
    ),
    item(
      'Raccourcis clavier',
      () => {
        showHelp.value = true
      },
      { hint: 'F1', icon: 'help' }
    ),
    SEPARATOR,
    item('Quitter', () => window.close(), { icon: 'power' })
  ]
  if (mode.value === 'components') {
    return [
      item('Nouveau composant', () => componentEditor.value?.createNew(), {
        hint: 'Ctrl+N',
        icon: 'file-plus'
      }),
      item('Enregistrer le composant', () => void componentEditor.value?.save(), {
        hint: 'Ctrl+S',
        icon: 'save',
        disabled: editor.hasErrors
      }),
      ...common
    ]
  }
  const recents = library.recentFiles.slice(0, MAX_RECENT_IN_MENU)
  return [
    item('Nouveau montage', () => schematicEditor.value?.createNew(), {
      hint: 'Ctrl+N',
      icon: 'file-plus'
    }),
    item('Ouvrir…', () => void schematicEditor.value?.open(), {
      hint: 'Ctrl+O',
      icon: 'folder-open'
    }),
    heading('Récents'),
    ...(recents.length === 0
      ? [item('Aucun projet récent', () => undefined, { disabled: true })]
      : recents.map((path) =>
          item(baseName(path), () => void schematicEditor.value?.openRecent(path), {
            icon: 'clock'
          })
        )),
    SEPARATOR,
    item('Enregistrer', () => void schematicEditor.value?.save(false), {
      hint: 'Ctrl+S',
      icon: 'save'
    }),
    item('Enregistrer sous…', () => void schematicEditor.value?.save(true), {
      hint: 'Ctrl+Maj+S',
      icon: 'save-as'
    }),
    item('Exporter en PNG ou SVG…', () => schematicEditor.value?.openExport(), {
      hint: 'Ctrl+E',
      icon: 'export'
    }),
    ...common
  ]
}

function openFileMenu(): void {
  const rect = fileButton.value?.getBoundingClientRect()
  fileMenu.value = {
    x: rect ? rect.left : 8,
    y: rect ? rect.bottom + 4 : 40,
    items: fileMenuItems()
  }
}

// Copies de secours, à intervalle régulier : une par montage modifié, les autres sont effacées.
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let autosaveBusy = false

async function autosaveTick(): Promise<void> {
  if (autosaveBusy) return
  autosaveBusy = true
  try {
    await syncAutosaves(schematic.dirtyDocuments())
  } catch (error) {
    schematic.status = `Copie de secours impossible : ${error instanceof Error ? error.message : String(error)}`
  } finally {
    autosaveBusy = false
  }
}

function scheduleAutosave(seconds: number): void {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = setInterval(() => void autosaveTick(), Math.max(10, seconds) * 1000)
}

watch(() => library.autosaveSeconds, scheduleAutosave, { immediate: true })

/** Au lancement : chaque copie de secours trouvée retrouve son onglet, si Robin le veut. */
async function proposeRecovery(): Promise<void> {
  const found = await readAutosaves()
  if (found.length === 0) return
  const lines = found.map(({ meta }) => {
    const when = new Date(meta.savedAt).toLocaleString('fr-BE')
    return `« ${meta.name} » (${when}, ${meta.originalPath ?? 'montage jamais enregistré'})`
  })
  const question =
    found.length === 1
      ? `Une copie de secours du montage ${lines.join('')} existe. La récupérer ?`
      : `Des copies de secours de ${found.length} montages existent :\n${lines.join('\n')}\nLes récupérer ?`
  if (window.confirm(question)) {
    for (const { project, meta } of found) schematic.restoreProject(project, meta.originalPath)
    mode.value = 'schematic'
  } else {
    await clearAutosave()
  }
}

// Fichiers venus de l'extérieur : passés au lancement, double-cliqués pendant que l'application
// tourne, ou déposés dans la fenêtre. Un montage prend un onglet, un composant l'éditeur.
async function openExternal(path: string): Promise<void> {
  const result = await openExternalFile(path, { schematic, editor, library })
  if (result.kind !== null) {
    mode.value = result.kind === 'project' ? 'schematic' : 'components'
  } else if (result.message.length > 0) {
    // Le refus s'affiche dans la barre d'état de l'éditeur visible.
    if (mode.value === 'components') editor.status = result.message
    else schematic.status = result.message
  }
}

function onWindowDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = openModals.value === 0 ? 'copy' : 'none'
}

function onWindowDrop(event: DragEvent): void {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  // Sans ceci, la fenêtre afficherait le fichier à la place de l'application.
  event.preventDefault()
  if (openModals.value > 0) return
  const paths = Array.from(files)
    .map((file) => bridge().pathForFile(file))
    .filter((path) => path.length > 0)
  void (async () => {
    for (const path of paths) await openExternal(path)
  })()
}

let unsubscribe: (() => void) | null = null
let unsubscribeOpenFile: (() => void) | null = null

onMounted(async () => {
  unsubscribe = bridge().onAppRequest((request) => {
    void (async () => {
      if (request === 'save-then-quit') {
        // « Enregistrer » avant de quitter : chaque montage modifié, affiché à son tour, puis le
        // composant ; un refus garde la fenêtre.
        let saved = true
        for (const tab of schematic.tabs.filter((candidate) => candidate.dirty)) {
          showTab(tab.id)
          if (!(await saveProject(schematic, library))) {
            saved = false
            break
          }
        }
        if (saved && editor.dirty) saved = await saveComponentDoc(editor, library)
        if (saved) await bridge().confirmQuit()
        else await bridge().cancelQuit()
        return
      }
      if (request !== 'discard-then-quit') return
      // « Ne pas enregistrer » : les copies de secours disparaissent, le prochain lancement part à vide.
      try {
        await clearAutosave()
      } finally {
        await bridge().confirmQuit()
      }
    })()
  })
  unsubscribeUpdate = bridge().onUpdateStatus((status) => {
    update.value = status
  })
  unsubscribeOpenFile = bridge().onOpenFile((path) => void openExternal(path))
  await library.init()
  // Les paramètres sont lus : le montage vierge du lancement repart du profil et de la couleur
  // par défaut.
  if (schematic.pristine) schematic.newProject()
  schematic.syncCurrentColor()
  await proposeRecovery()
  const launch = await bridge().getLaunchFile()
  if (launch) await openExternal(launch)
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribeUpdate?.()
  unsubscribeOpenFile?.()
  if (autosaveTimer) clearInterval(autosaveTimer)
})

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'F1') {
    event.preventDefault()
    if (openModals.value === 0) showHelp.value = true
  } else if (
    event.key === 'Tab' &&
    event.ctrlKey &&
    mode.value === 'schematic' &&
    openModals.value === 0
  ) {
    // Ctrl+Tab / Ctrl+Maj+Tab : montage suivant / précédent.
    event.preventDefault()
    schematic.cycleTab(event.shiftKey ? -1 : 1)
  }
}

/**
 * Un clic hors du champ en cours de saisie le valide d'abord : `blur()` déclenche son `change`
 * tout de suite, avant que le clic n'atteigne le canevas et que la sélection, en changeant, ne
 * retire le champ du panneau avec ce qu'on venait d'y taper.
 */
function commitFocusedField(event: PointerEvent): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
  if (event.target instanceof Node && active.contains(event.target)) return
  active.blur()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerdown', commitFocusedField, true)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointerdown', commitFocusedField, true)
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <button
        ref="fileButton"
        type="button"
        class="ghost with-icon"
        :class="{ open: fileMenu !== null }"
        title="Nouveau, ouvrir, enregistrer, exporter, paramètres, quitter"
        @click="openFileMenu"
      >
        Fichier <Icon name="chevron-down" :size="14" />
      </button>
      <nav class="modes">
        <button
          type="button"
          :class="{ active: mode === 'components' }"
          @click="mode = 'components'"
        >
          Composants
        </button>
        <button type="button" :class="{ active: mode === 'schematic' }" @click="mode = 'schematic'">
          Montage
        </button>
      </nav>
      <div class="doc-tabs" @wheel.prevent="onTabsWheel">
        <div
          v-for="tab in schematic.tabs"
          :key="tab.id"
          class="doc-tab"
          :class="{
            active: mode === 'schematic' && tab.id === schematic.activeTabId,
            dragging: tab.id === draggedTabId
          }"
          role="tab"
          tabindex="0"
          draggable="true"
          :title="tab.filePath ?? 'Pas encore enregistré'"
          @dragstart="onTabDragStart(tab.id, $event)"
          @dragover="onTabDragOver(tab.id, $event)"
          @drop.prevent
          @dragend="draggedTabId = null"
          @click="showTab(tab.id)"
          @keydown.enter="showTab(tab.id)"
          @mousedown.middle.prevent
          @auxclick.prevent="closeTabOnMiddle(tab.id, $event)"
        >
          <span class="doc-tab-label">
            <span class="doc-tab-name">{{ tab.name }}</span>
            <span v-if="tab.dirty" class="doc-tab-dot" title="Modifications non enregistrées" />
          </span>
          <button
            type="button"
            class="doc-tab-close"
            title="Fermer ce montage (ou clic du milieu sur l’onglet)"
            @click.stop="closeTab(tab.id)"
          >
            ✕
          </button>
        </div>
        <button
          type="button"
          class="ghost icon-only"
          title="Nouveau montage (Ctrl+N)"
          @click="newTab"
        >
          <Icon name="plus" :size="16" />
        </button>
      </div>
      <div class="spacer" />
      <button
        v-if="update"
        type="button"
        class="with-icon update"
        :class="update.state"
        :disabled="update.state === 'downloading'"
        :title="updateButtonTitle(update)"
        @click="onUpdateClick"
      >
        <Icon name="export" :size="15" /> {{ updateButtonLabel(update) }}
      </button>
      <div class="group">
        <button
          type="button"
          class="ghost icon-only"
          title="Raccourcis clavier (F1)"
          @click="showHelp = true"
        >
          <Icon name="help" :size="18" />
        </button>
        <button
          type="button"
          class="ghost icon-only"
          title="Profil de style de l’application"
          @click="showProfile = true"
        >
          <Icon name="sliders" :size="18" />
        </button>
        <button
          type="button"
          class="ghost icon-only"
          title="Paramètres"
          @click="showSettings = true"
        >
          <Icon name="settings" :size="18" />
        </button>
      </div>
    </header>
    <main class="workspace">
      <LibraryPanel :mode="mode === 'components' ? 'edit' : 'place'" @create="createComponent" />
      <ComponentEditor v-if="mode === 'components'" ref="componentEditor" />
      <SchematicEditor v-else ref="schematicEditor" />
    </main>
    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
    <ProfileDialog v-if="showProfile" @close="showProfile = false" />
    <ShortcutsHelp v-if="showHelp" @close="showHelp = false" />
    <ContextMenu
      v-if="fileMenu"
      :x="fileMenu.x"
      :y="fileMenu.y"
      :items="fileMenu.items"
      @close="fileMenu = null"
    />
  </div>
</template>
