<script setup lang="ts">
import { computed, ref } from 'vue'
import DiagramLibrary from '@/features/diagram-editor/DiagramLibrary.vue'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import DocumentList from './DocumentList.vue'

// Panneau latéral gauche, le même dans les trois modes (décision du 18 novembre 2026) : une
// rangée d'onglets, le champ de recherche, puis la liste. Toujours de la même largeur
// (`--side-panel-width`) et de la même disposition, pour que le champ de recherche ne bouge pas
// d'un mode à l'autre. Le premier onglet est ce qu'on pose ou qu'on ouvre dans ce mode : les
// composants de la bibliothèque (modes Composants et Montage), les formes (mode Diagramme). Le
// second, « Fichiers », liste les montages ou les diagrammes du dossier de Pinout ; le mode
// Composants ne l'a pas : la bibliothèque y est déjà la liste de ses fichiers.

type Mode = 'components' | 'schematic' | 'diagram'
type SideTab = 'library' | 'files'

const props = defineProps<{ mode: Mode }>()
/** `edit` : un composant vient d'être ouvert dans l'éditeur de composants, à montrer. */
const emit = defineEmits<{ edit: [] }>()

const library = useLibraryStore()

/** Onglet montré dans chaque mode : on le retrouve en y revenant. */
const shownTab = ref<Record<Mode, SideTab>>({
  components: 'library',
  schematic: 'library',
  diagram: 'library'
})

const tabs = computed<{ id: SideTab; label: string }[]>(() => {
  const first = {
    id: 'library' as const,
    label: props.mode === 'diagram' ? 'Formes' : 'Composants'
  }
  return props.mode === 'components'
    ? [first]
    : [first, { id: 'files' as const, label: 'Fichiers' }]
})

const tab = computed<SideTab>({
  get: () => (props.mode === 'components' ? 'library' : shownTab.value[props.mode]),
  set: (value) => {
    shownTab.value = { ...shownTab.value, [props.mode]: value }
  }
})

// Une recherche par liste : celle des composants est dans le store de la bibliothèque (commune
// aux modes Composants et Montage), les autres vivent ici.
const shapeSearch = ref('')
const fileSearch = ref({ schematic: '', diagram: '' })

const search = computed<string>({
  get: () => {
    if (tab.value === 'files') {
      return props.mode === 'diagram' ? fileSearch.value.diagram : fileSearch.value.schematic
    }
    return props.mode === 'diagram' ? shapeSearch.value : library.search
  },
  set: (value) => {
    if (tab.value === 'files') {
      const key = props.mode === 'diagram' ? 'diagram' : 'schematic'
      fileSearch.value = { ...fileSearch.value, [key]: value }
    } else if (props.mode === 'diagram') {
      shapeSearch.value = value
    } else {
      library.search = value
    }
  }
})
</script>

<template>
  <aside class="side-panel">
    <header class="side-head">
      <nav class="side-tabs" role="tablist">
        <button
          v-for="entry in tabs"
          :key="entry.id"
          type="button"
          role="tab"
          class="side-tab"
          :class="{ active: tab === entry.id, alone: tabs.length === 1 }"
          :aria-selected="tab === entry.id"
          @click="tab = entry.id"
        >
          {{ entry.label }}
        </button>
      </nav>
      <input v-model="search" type="search" placeholder="Rechercher…" class="search" />
    </header>
    <DocumentList
      v-if="tab === 'files'"
      :kind="mode === 'diagram' ? 'diagram' : 'montage'"
      :search="search"
    />
    <DiagramLibrary v-else-if="mode === 'diagram'" :search="search" />
    <LibraryPanel v-else :mode="mode === 'components' ? 'edit' : 'place'" @edit="emit('edit')" />
  </aside>
</template>

<style scoped>
.side-panel {
  width: var(--side-panel-width);
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

/* L'en-tête a la même hauteur dans les trois modes : les onglets, puis la recherche. */
.side-head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border-soft);
}

.side-tabs {
  display: flex;
  gap: 16px;
}

/* Un onglet : son nom, souligné de la couleur d'accent quand c'est lui qu'on regarde. */
.side-tab {
  padding: 2px 0 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.side-tab:hover {
  color: var(--text);
  background: transparent;
}

.side-tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

/* Seul dans sa rangée (mode Composants), il n'y a rien à choisir. */
.side-tab.alone {
  cursor: default;
}

.search {
  font: inherit;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
}
</style>
