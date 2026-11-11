<script setup lang="ts">
import type { PaletteColor } from '@/domain'
import ColorField from '@/ui/ColorField.vue'
import Icon from '@/ui/Icon.vue'

// Une palette des paramètres : une ligne par couleur (teinte et son code, nom, bouton qui la
// retire), puis le
// bouton qui en ajoute une. La boîte des paramètres en montre deux, celle des fils et celle des
// diagrammes. Ce qui accompagne le bouton (la couleur des nouveaux fils) passe par l'emplacement.

const props = defineProps<{ colors: readonly PaletteColor[] }>()
const emit = defineEmits<{ change: [colors: PaletteColor[]] }>()

function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function update(index: number, changes: Partial<PaletteColor>): void {
  emit(
    'change',
    props.colors.map((color, i) => (i === index ? { ...color, ...changes } : color))
  )
}

/** Une palette garde au moins une couleur. */
function remove(index: number): void {
  if (props.colors.length <= 1) return
  emit(
    'change',
    props.colors.filter((_, i) => i !== index)
  )
}

function add(): void {
  emit('change', [...props.colors, { name: `Couleur ${props.colors.length + 1}`, hex: '#808080' }])
}
</script>

<template>
  <div class="palette-grid">
    <div v-for="(color, index) in colors" :key="index" class="palette-row">
      <ColorField :value="color.hex" @change="update(index, { hex: $event })" />
      <input
        type="text"
        :value="color.name"
        @change="update(index, { name: text($event).trim() || color.name })"
      />
      <button type="button" class="small danger" title="Retirer" @click="remove(index)">✕</button>
    </div>
  </div>
  <div class="palette-actions">
    <button type="button" class="small with-icon" @click="add">
      <Icon name="plus" :size="14" /> Ajouter une couleur
    </button>
    <slot />
  </div>
</template>

<style scoped>
.palette-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 4px 10px;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.palette-row input[type='text'] {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.palette-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}
</style>
