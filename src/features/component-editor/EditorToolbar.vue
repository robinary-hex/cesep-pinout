<script setup lang="ts">
import { TOOLS } from './tools'
import { useComponentEditorStore } from './store'

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
        class="tool"
        :class="{ active: store.tool === tool.id }"
        :title="`${tool.hint} (${tool.key.toUpperCase()})`"
        @click="store.tool = tool.id"
      >
        {{ tool.label }}
        <kbd>{{ tool.key.toUpperCase() }}</kbd>
      </button>
    </div>

    <div class="group">
      <button
        type="button"
        :disabled="store.undoLabel === null"
        :title="store.undoLabel ? `Annuler : ${store.undoLabel} (Ctrl+Z)` : 'Rien à annuler'"
        @click="store.undo()"
      >
        Annuler
      </button>
      <button
        type="button"
        :disabled="store.redoLabel === null"
        :title="store.redoLabel ? `Rétablir : ${store.redoLabel} (Ctrl+Y)` : 'Rien à rétablir'"
        @click="store.redo()"
      >
        Rétablir
      </button>
    </div>

    <div class="group">
      <button type="button" title="Zoom arrière" @click="store.zoom(-1)">−</button>
      <span class="zoom">{{ store.cellPx }} px</span>
      <button type="button" title="Zoom avant" @click="store.zoom(1)">+</button>
    </div>

    <div class="spacer" />

    <span class="doc-name" :title="store.folder ?? 'Pas encore enregistré'">
      {{ store.doc.name }}<span v-if="store.dirty"> •</span>
    </span>

    <div class="group">
      <button type="button" title="Nouveau composant (Ctrl+N)" @click="emit('create')">
        Nouveau
      </button>
      <button
        type="button"
        class="primary"
        :disabled="store.hasErrors"
        :title="
          store.hasErrors ? 'Corrige les erreurs avant d’enregistrer' : 'Enregistrer (Ctrl+S)'
        "
        @click="emit('save')"
      >
        Enregistrer
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
  background: #ffffff;
  border-bottom: 1px solid #d0d7de;
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool kbd {
  margin-left: 6px;
  padding: 0 4px;
  font-size: 10px;
  color: #57606a;
  border: 1px solid #d0d7de;
  border-radius: 3px;
  background: #f6f8fa;
}

.tool.active {
  background: #ddf4ff;
  border-color: #54aeff;
}

.zoom {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #57606a;
}

.spacer {
  flex: 1;
}

.doc-name {
  font-weight: 600;
  color: #1f2328;
}
</style>
