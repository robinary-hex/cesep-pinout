<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore, type DocumentKind } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { bridge } from '@/io/bridge'
import { dataFolder } from '@/io/dataFolder'
import { listDocumentFiles, type DocumentFile } from '@/io/documentFiles'
import { baseName, samePath } from '@/io/paths'
import ContextMenu from '@/ui/ContextMenu.vue'
import { heading, item, type MenuItem } from '@/ui/contextMenu'
import Icon from '@/ui/Icon.vue'

// Onglet « Fichiers » du panneau latéral (décision du 18 novembre 2026) : les montages du dossier
// `Montages`, ou les diagrammes du dossier `Diagrammes`, du dossier de Pinout, sous-dossiers
// compris (un groupe repliable chacun). Un clic ouvre le fichier dans l'onglet d'aperçu (titre
// en italique : le fichier suivant prendra sa place) ; un double-clic l'ouvre pour de bon. La
// liste se relit quand la fenêtre reprend la main et quand un fichier vient d'être enregistré.

const props = defineProps<{ kind: DocumentKind; search: string }>()

const library = useLibraryStore()
const schematic = useSchematicStore()
const diagram = useDiagramStore()

const files = shallowRef<DocumentFile[]>([])
const loading = ref(true)

/** L'éditeur de ce genre de document. */
const store = computed(() => (props.kind === 'diagram' ? diagram : schematic))
const noun = computed(() => (props.kind === 'diagram' ? 'diagramme' : 'montage'))

/** Le dossier des documents de ce genre ; null tant que le dossier de Pinout n'est pas choisi. */
const folder = computed(() => {
  const root = library.dataRoot
  if (root === null) return null
  return props.kind === 'diagram' ? dataFolder(root).diagrams : dataFolder(root).montages
})

let reading = 0

async function refresh(): Promise<void> {
  const dir = folder.value
  const turn = ++reading
  const found = dir === null ? [] : await listDocumentFiles(dir, props.kind)
  // Une lecture plus récente a pu partir entre-temps (changement de mode) : la sienne compte.
  if (turn !== reading) return
  files.value = found
  loading.value = false
}

// Un fichier enregistré ou ouvert entre dans les fichiers récents : la liste se relit alors.
watch([folder, () => props.kind, () => library.recentFiles], () => void refresh(), {
  immediate: true
})

function onWindowFocus(): void {
  void refresh()
}

onMounted(() => window.addEventListener('focus', onWindowFocus))
onUnmounted(() => window.removeEventListener('focus', onWindowFocus))

/** Les fichiers que garde la recherche, par sous-dossier ; la racine d'abord, sans titre. */
const groups = computed(() => {
  const needle = props.search.trim().toLowerCase()
  const kept =
    needle.length === 0
      ? files.value
      : files.value.filter(
          (file) =>
            file.name.toLowerCase().includes(needle) || file.folder.toLowerCase().includes(needle)
        )
  const byFolder = new Map<string, DocumentFile[]>()
  for (const file of kept) {
    const list = byFolder.get(file.folder)
    if (list) list.push(file)
    else byFolder.set(file.folder, [file])
  }
  return [...byFolder].map(([name, list]) => ({ name, files: list }))
})

// Sous-dossiers repliables ; une recherche en cours montre tout, le temps de la recherche.
const collapsed = ref(new Set<string>())

function toggleGroup(name: string): void {
  const next = new Set(collapsed.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsed.value = next
}

function isOpen(name: string): boolean {
  return name.length === 0 || props.search.trim().length > 0 || !collapsed.value.has(name)
}

/** Le fichier du document qu'on regarde. */
function isCurrent(file: DocumentFile): boolean {
  const path = store.value.filePath
  return path !== null && samePath(path, file.path)
}

/** Ouvre un fichier : en aperçu d'un simple clic, pour de bon d'un double-clic. */
function open(file: DocumentFile, preview: boolean): void {
  void store.value.openPath(file.path, { preview })
}

function fileTitle(file: DocumentFile): string {
  return file.path
}

// Menus contextuels

const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)

/** Clic droit sur un fichier. */
function openMenu(file: DocumentFile, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    items: [
      heading(file.name),
      item('Ouvrir', () => open(file, false), { icon: 'folder-open' }),
      item('Afficher dans l’Explorateur', () => void bridge().showInFolder(file.path), {
        icon: 'folder-open'
      })
    ]
  }
}

/** Clic droit dans le vide de la liste. */
function openListMenu(event: MouseEvent): void {
  event.preventDefault()
  const dir = folder.value
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    items: [
      item(
        `Nouveau ${noun.value}`,
        () => (props.kind === 'diagram' ? diagram.newDiagram() : schematic.newProject()),
        { icon: 'file-plus' }
      ),
      item(
        'Afficher le dossier dans l’Explorateur',
        () => {
          if (dir !== null) void bridge().showInFolder(dir)
        },
        { disabled: dir === null }
      )
    ]
  }
}
</script>

<template>
  <div class="documents" @contextmenu="openListMenu">
    <p v-if="loading" class="hint">Lecture…</p>
    <p v-else-if="folder === null" class="hint">Le dossier de Pinout n’est pas encore choisi.</p>
    <p v-else-if="files.length === 0" class="hint">
      Aucun {{ noun }} dans le dossier « {{ baseName(folder) }} » du dossier de Pinout. Ceux qu’on y
      enregistre apparaissent ici.
    </p>
    <p v-else-if="groups.length === 0" class="hint">Rien ne correspond à la recherche.</p>

    <section
      v-for="group in groups"
      :key="group.name"
      class="group"
      :class="{ collapsed: !isOpen(group.name) }"
    >
      <button
        v-if="group.name.length > 0"
        type="button"
        class="group-head"
        :title="isOpen(group.name) ? 'Replier' : 'Déplier'"
        @click="toggleGroup(group.name)"
      >
        <Icon name="chevron-down" :size="12" class="chevron" />
        <span class="group-name">{{ group.name }}</span>
        <span class="count">{{ group.files.length }}</span>
      </button>
      <button
        v-for="file in group.files"
        v-show="isOpen(group.name)"
        :key="file.path"
        type="button"
        class="file"
        :class="{ current: isCurrent(file) }"
        :title="fileTitle(file)"
        @click="open(file, true)"
        @dblclick="open(file, false)"
        @contextmenu="openMenu(file, $event)"
      >
        <Icon :name="kind === 'diagram' ? 'diagram' : 'schematic'" :size="16" class="file-icon" />
        <span class="name">{{ file.name }}</span>
      </button>
    </section>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" @close="menu = null" />
  </div>
</template>

<style scoped>
.documents {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
}

.hint {
  margin: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Titre d'un sous-dossier : comme une catégorie de la bibliothèque de composants. */
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 6px 0 2px;
  padding: 4px 12px 4px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.group-head:hover {
  background: var(--surface-3);
}

.group-head .chevron {
  flex: none;
  transition: transform 0.12s;
}

.group.collapsed .chevron {
  transform: rotate(-90deg);
}

.group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.file {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.file:hover {
  background: var(--surface-3);
}

.file.current {
  background: var(--accent-soft);
}

.file-icon {
  flex: none;
  color: var(--text-muted);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
