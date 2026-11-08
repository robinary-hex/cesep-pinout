<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useComponentEditorStore } from '@/features/component-editor/store'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import SchematicEditor from '@/features/schematic-editor/SchematicEditor.vue'
import { useSchematicStore } from '@/features/schematic-editor/store'
import SettingsDialog from '@/features/settings/SettingsDialog.vue'
import { clearAutosave, readAutosave, writeAutosave } from '@/io/autosave'
import { bridge } from '@/io/bridge'
import { openModals } from '@/ui/modalState'
import ShortcutsHelp from './ShortcutsHelp.vue'

// Coque applicative : bascule entre les deux modes, paramètres, aide, copie de secours et garde
// à la fermeture. Un seul éditeur est monté à la fois, donc un seul jeu de raccourcis.

type Mode = 'components' | 'schematic'

const library = useLibraryStore()
const schematic = useSchematicStore()
const editor = useComponentEditorStore()
const mode = ref<Mode>('schematic')
const showSettings = ref(false)
const showHelp = ref(false)

const anyDirty = computed(() => schematic.dirty || editor.dirty)

watch(
  anyDirty,
  (value) => {
    void bridge().setDirty(value)
  },
  { immediate: true }
)

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
    if (request !== 'autosave-then-quit') return
    void (async () => {
      try {
        if (schematic.dirty) await writeAutosave(schematic.doc, schematic.filePath)
      } finally {
        await bridge().confirmQuit()
      }
    })()
  })
  await library.init()
  await proposeRecovery()
})

onUnmounted(() => {
  unsubscribe?.()
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
      <h1>Pinout</h1>
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
      <div class="spacer" />
      <button type="button" class="ghost" title="Raccourcis clavier (F1)" @click="showHelp = true">
        ?
      </button>
      <button type="button" class="ghost" title="Paramètres" @click="showSettings = true">
        Paramètres
      </button>
    </header>
    <main class="workspace">
      <LibraryPanel :mode="mode === 'components' ? 'edit' : 'place'" />
      <ComponentEditor v-if="mode === 'components'" />
      <SchematicEditor v-else />
    </main>
    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
    <ShortcutsHelp v-if="showHelp" @close="showHelp = false" />
  </div>
</template>
