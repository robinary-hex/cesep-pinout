<script setup lang="ts">
import { computed } from 'vue'
import { COMPONENT_FILE } from '@/io/library'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import { useComponentEditorStore } from './store'
import { TOOLS } from './tools'

// Barre d'outils de l'éditeur de composants : outils de dessin (pictogramme seul, raccourci dans
// l'infobulle), annuler/rétablir, zoom ; à droite, le nom du composant avec son fichier, puis
// Enregistrer (aussi dans le menu Fichier). Quand la place manque, la partie gauche passe à la
// ligne ; la droite reste sur la première.

const store = useComponentEditorStore()
const emit = defineEmits<{ save: [] }>()

const fileLabel = computed(() =>
  store.folder ? `${baseName(store.folder)}/${COMPONENT_FILE}` : 'Non enregistré'
)
</script>

<template>
  <div class="toolbar">
    <div class="main">
      <div class="group tools">
        <button
          v-for="tool in TOOLS"
          :key="tool.id"
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === tool.id }"
          :title="`${tool.hint} (${tool.key.toUpperCase()})`"
          @click="store.tool = tool.id"
        >
          <Icon :name="tool.icon" :size="18" />
        </button>
      </div>

      <div class="group">
        <button
          type="button"
          class="icon-only"
          :disabled="store.undoLabel === null"
          :title="store.undoLabel ? `Annuler : ${store.undoLabel} (Ctrl+Z)` : 'Rien à annuler'"
          @click="store.undo()"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          class="icon-only"
          :disabled="store.redoLabel === null"
          :title="store.redoLabel ? `Rétablir : ${store.redoLabel} (Ctrl+Y)` : 'Rien à rétablir'"
          @click="store.redo()"
        >
          <Icon name="redo" />
        </button>
      </div>

      <div class="group">
        <button
          type="button"
          class="icon-only"
          title="Zoom arrière (Ctrl+molette)"
          @click="store.zoomBy(1 / 1.25)"
        >
          <Icon name="zoom-out" />
        </button>
        <span class="zoom">{{ store.cellPx }} px</span>
        <button
          type="button"
          class="icon-only"
          title="Zoom avant (Ctrl+molette)"
          @click="store.zoomBy(1.25)"
        >
          <Icon name="zoom-in" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Ajuster le composant à la fenêtre"
          @click="store.fitToViewport()"
        >
          <Icon name="fit" />
        </button>
      </div>
    </div>

    <div class="right">
      <span class="doc-name" :title="store.folder ?? 'Pas encore enregistré'">
        <span class="name">{{ store.doc.name }}</span>
        <span class="file">{{ fileLabel }}{{ store.dirty ? ' · modifié' : '' }}</span>
      </span>
      <button
        type="button"
        class="primary with-icon"
        :disabled="store.hasErrors"
        :title="
          store.hasErrors ? 'Corrige les erreurs avant d’enregistrer' : 'Enregistrer (Ctrl+S)'
        "
        @click="emit('save')"
      >
        <Icon name="save" /> Enregistrer
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 6px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

/* Partie gauche : ses groupes passent à la ligne quand la place manque. */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}

.right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

.zoom {
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.doc-name {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
  line-height: 1.2;
}

.doc-name .name,
.doc-name .file {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-name .name {
  font-weight: 600;
}

.file {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
