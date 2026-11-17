<script setup lang="ts">
import { computed } from 'vue'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import ToolbarBasics from '@/ui/ToolbarBasics.vue'
import ToolbarPalette from '@/ui/ToolbarPalette.vue'
import { useSchematicStore } from './store'

// Barre d'outils du montage. D'abord le début commun aux trois éditeurs (`ToolbarBasics` : zoom,
// annuler, rétablir, corbeille), puis les outils (pictogramme seul, raccourci dans l'infobulle),
// la palette (un clic droit sur une couleur du montage la modifie ou la supprime) et les cases
// d'affichage
// (broches, broches reliées à rien, groupes s'il y en a),
// gardées dans les paramètres ; à droite, le nom du document et le bouton du panneau.
// Quand la place manque, la partie gauche passe à la ligne ; la droite reste sur la première.
// Rotation, miroir, duplication, suppression et ordre des fils passent par le menu contextuel et
// le clavier ; les actions de fichier par le menu Fichier.

const store = useSchematicStore()

const fileLabel = computed(() => (store.filePath ? baseName(store.filePath) : 'Non enregistré'))

function pickCustom(hex: string): void {
  // La couleur choisie reste dans ce montage ; la palette générale se règle dans les Paramètres.
  store.addCustomColor(hex)
  store.setCurrentColor(hex)
}
</script>

<template>
  <div class="toolbar">
    <div class="main">
      <ToolbarBasics
        :zoom="`${Math.round(store.view.zoom * 100)} %`"
        :undo-label="store.undoLabel"
        :redo-label="store.redoLabel"
        :can-delete="store.hasSelection"
        @zoom-out="store.zoomAround(1 / 1.25)"
        @zoom-in="store.zoomAround(1.25)"
        @zoom-reset="store.resetZoom()"
        @fit="store.fitToContent()"
        @undo="store.undo()"
        @redo="store.redo()"
        @remove="store.removeSelection()"
      />

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
          :class="{ active: store.tool === 'wire' && store.wireKind === null }"
          title="Tracer un fil (F)"
          @click="store.startWireTool()"
        >
          <Icon name="wire" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'wire' && store.wireKind === 'bare' }"
          title="Tracer un fil nu, soudé à toutes les broches sur son trajet (N)"
          @click="store.startWireTool('bare')"
        >
          <Icon name="bare-wire" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'wire' && store.wireKind === 'jumper' }"
          title="Poser un pont : un fil en courbe, de A à B (P)"
          @click="store.startWireTool('jumper')"
        >
          <Icon name="jumper" :size="18" />
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

      <ToolbarPalette
        class="group"
        title="Couleur des prochains fils ; recolore aussi les fils sélectionnés"
        :swatches="store.colorChoices"
        :current="store.paletteColor"
        adder-title="Couleur personnalisée, gardée dans ce montage"
        custom-name="Couleur de ce montage"
        @pick="store.setCurrentColor"
        @add="pickCustom"
        @change="store.changeColorChoice"
        @remove="store.removeColorChoice"
      />

      <div class="group">
        <label class="check" title="Afficher les broches des composants">
          <input v-model="store.showPins" type="checkbox" />
          Broches
        </label>
        <label class="check" title="Entourer les broches reliées à rien">
          <input v-model="store.showUnconnected" type="checkbox" />
          Non reliées
        </label>
        <label v-if="store.hasGroups" class="check" title="Entourer les groupes">
          <input v-model="store.showGroups" type="checkbox" />
          Groupes
        </label>
      </div>
    </div>

    <div class="right">
      <span class="doc-name" :title="store.filePath ?? 'Pas encore enregistré'">
        <span class="name">{{ store.doc.name }}</span>
        <span class="file">{{ fileLabel }}</span>
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
