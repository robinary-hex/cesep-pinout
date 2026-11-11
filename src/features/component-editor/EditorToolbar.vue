<script setup lang="ts">
import { computed } from 'vue'
import { COMPONENT_FILE } from '@/io/library'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import ToolbarBasics from '@/ui/ToolbarBasics.vue'
import { importImage } from './pngImport'
import { useComponentEditorStore } from './store'
import { TOOLS } from './tools'

// Barre d'outils de l'éditeur de composants. D'abord le début commun aux trois éditeurs
// (`ToolbarBasics` : zoom, annuler, rétablir, corbeille), puis les outils de dessin (pictogramme
// seul, raccourci dans l'infobulle), l'import d'une image, posée comme une forme, les variantes
// (celle qu'on regarde, et le bouton qui en crée une), et la case
// « Groupes » quand le composant en a ; à droite, le
// nom du composant avec son fichier, le bouton du panneau de propriétés tout au bout, et
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
          title="Importer une image PNG (80 px par cellule), posée comme une forme"
          @click="importImage(store)"
        >
          <Icon name="image" :size="18" />
        </button>
      </div>

      <div class="group">
        <select
          v-if="store.variants.length > 1"
          class="variant-select"
          :value="store.variantId"
          title="Variante affichée : c’est elle qu’on modifie"
          @change="store.showVariant(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="variant in store.variants" :key="variant.id" :value="variant.id">
            {{ variant.name }}
          </option>
        </select>
        <button
          type="button"
          class="icon-only"
          title="Nouvelle variante : une copie de celle qu’on regarde, à retoucher"
          @click="store.addVariant()"
        >
          <Icon name="layers" :size="18" />
        </button>
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
        :title="
          store.hasErrors ? 'Corrige les erreurs avant d’enregistrer' : 'Enregistrer (Ctrl+S)'
        "
        @click="emit('save')"
      >
        <Icon name="save" /> Enregistrer
      </button>
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
