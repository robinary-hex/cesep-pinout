<script setup lang="ts">
import { computed } from 'vue'
import { previewDefinition, type ComponentDefinition } from '@/domain'
import ComponentGraphic from './ComponentGraphic.vue'

// Vignette carrée d'un composant, pour la bibliothèque : son dessin seul, sans les broches
// (décision du 11 novembre 2026), dans la variante qu'on regardait en l'enregistrant.

const props = withDefaults(
  defineProps<{ def: ComponentDefinition; size?: number; strokeBase?: number }>(),
  { size: 72, strokeBase: 0.1 }
)

const PADDING = 8

/** Le composant tel que l'aperçu le montre : la variante choisie à l'enregistrement. */
const shown = computed(() => previewDefinition(props.def))
const cellPx = computed(() => {
  const inner = props.size - 2 * PADDING
  return Math.min(inner / shown.value.size.widthCells, inner / shown.value.size.heightCells)
})
const offset = computed(() => ({
  x: (props.size - shown.value.size.widthCells * cellPx.value) / 2,
  y: (props.size - shown.value.size.heightCells * cellPx.value) / 2
}))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="thumbnail">
    <g :transform="`translate(${offset.x} ${offset.y})`">
      <ComponentGraphic :def="shown" :cell-px="cellPx" :stroke-base="strokeBase" />
    </g>
  </svg>
</template>

<style scoped>
.thumbnail {
  display: block;
}
</style>
