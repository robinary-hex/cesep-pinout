<script setup lang="ts">
import { computed } from 'vue'
import { useLibraryStore } from '@/features/library/store'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import { useSchematicStore } from './store'

// Barre d'outils du montage : outils, palette, annuler/rétablir, vue, et tout à droite le
// panneau de propriétés. Rotation, miroir, duplication, suppression et ordre des fils passent
// par le menu contextuel et le clavier ; les actions de fichier par le menu Fichier. Quand la
// place manque, les raccourcis disparaissent, puis les libellés ; les icônes restent.

const store = useSchematicStore()
const library = useLibraryStore()

const fileLabel = computed(() => (store.filePath ? baseName(store.filePath) : 'Non enregistré'))

const swatches = computed(() => [
  ...library.palette.map((color) => ({ hex: color.hex, name: color.name })),
  ...library.customColors.map((hex) => ({ hex, name: hex }))
])

function isCurrent(hex: string): boolean {
  return hex.toLowerCase() === store.currentColor.toLowerCase()
}

function pickCustom(event: Event): void {
  const hex = (event.target as HTMLInputElement).value
  store.setCurrentColor(hex)
  void library.rememberCustomColor(hex)
}
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <button
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === 'select' }"
        title="Sélection (V)"
        @click="store.selectTool()"
      >
        <Icon name="cursor" /> <span class="label">Sélection</span> <kbd>V</kbd>
      </button>
      <button
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === 'wire' }"
        title="Tracer un fil (F)"
        @click="store.startWireTool()"
      >
        <Icon name="wire" /> <span class="label">Fil</span> <kbd>F</kbd>
      </button>
      <button
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === 'text' }"
        title="Poser une étiquette texte (E)"
        @click="store.startTextTool()"
      >
        <Icon name="type" /> <span class="label">Texte</span> <kbd>E</kbd>
      </button>
    </div>

    <div
      class="group palette"
      title="Couleur des prochains fils ; recolore aussi les fils sélectionnés"
    >
      <button
        v-for="swatch in swatches"
        :key="swatch.hex"
        type="button"
        class="swatch"
        :class="{ current: isCurrent(swatch.hex) }"
        :style="{ background: swatch.hex }"
        :title="swatch.name"
        @click="store.setCurrentColor(swatch.hex)"
      />
      <label class="custom" title="Couleur personnalisée">
        <input type="color" :value="store.currentColor" @change="pickCustom" />
        <span>+</span>
      </label>
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
        title="Zoom arrière (molette)"
        @click="store.zoomAround(1 / 1.25)"
      >
        <Icon name="zoom-out" />
      </button>
      <span class="zoom">{{ Math.round(store.view.zoom * 100) }} %</span>
      <button
        type="button"
        class="icon-only"
        title="Zoom avant (molette)"
        @click="store.zoomAround(1.25)"
      >
        <Icon name="zoom-in" />
      </button>
      <button
        type="button"
        class="icon-only"
        title="Ajuster au contenu (0)"
        @click="store.fitToContent()"
      >
        <Icon name="fit" />
      </button>
      <button type="button" title="Zoom 100 % (1)" @click="store.resetZoom()">100 %</button>
      <label class="check" title="Afficher les broches des composants">
        <input v-model="store.showPins" type="checkbox" />
        Broches
      </label>
      <label class="check" title="Entourer les broches reliées à rien">
        <input v-model="store.showUnconnected" type="checkbox" />
        Non reliées
      </label>
    </div>

    <div class="spacer" />

    <span class="doc-name" :title="store.filePath ?? 'Pas encore enregistré'">
      {{ store.doc.name }}
      <span class="file">{{ fileLabel }}{{ store.dirty ? ' · modifié' : '' }}</span>
    </span>

    <button
      type="button"
      class="tool with-icon"
      :class="{ active: store.inspectorOpen }"
      title="Afficher ou masquer le panneau de propriétés (I)"
      @click="store.inspectorOpen = !store.inspectorOpen"
    >
      <Icon name="panel" /> <kbd>I</kbd>
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  container-type: inline-size;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
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

.palette {
  gap: 3px;
}

.swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.current {
  box-shadow: 0 0 0 2px var(--accent);
}

.custom {
  position: relative;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed var(--text-faint);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.zoom {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.check {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-muted);
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
  color: var(--text-muted);
}

/* Barre étroite : d'abord les raccourcis s'effacent, puis les libellés ; les icônes restent. */
@container (max-width: 1300px) {
  .tool kbd {
    display: none;
  }
}

@container (max-width: 1080px) {
  .tool .label {
    display: none;
  }
}
</style>
