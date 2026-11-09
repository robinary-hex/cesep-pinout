<script setup lang="ts">
import { computed } from 'vue'
import { COMPONENT_FILE } from '@/io/library'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import { useComponentEditorStore } from './store'
import { TOOLS } from './tools'

// Barre d'outils de l'éditeur de composants : outils de dessin, annuler/rétablir, zoom, et à
// droite le nom du composant avec son fichier, puis Enregistrer (aussi dans le menu Fichier).
// Quand la place manque, les raccourcis disparaissent, puis les libellés ; les icônes restent.

const store = useComponentEditorStore()
const emit = defineEmits<{ save: [] }>()

const fileLabel = computed(() =>
  store.folder ? `${baseName(store.folder)}/${COMPONENT_FILE}` : 'Non enregistré'
)
</script>

<template>
  <div class="toolbar">
    <div class="group tools">
      <button
        v-for="tool in TOOLS"
        :key="tool.id"
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === tool.id }"
        :title="`${tool.hint} (${tool.key.toUpperCase()})`"
        @click="store.tool = tool.id"
      >
        <Icon :name="tool.icon" />
        <span class="label">{{ tool.label }}</span>
        <kbd>{{ tool.key.toUpperCase() }}</kbd>
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

    <div class="spacer" />

    <span class="doc-name" :title="store.folder ?? 'Pas encore enregistré'">
      <span class="name">{{ store.doc.name }}</span>
      <span class="file">{{ fileLabel }}{{ store.dirty ? ' · modifié' : '' }}</span>
    </span>

    <button
      type="button"
      class="primary with-icon save"
      :disabled="store.hasErrors"
      :title="store.hasErrors ? 'Corrige les erreurs avant d’enregistrer' : 'Enregistrer (Ctrl+S)'"
      @click="emit('save')"
    >
      <Icon name="save" /> <span class="label">Enregistrer</span>
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  container-type: inline-size;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.tool kbd {
  margin-left: 2px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface-2);
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

.spacer {
  flex: 1;
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
  max-width: 100%;
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

.save {
  flex: none;
}

/* Barre étroite : d'abord les raccourcis s'effacent, puis les libellés ; les icônes restent. */
@container (max-width: 1300px) {
  .tool kbd {
    display: none;
  }
}

@container (max-width: 1080px) {
  .with-icon .label {
    display: none;
  }
}
</style>
