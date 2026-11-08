<script setup lang="ts">
import Icon from '@/ui/Icon.vue'
import { useComponentEditorStore } from './store'
import { TOOLS } from './tools'

// Barre d'outils de l'éditeur de composants : outils de dessin, annuler/rétablir, zoom,
// nouveau et enregistrer (aussi dans le menu Fichier).

const store = useComponentEditorStore()
const emit = defineEmits<{ save: []; create: [] }>()
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
        {{ tool.label }}
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
      {{ store.doc.name }}<span v-if="store.dirty"> •</span>
    </span>

    <div class="group">
      <button
        type="button"
        class="with-icon"
        title="Nouveau composant (Ctrl+N)"
        @click="emit('create')"
      >
        <Icon name="file-plus" /> Nouveau
      </button>
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
  font-weight: 600;
  color: var(--text);
}
</style>
