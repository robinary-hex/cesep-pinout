<script setup lang="ts">
import Icon from './Icon.vue'

// Début commun des trois barres d'outils, toujours dans le même ordre : le zoom (arrière, valeur,
// avant, ajuster), un séparateur, puis annuler, rétablir et supprimer la sélection, un séparateur.
// Les outils propres à chaque éditeur viennent après. La valeur du zoom est un bouton : un clic
// revient à 100 %. La corbeille est grisée tant que rien n'est sélectionné.

defineProps<{
  /** Zoom affiché, par exemple « 100 % ». */
  zoom: string
  undoLabel: string | null
  redoLabel: string | null
  /** Quelque chose est sélectionné : la corbeille est disponible. */
  canDelete: boolean
}>()
const emit = defineEmits<{
  zoomOut: []
  zoomIn: []
  zoomReset: []
  fit: []
  undo: []
  redo: []
  remove: []
}>()
</script>

<template>
  <div class="group">
    <button type="button" class="icon-only" title="Zoom arrière (molette)" @click="emit('zoomOut')">
      <Icon name="zoom-out" />
    </button>
    <button type="button" class="zoom" title="Revenir à 100 % (1)" @click="emit('zoomReset')">
      {{ zoom }}
    </button>
    <button type="button" class="icon-only" title="Zoom avant (molette)" @click="emit('zoomIn')">
      <Icon name="zoom-in" />
    </button>
    <button type="button" class="icon-only" title="Ajuster la vue (0)" @click="emit('fit')">
      <Icon name="fit" />
    </button>
  </div>
  <span class="separator" aria-hidden="true" />
  <div class="group">
    <button
      type="button"
      class="icon-only"
      :disabled="undoLabel === null"
      :title="undoLabel ? `Annuler : ${undoLabel} (Ctrl+Z)` : 'Rien à annuler'"
      @click="emit('undo')"
    >
      <Icon name="undo" />
    </button>
    <button
      type="button"
      class="icon-only"
      :disabled="redoLabel === null"
      :title="redoLabel ? `Rétablir : ${redoLabel} (Ctrl+Y)` : 'Rien à rétablir'"
      @click="emit('redo')"
    >
      <Icon name="redo" />
    </button>
    <button
      type="button"
      class="icon-only remove"
      :disabled="!canDelete"
      :title="canDelete ? 'Supprimer la sélection (Suppr)' : 'Rien de sélectionné'"
      @click="emit('remove')"
    >
      <Icon name="trash" />
    </button>
  </div>
  <span class="separator" aria-hidden="true" />
</template>

<style scoped>
.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Valeur du zoom : un bouton discret, de largeur fixe pour que la barre ne bouge pas. */
.zoom {
  min-width: 56px;
  padding: 5px 4px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  background: transparent;
  border-color: transparent;
}

.zoom:hover {
  border-color: var(--border);
}

.remove:not(:disabled):hover {
  color: var(--danger);
}

.separator {
  flex: none;
  align-self: stretch;
  width: 1px;
  min-height: 22px;
  background: var(--border);
}
</style>
