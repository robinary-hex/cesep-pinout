<script setup lang="ts">
import { computed } from 'vue'
import { COMPONENT_FILE } from '@/io/library'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import ToolbarBasics from '@/ui/ToolbarBasics.vue'
import { LAYERS } from './layers'
import { importImage } from './pngImport'
import { useComponentEditorStore } from './store'
import { TOOLS } from './tools'

// Barre d'outils de l'éditeur de composants. D'abord le début commun aux trois éditeurs
// (`ToolbarBasics` : zoom, annuler, rétablir, corbeille), puis les outils de dessin (pictogramme
// seul, raccourci dans l'infobulle), l'import d'une image, posée comme une forme, les calques
// de travail (tout, dessin, broches, empreintes : layers.ts), la variante qu'on regarde (une
// variante se crée dans le panneau de propriétés), le dessin affiché d'un composant
// extensible qui a des modèles particuliers (son motif répété, ou le modèle d'un nombre), et la
// case « Groupes » quand le composant en a ; à droite, le
// nom du composant avec son fichier, le bouton du panneau de propriétés tout au bout, et
// Enregistrer (aussi dans le menu Fichier). Quand la place manque, la partie gauche passe à la
// ligne ; la droite reste sur la première.

const store = useComponentEditorStore()
const emit = defineEmits<{ save: [] }>()

const fileLabel = computed(() =>
  store.folder ? `${baseName(store.folder)}/${COMPONENT_FILE}` : 'Non enregistré'
)

/** Liste des dessins d'un composant extensible : la valeur vide est son motif répété. */
function showModel(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  store.showModel(value === '' ? null : Number(value))
}
</script>

<template>
  <div class="toolbar">
    <div class="main">
      <ToolbarBasics
        :zoom="`${store.zoomPercent} %`"
        :undo-label="store.undoLabel"
        :redo-label="store.redoLabel"
        :can-delete="store.selection !== null"
        @zoom-out="store.zoomBy(1 / 1.25)"
        @zoom-in="store.zoomBy(1.25)"
        @zoom-reset="store.resetZoom()"
        @fit="store.fitToViewport()"
        @undo="store.undo()"
        @redo="store.redo()"
        @remove="store.removeSelection()"
      />

      <div class="group tools">
        <button
          v-for="tool in TOOLS"
          :key="tool.id"
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === tool.id }"
          :title="`${tool.label} (${tool.key.toUpperCase()})`"
          @click="store.tool = tool.id"
        >
          <Icon :name="tool.icon" :size="18" />
        </button>
      </div>

      <div class="group">
        <button
          type="button"
          class="icon-only"
          title="Importer une image PNG"
          @click="importImage(store)"
        >
          <Icon name="image" :size="18" />
        </button>
      </div>

      <div class="group layers" role="radiogroup" aria-label="Calque de travail">
        <button
          v-for="layer in LAYERS"
          :key="layer.id"
          type="button"
          class="tool icon-only layer"
          role="radio"
          :class="{ active: store.layer === layer.id }"
          :aria-checked="store.layer === layer.id"
          :title="layer.tip"
          @click="store.setLayer(layer.id)"
        >
          <Icon :name="layer.icon" :size="18" />
        </button>
      </div>

      <div v-if="store.variants.length > 1 || store.models.length > 0" class="group">
        <select
          v-if="store.variants.length > 1"
          class="variant-select"
          :value="store.variantId"
          title="Variante affichée"
          @change="store.showVariant(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="variant in store.variants" :key="variant.id" :value="variant.id">
            {{ variant.name }}
          </option>
        </select>
        <select
          v-if="store.models.length > 0"
          class="variant-select model-select"
          :value="store.modelCount ?? ''"
          title="Dessin affiché"
          @change="showModel"
        >
          <option value="">Motif répété</option>
          <option v-for="model in store.models" :key="model.count" :value="model.count">
            Modèle à {{ model.count }}
          </option>
        </select>
      </div>

      <div v-if="store.hasGroups" class="group">
        <label class="check" title="Entourer les groupes">
          <input v-model="store.showGroups" type="checkbox" />
          Groupes
        </label>
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
        :title="store.hasErrors ? 'Des erreurs sont à corriger' : 'Enregistrer (Ctrl+S)'"
        @click="emit('save')"
      >
        <Icon name="save" /> Enregistrer
      </button>
      <button
        type="button"
        class="tool icon-only"
        :class="{ active: store.inspectorOpen }"
        title="Propriétés (I)"
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

/* Calques de travail : un sélecteur segmenté, le calque qu'on regarde marqué comme un outil
   actif. */
.layers {
  gap: 0;
}

.layers .layer {
  margin-left: -1px;
  border-radius: 0;
}

.layers .layer:first-child {
  margin-left: 0;
  border-radius: 6px 0 0 6px;
}

.layers .layer:last-child {
  border-radius: 0 6px 6px 0;
}

.layers .layer.active {
  position: relative;
  z-index: 1;
}

.variant-select {
  max-width: 160px;
  padding: 4px 6px;
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
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
