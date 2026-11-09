<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { createEmptyComponent } from '@/domain'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import { saveComponentDoc } from '@/features/component-editor/componentActions'
import { useComponentEditorStore } from '@/features/component-editor/store'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import { saveProject } from '@/features/schematic-editor/projectActions'
import SchematicEditor from '@/features/schematic-editor/SchematicEditor.vue'
import { useSchematicStore } from '@/features/schematic-editor/store'
import SettingsDialog from '@/features/settings/SettingsDialog.vue'
import { clearAutosave, readAutosave, writeAutosave } from '@/io/autosave'
import { bridge } from '@/io/bridge'
import { baseName } from '@/io/paths'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, SEPARATOR, type MenuItem } from '@/ui/contextMenu'
import Icon from '@/ui/Icon.vue'
import { openModals } from '@/ui/modalState'
import { applyTheme } from '@/ui/theme'
import type { UpdateStatus } from '../../electron/api'
import ShortcutsHelp from './ShortcutsHelp.vue'
import { updateButtonLabel, updateButtonTitle } from './update'

// Coque applicative : menu Fichier, bascule entre les deux modes, thème, paramètres, aide,
// copie de secours et garde à la fermeture. Un seul éditeur est monté à la fois, donc un seul
// jeu de raccourcis ; le menu Fichier appelle les actions exposées par l'éditeur visible.

type Mode = 'components' | 'schematic'

const library = useLibraryStore()
const schematic = useSchematicStore()
const editor = useComponentEditorStore()
const mode = ref<Mode>('schematic')
const showSettings = ref(false)
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

const anyDirty = computed(() => schematic.dirty || editor.dirty)

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

// Copie de secours du montage, à intervalle régulier tant qu'il y a des modifications.
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let autosaveBusy = false

async function autosaveTick(): Promise<void> {
  if (autosaveBusy) return
  autosaveBusy = true
  try {
    if (schematic.dirty) await writeAutosave(schematic.doc, schematic.filePath)
    else await clearAutosave()
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

async function proposeRecovery(): Promise<void> {
  const found = await readAutosave()
  if (!found) return
  const when = new Date(found.meta.savedAt).toLocaleString('fr-BE')
  const where = found.meta.originalPath ?? 'montage jamais enregistré'
  const accept = window.confirm(
    `Une copie de secours du montage « ${found.meta.name} » existe (${when}, ${where}). La récupérer ?`
  )
  if (accept) {
    schematic.restoreProject(found.project, found.meta.originalPath)
    schematic.fitToContent()
    mode.value = 'schematic'
  } else {
    await clearAutosave()
  }
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  unsubscribe = bridge().onAppRequest((request) => {
    void (async () => {
      if (request === 'save-then-quit') {
        // « Enregistrer » avant de quitter : montage puis composant ; un refus garde la fenêtre.
        const montageSaved = !schematic.dirty || (await saveProject(schematic, library))
        const componentSaved = !editor.dirty || (await saveComponentDoc(editor, library))
        if (montageSaved && componentSaved) await bridge().confirmQuit()
        else await bridge().cancelQuit()
        return
      }
      if (request !== 'discard-then-quit') return
      // « Ne pas enregistrer » : la copie de secours disparaît, le prochain lancement part à vide.
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
  await library.init()
  // Les paramètres sont lus : la couleur des prochains fils part de la couleur par défaut.
  schematic.syncCurrentColor()
  await proposeRecovery()
  const launch = await bridge().getLaunchFile()
  if (launch && (!schematic.dirty || schematic.confirmDiscard())) {
    if (await schematic.openPath(launch)) mode.value = 'schematic'
  }
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribeUpdate?.()
  if (autosaveTimer) clearInterval(autosaveTimer)
})

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'F1') {
    event.preventDefault()
    if (openModals.value === 0) showHelp.value = true
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
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
        <button type="button" :class="{ active: mode === 'schematic' }" @click="mode = 'schematic'">
          Montage
        </button>
        <button
          type="button"
          :class="{ active: mode === 'components' }"
          @click="mode = 'components'"
        >
          Composants
        </button>
      </nav>
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
