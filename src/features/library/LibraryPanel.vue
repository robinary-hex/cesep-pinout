<script setup lang="ts">
import { createEmptyComponent } from '@/domain'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { deleteComponent, type LibraryEntry } from '@/io/library'
import { baseName } from '@/io/paths'
import ComponentThumbnail from '@/render/ComponentThumbnail.vue'
import { useLibraryStore } from './store'

// Panneau de gauche : la bibliothèque de composants sur disque.

const library = useLibraryStore()
const editor = useComponentEditorStore()

function isCurrent(entry: LibraryEntry): boolean {
  return editor.folder === entry.folder
}

function openEntry(entry: LibraryEntry): void {
  if (!entry.def || isCurrent(entry) || !editor.confirmDiscard()) return
  editor.open(entry.def, entry.folder)
}

function createNew(): void {
  if (!editor.confirmDiscard()) return
  editor.open(createEmptyComponent('nouveau-composant', 'Nouveau composant'), null)
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
    if (isCurrent(entry)) {
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
        <h2>Bibliothèque</h2>
        <button type="button" class="primary" title="Nouveau composant (Ctrl+N)" @click="createNew">
          Nouveau
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
        Aucun composant. Dessine-en un à droite, puis Enregistrer.
      </p>
      <p v-else-if="library.filtered.length === 0" class="hint">
        Rien ne correspond à la recherche.
      </p>

      <section v-for="group in library.groups" :key="group.name" class="group">
        <h3>{{ group.name }}</h3>
        <div
          v-for="entry in group.entries"
          :key="entry.folder"
          class="item"
          :class="{ current: isCurrent(entry), broken: !entry.def }"
        >
          <button
            type="button"
            class="open"
            :disabled="!entry.def"
            :title="entry.def ? `Ouvrir ${entry.def.name}` : (entry.problem ?? '')"
            @click="openEntry(entry)"
          >
            <ComponentThumbnail v-if="entry.def" :def="entry.def" :size="56" />
            <span v-else class="thumb-missing">?</span>
            <span class="text">
              <span class="name">{{ entry.def?.name ?? baseName(entry.folder) }}</span>
              <span v-if="entry.def" class="meta"
                >{{ entry.def.pins.length }} broche(s) · {{ entry.def.id }}</span
              >
              <span v-else class="meta">Fichier illisible</span>
            </span>
          </button>
          <div class="actions">
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
  background: #ffffff;
  border-right: 1px solid #d0d7de;
}

.library-head {
  padding: 10px 12px;
  border-bottom: 1px solid #eaeef2;
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
  color: #57606a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search {
  font: inherit;
  padding: 5px 8px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
}

.problem {
  margin: 8px 12px 0;
  padding: 6px 8px;
  font-size: 12px;
  color: #a40e26;
  background: #ffebe9;
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
  color: #57606a;
}

.group h3 {
  margin: 8px 12px 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #57606a;
}

.item {
  display: flex;
  align-items: center;
  padding: 2px 6px 2px 8px;
}

.item.current {
  background: #ddf4ff;
}

.item.broken .name {
  color: #a40e26;
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
  background: #f0f3f6;
}

.open:disabled {
  cursor: default;
}

.thumb-missing {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  background: #ffebe9;
  color: #a40e26;
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
  color: #57606a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
