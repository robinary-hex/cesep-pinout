<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentDefinition, PinKind } from '@/domain'
import ComponentGraphic from './ComponentGraphic.vue'

// Vignette carrée d'un composant, broches comprises, pour la bibliothèque.

const props = withDefaults(
  defineProps<{ def: ComponentDefinition; size?: number; strokeBase?: number }>(),
  { size: 72, strokeBase: 0.1 }
)

const PADDING = 8
const PIN_COLORS: Record<PinKind, string> = {
  in: '#15803d',
  out: '#ea580c',
  io: '#1d4ed8',
  power: '#d62828'
}

const cellPx = computed(() => {
  const inner = props.size - 2 * PADDING
  return Math.min(inner / props.def.size.widthCells, inner / props.def.size.heightCells)
})
const offset = computed(() => ({
  x: (props.size - props.def.size.widthCells * cellPx.value) / 2,
  y: (props.size - props.def.size.heightCells * cellPx.value) / 2
}))
const pinRadius = computed(() => Math.max(1.5, Math.min(3, cellPx.value / 4)))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="thumbnail">
    <g :transform="`translate(${offset.x} ${offset.y})`">
      <rect
        :width="def.size.widthCells * cellPx"
        :height="def.size.heightCells * cellPx"
        fill="#ffffff"
        stroke="#d0d7de"
      />
      <ComponentGraphic :def="def" :cell-px="cellPx" :stroke-base="strokeBase" />
      <circle
        v-for="pin in def.pins"
        :key="pin.id"
        :cx="pin.x * cellPx"
        :cy="pin.y * cellPx"
        :r="pinRadius"
        :fill="PIN_COLORS[pin.kind]"
      />
    </g>
  </svg>
</template>

<style scoped>
.thumbnail {
  display: block;
  border-radius: 4px;
  background: #f6f8fa;
}
</style>
