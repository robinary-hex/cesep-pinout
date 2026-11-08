<script setup lang="ts">
import { computed } from 'vue'
import { baseName } from '@/io/paths'
import { useSchematicStore } from './store'

const store = useSchematicStore()
const emit = defineEmits<{ create: []; open: []; save: []; saveAs: [] }>()

const hasTarget = computed(() => store.selection.length > 0 || store.placement !== null)
const fileLabel = computed(() => (store.filePath ? baseName(store.filePath) : 'Non enregistré'))
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <button type="button" title="Nouveau montage (Ctrl+N)" @click="emit('create')">
        Nouveau
      </button>
      <button type="button" title="Ouvrir un projet (Ctrl+O)" @click="emit('open')">Ouvrir</button>
      <button type="button" class="primary" title="Enregistrer (Ctrl+S)" @click="emit('save')">
        Enregistrer
      </button>
      <button type="button" title="Enregistrer sous… (Ctrl+Maj+S)" @click="emit('saveAs')">
        Sous…
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
      <button
        type="button"
        :disabled="!hasTarget"
        title="Rotation antihoraire (Maj+R)"
        @click="store.rotate('ccw')"
      >
        ⟲
      </button>
      <button
        type="button"
        :disabled="!hasTarget"
        title="Rotation horaire (R)"
        @click="store.rotate('cw')"
      >
        ⟳
      </button>
      <button
        type="button"
        :disabled="!hasTarget"
        title="Miroir horizontal (T)"
        @click="store.flip('horizontal')"
      >
        ↔
      </button>
      <button
        type="button"
        :disabled="!hasTarget"
        title="Miroir vertical (Maj+T)"
        @click="store.flip('vertical')"
      >
        ↕
      </button>
      <button
        type="button"
        :disabled="store.selection.length === 0"
        title="Dupliquer (Ctrl+D)"
        @click="store.duplicateSelection()"
      >
        Dupliquer
      </button>
      <button
        type="button"
        class="danger"
        :disabled="store.selection.length === 0"
        title="Supprimer (Suppr)"
        @click="store.removeSelection()"
      >
        Supprimer
      </button>
    </div>

    <div class="group">
      <button type="button" title="Zoom arrière" @click="store.zoomAround(1 / 1.25)">−</button>
      <span class="zoom">{{ Math.round(store.view.zoom * 100) }} %</span>
      <button type="button" title="Zoom avant" @click="store.zoomAround(1.25)">+</button>
      <button type="button" title="Ajuster au contenu (0)" @click="store.fitToContent()">
        Ajuster
      </button>
      <button type="button" title="Zoom 100 % (1)" @click="store.resetZoom()">100 %</button>
      <label class="check" title="Afficher les broches des composants">
        <input v-model="store.showPins" type="checkbox" />
        Broches
      </label>
    </div>

    <div class="spacer" />

    <span class="doc-name" :title="store.filePath ?? 'Pas encore enregistré'">
      {{ store.doc.name }}<span v-if="store.dirty"> •</span>
      <span class="file">{{ fileLabel }}</span>
    </span>
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
  flex-wrap: wrap;
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zoom {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #57606a;
}

.check {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  font-size: 12px;
  color: #57606a;
}

.spacer {
  flex: 1;
}

.doc-name {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-weight: 600;
  line-height: 1.2;
}

.file {
  font-weight: 400;
  font-size: 11px;
  color: #57606a;
}
</style>
