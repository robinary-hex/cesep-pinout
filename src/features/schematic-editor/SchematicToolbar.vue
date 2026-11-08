<script setup lang="ts">
import { computed } from 'vue'
import { useLibraryStore } from '@/features/library/store'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import { useSchematicStore } from './store'

// Barre d'outils du montage : outils, palette, édition, ordre des fils, vue, panneau.
// Les actions de fichier sont dans le menu Fichier de la barre d'application.

const store = useSchematicStore()
const library = useLibraryStore()

const hasTarget = computed(() => store.selection.length > 0 || store.placement !== null)
const hasWires = computed(() => store.selectedWires.length > 0)
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
        <Icon name="cursor" /> Sélection <kbd>V</kbd>
      </button>
      <button
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === 'wire' }"
        title="Tracer un fil (W)"
        @click="store.startWireTool()"
      >
        <Icon name="wire" /> Fil <kbd>W</kbd>
      </button>
      <button
        type="button"
        class="tool with-icon"
        :class="{ active: store.tool === 'text' }"
        title="Poser une étiquette texte (E)"
        @click="store.startTextTool()"
      >
        <Icon name="type" /> Texte <kbd>E</kbd>
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
        :disabled="!hasTarget"
        title="Rotation antihoraire (Maj+R)"
        @click="store.rotate('ccw')"
      >
        <Icon name="rotate-ccw" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasTarget"
        title="Rotation horaire (R)"
        @click="store.rotate('cw')"
      >
        <Icon name="rotate-cw" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasTarget"
        title="Miroir horizontal (T)"
        @click="store.flip('horizontal')"
      >
        <Icon name="flip-h" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasTarget"
        title="Miroir vertical (Maj+T)"
        @click="store.flip('vertical')"
      >
        <Icon name="flip-v" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!store.hasSelection"
        title="Dupliquer (Ctrl+D)"
        @click="store.duplicateSelection()"
      >
        <Icon name="copy" />
      </button>
      <button
        type="button"
        class="icon-only danger"
        :disabled="!store.hasSelection"
        title="Supprimer (Suppr)"
        @click="store.removeSelection()"
      >
        <Icon name="trash" />
      </button>
    </div>

    <div class="group" title="Ordre d’empilement des fils sélectionnés">
      <button
        type="button"
        class="icon-only"
        :disabled="!hasWires"
        title="Reculer (Ctrl+Page bas)"
        @click="store.reorderWires('down')"
      >
        <Icon name="arrow-down" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasWires"
        title="Avancer (Ctrl+Page haut)"
        @click="store.reorderWires('up')"
      >
        <Icon name="arrow-up" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasWires"
        title="Arrière-plan (Ctrl+Maj+Page bas)"
        @click="store.reorderWires('bottom')"
      >
        <Icon name="arrow-down-line" />
      </button>
      <button
        type="button"
        class="icon-only"
        :disabled="!hasWires"
        title="Premier plan (Ctrl+Maj+Page haut)"
        @click="store.reorderWires('top')"
      >
        <Icon name="arrow-up-line" />
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

    <div class="group">
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
  gap: 14px;
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

.tool kbd {
  margin-left: 2px;
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

.palette {
  gap: 3px;
}

.swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #d0d7de;
}

.swatch.current {
  box-shadow: 0 0 0 2px #1f6feb;
}

.custom {
  position: relative;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed #8c959f;
  font-size: 12px;
  color: #57606a;
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
