<script setup lang="ts">
import { ref } from 'vue'
import { createEmptyComponent } from '@/domain'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { deleteComponent, type LibraryEntry } from '@/io/library'
import { baseName } from '@/io/paths'
import ComponentThumbnail from '@/render/ComponentThumbnail.vue'
import Icon from '@/ui/Icon.vue'
import { useLibraryStore } from './store'

// Panneau de gauche : la bibliothèque de composants sur disque, en liste (nom, broches) ou en
// grille de vignettes (nom au survol) selon le paramètre `libraryView`.
// En mode « edit », un clic ouvre le composant dans l'éditeur ; en mode « place », il le pose
// sur le montage.

const props = defineProps<{ mode: 'edit' | 'place' }>()
const emit = defineEmits<{ create: [] }>()

const library = useLibraryStore()
const editor = useComponentEditorStore()
const schematic = useSchematicStore()

// Catégories repliables ; une recherche en cours montre tout, le temps de la recherche.
const collapsed = ref(new Set<string>())

function toggleGroup(name: string): void {
  const next = new Set(collapsed.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsed.value = next
}

function isOpen(name: string): boolean {
  return library.search.trim().length > 0 || !collapsed.value.has(name)
}

/** Infobulle d'une vignette de la grille : le nom, que la grille ne montre pas, et les broches. */
function tileTitle(entry: LibraryEntry): string {
  if (!entry.def) return entry.problem ?? 'Fichier illisible'
  const action =
    props.mode === 'place' ? ' — clic puis clic sur le montage, ou glisser-déposer' : ''
  return `${entry.def.name} · ${entry.def.pins.length} broche(s)${action}`
}

function isCurrent(entry: LibraryEntry): boolean {
  return props.mode === 'edit' && editor.folder === entry.folder
}

function isPlacing(entry: LibraryEntry): boolean {
  return props.mode === 'place' && schematic.placement?.def.id === entry.def?.id
}

function pick(entry: LibraryEntry): void {
  if (!entry.def) return
  if (props.mode === 'place') {
    schematic.startPlacing(entry.def)
    return
  }
  if (isCurrent(entry) || !editor.confirmDiscard()) return
  editor.open(entry.def, entry.folder)
}

// Glisser-déposer vers le montage : la pose démarre au début du glisser, le canevas pose au dépôt.
// L'image de glisser du navigateur est remplacée par le fantôme du canevas (image vide ici).
const EMPTY_DRAG_IMAGE = new Image()
EMPTY_DRAG_IMAGE.src =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function onDragStart(entry: LibraryEntry, event: DragEvent): void {
  if (props.mode !== 'place' || !entry.def) {
    event.preventDefault()
    return
  }
  schematic.startPlacing(entry.def)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', entry.def.id)
    event.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0)
  }
}

/** Lâché hors du montage : la pose s'arrête ; sur le montage, le canevas a déjà posé. */
function onDragEnd(): void {
  schematic.stopPlacing()
}

function duplicate(entry: LibraryEntry): void {
  if (!entry.def || !editor.confirmDiscard()) return
  const copy = structuredClone(entry.def)
  copy.name = `${copy.name} (copie)`
  editor.open(copy, null)
}

async function remove(entry: LibraryEntry): Promise<void> {
  const name = entry.def?.name ?? baseName(entry.folder)
  const message = `Supprimer « ${name} » de la bibliothèque ? Les projets qui l’utilisent gardent leur copie.`
  if (!window.confirm(message)) return
  try {
    await deleteComponent(entry.folder)
    if (editor.folder === entry.folder) {
      editor.open(createEmptyComponent('nouveau-composant', 'Nouveau composant'), null)
    }
    await library.refresh()
  } catch (error) {
    library.problem = `Suppression impossible : ${error instanceof Error ? error.message : String(error)}`
  }
}
</script>

<template>
  <aside class="library">
    <header class="library-head">
      <div class="title-row">
        <h2>Composants</h2>
        <button
          type="button"
          class="primary with-icon"
          title="Nouveau composant (Ctrl+N)"
          @click="emit('create')"
        >
          <Icon name="file-plus" /> Nouveau
        </button>
      </div>
      <div class="dir-row" :title="library.libraryDir">
        <span class="dir">{{ baseName(library.libraryDir) || '…' }}</span>
        <button
          type="button"
          class="small"
          title="Choisir le dossier de la bibliothèque"
          @click="library.chooseDir()"
        >
          Dossier…
        </button>
      </div>
      <input v-model="library.search" type="search" placeholder="Rechercher…" class="search" />
    </header>

    <p v-if="library.problem" class="problem">{{ library.problem }}</p>

    <div class="list">
      <p v-if="library.loading" class="hint">Lecture…</p>
      <p v-else-if="library.entries.length === 0" class="hint">
        Aucun composant. Dessine-en un dans le mode Composants, puis Enregistrer.
      </p>
      <p v-else-if="library.filtered.length === 0" class="hint">
        Rien ne correspond à la recherche.
      </p>

      <section
        v-for="group in library.groups"
        :key="group.name"
        class="group"
        :class="{ collapsed: !isOpen(group.name) }"
      >
        <button
          type="button"
          class="group-head"
          :title="isOpen(group.name) ? 'Replier la catégorie' : 'Déplier la catégorie'"
          @click="toggleGroup(group.name)"
        >
          <Icon name="chevron-down" :size="12" class="chevron" />
          <span class="group-name">{{ group.name }}</span>
          <span class="count">{{ group.entries.length }}</span>
        </button>
        <template v-if="library.libraryView === 'grid'">
          <div v-show="isOpen(group.name)" class="grid">
            <div
              v-for="entry in group.entries"
              :key="entry.folder"
              class="tile"
              :class="{ current: isCurrent(entry) || isPlacing(entry), broken: !entry.def }"
              :draggable="mode === 'place' && entry.def !== null"
              @dragstart="onDragStart(entry, $event)"
              @dragend="onDragEnd"
            >
              <button
                type="button"
                class="tile-open"
                :disabled="!entry.def"
                :title="tileTitle(entry)"
                @click="pick(entry)"
              >
                <ComponentThumbnail
                  v-if="entry.def"
                  :def="entry.def"
                  :size="52"
                  :stroke-base="library.defaultProfile.componentStroke"
                />
                <span v-else class="thumb-missing">?</span>
              </button>
              <div v-if="mode === 'edit'" class="tile-actions">
                <button
                  v-if="entry.def"
                  type="button"
                  class="small"
                  title="Dupliquer"
                  @click="duplicate(entry)"
                >
                  ⧉
                </button>
                <button type="button" class="small danger" title="Supprimer" @click="remove(entry)">
                  ✕
                </button>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="entry in group.entries"
            v-show="isOpen(group.name)"
            :key="entry.folder"
            class="item"
            :class="{ current: isCurrent(entry) || isPlacing(entry), broken: !entry.def }"
            :draggable="mode === 'place' && entry.def !== null"
            @dragstart="onDragStart(entry, $event)"
            @dragend="onDragEnd"
          >
            <button
              type="button"
              class="open"
              :disabled="!entry.def"
              :title="
                entry.def
                  ? mode === 'place'
                    ? `Poser ${entry.def.name} : clic puis clic sur le montage, ou glisser-déposer`
                    : `Ouvrir ${entry.def.name}`
                  : (entry.problem ?? '')
              "
              @click="pick(entry)"
            >
              <ComponentThumbnail
                v-if="entry.def"
                :def="entry.def"
                :size="56"
                :stroke-base="library.defaultProfile.componentStroke"
              />
              <span v-else class="thumb-missing">?</span>
              <span class="text">
                <span class="name">{{ entry.def?.name ?? baseName(entry.folder) }}</span>
                <span v-if="entry.def" class="meta">
                  {{ entry.def.pins.length }} broche(s) · {{ entry.def.id }}
                </span>
                <span v-else class="meta">Fichier illisible</span>
              </span>
            </button>
            <div v-if="mode === 'edit'" class="actions">
              <button
                v-if="entry.def"
                type="button"
                class="small"
                title="Dupliquer"
                @click="duplicate(entry)"
              >
                ⧉
              </button>
              <button type="button" class="small danger" title="Supprimer" @click="remove(entry)">
                ✕
              </button>
            </div>
          </div>
        </template>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.library {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.library-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-row,
.dir-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.library-head h2 {
  margin: 0;
  font-size: 14px;
}

.dir {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search {
  font: inherit;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
}

.problem {
  margin: 8px 12px 0;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 4px;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.hint {
  margin: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

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

.item {
  display: flex;
  align-items: center;
  padding: 2px 6px 2px 8px;
}

.item.current {
  background: var(--accent-soft);
}

.item.broken .name {
  color: var(--danger);
}

.open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}

.open:hover:not(:disabled) {
  background: var(--surface-3);
}

.open:disabled {
  cursor: default;
}

.thumb-missing {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: 4px;
  font-weight: 600;
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Grille : des vignettes carrées, le nom dans l'infobulle ; actions au survol dans le coin. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 4px;
  padding: 2px 10px 6px;
}

.tile {
  position: relative;
}

.tile-open {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.tile-open:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border);
}

.tile-open:disabled {
  cursor: default;
}

.tile.current .tile-open {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

.tile-actions {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 2px;
  opacity: 0;
}

.tile:hover .tile-actions {
  opacity: 1;
}

.tile-actions button {
  padding: 0 4px;
  font-size: 11px;
  line-height: 1.4;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
}

.item:hover .actions,
.item.current .actions {
  opacity: 1;
}
</style>
