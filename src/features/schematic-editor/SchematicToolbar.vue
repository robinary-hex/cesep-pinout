<script setup lang="ts">
import { computed } from 'vue'
import { useLibraryStore } from '@/features/library/store'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import { useSchematicStore } from './store'

// Barre d'outils du montage : outils (pictogramme seul, raccourci dans l'infobulle), palette,
// annuler/rétablir, vue ; à droite, le nom du document et le bouton du panneau de propriétés.
// Quand la place manque, la partie gauche passe à la ligne ; la droite reste sur la première.
// Rotation, miroir, duplication, suppression et ordre des fils passent par le menu contextuel et
// le clavier ; les actions de fichier par le menu Fichier.

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
    <div class="main">
      <div class="group">
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'select' }"
          title="Sélection (V)"
          @click="store.selectTool()"
        >
          <Icon name="cursor" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'wire' }"
          title="Tracer un fil (F)"
          @click="store.startWireTool()"
        >
          <Icon name="wire" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'text' }"
          title="Poser une étiquette texte (E)"
          @click="store.startTextTool()"
        >
          <Icon name="type" :size="18" />
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
    </div>

    <div class="right">
      <span class="doc-name" :title="store.filePath ?? 'Pas encore enregistré'">
        <span class="name">{{ store.doc.name }}</span>
        <span class="file">{{ fileLabel }}{{ store.dirty ? ' · modifié' : '' }}</span>
      </span>
      <button
        type="button"
        class="tool icon-only"
        :class="{ active: store.inspectorOpen }"
        title="Afficher ou masquer le panneau de propriétés (I)"
        @click="store.inspectorOpen = !store.inspectorOpen"
      >
        <Icon name="panel" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 14px;
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
  gap: 6px 14px;
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
  overflow: hidden;
  border-radius: 50%;
  border: 1px dashed var(--text-faint);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

/* Le sélecteur de couleur natif a sa propre taille : on le force à celle de la pastille, sinon il
   déborde, invisible, sur les boutons voisins. */
.custom input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
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
