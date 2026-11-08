<script setup lang="ts">
import { computed } from 'vue'
import { QUARTERS_PER_CELL, type ComponentDefinition, type ShapeStyle } from '@/domain'

// Dessin d'un composant (PNG ou primitives) dans un <g> SVG, à une taille de cellule donnée.
// Sans état : partagé par l'éditeur de composants, les vignettes et, plus tard, le montage.

const props = withDefaults(
  defineProps<{
    def: ComponentDefinition
    cellPx: number
    /** Formes cliquables (éditeur) : elles émettent primitive-down avec leur index. */
    interactive?: boolean
    /** Décalage d'aperçu d'une forme pendant un glisser, en quarts de cellule. */
    moving?: { index: number; dx: number; dy: number } | null
  }>(),
  { interactive: false, moving: null }
)

const emit = defineEmits<{ primitiveDown: [index: number, event: PointerEvent] }>()

const q = (value: number): number => (value * props.cellPx) / QUARTERS_PER_CELL
const widthPx = computed(() => props.def.size.widthCells * props.cellPx)
const heightPx = computed(() => props.def.size.heightCells * props.cellPx)
const image = computed(() => (props.def.visual.kind === 'png' ? props.def.visual : null))
const primitives = computed(() =>
  props.def.visual.kind === 'drawing' ? props.def.visual.primitives : []
)

const HIT_MIN_PX = 10

function shapeAttrs(style: ShapeStyle): Record<string, string | number> {
  return {
    stroke: style.stroke,
    'stroke-width': style.strokeWidth * props.cellPx,
    fill: style.fill,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
}

function hitWidth(style: ShapeStyle): number {
  return Math.max(style.strokeWidth * props.cellPx, HIT_MIN_PX)
}

function transformFor(index: number): string | undefined {
  const m = props.moving
  return m && m.index === index ? `translate(${q(m.dx)} ${q(m.dy)})` : undefined
}

function polyPoints(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y]) => `${q(x)},${q(y)}`).join(' ')
}

function textWidth(text: string, size: number): number {
  return text.length * size * props.cellPx * 0.6
}

function textLeft(x: number, anchor: 'start' | 'middle' | 'end', width: number): number {
  if (anchor === 'start') return q(x)
  if (anchor === 'end') return q(x) - width
  return q(x) - width / 2
}

function down(index: number, event: PointerEvent): void {
  if (props.interactive) emit('primitiveDown', index, event)
}
</script>

<template>
  <g class="component-graphic">
    <template v-if="image">
      <image
        v-if="image.dataUrl"
        :href="image.dataUrl"
        :width="widthPx"
        :height="heightPx"
        preserveAspectRatio="none"
      />
      <g v-else>
        <rect
          :width="widthPx"
          :height="heightPx"
          fill="#eef1f4"
          stroke="#8c959f"
          stroke-dasharray="6 4"
        />
        <text
          :x="widthPx / 2"
          :y="heightPx / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="12"
          fill="#57606a"
        >
          {{ image.file }} manquante
        </text>
      </g>
    </template>

    <g
      v-for="(p, i) in primitives"
      :key="i"
      :transform="transformFor(i)"
      :class="{ interactive }"
      @pointerdown="down(i, $event)"
    >
      <template v-if="p.kind === 'rect'">
        <rect
          :x="q(p.x)"
          :y="q(p.y)"
          :width="q(p.w)"
          :height="q(p.h)"
          :rx="q(p.rx)"
          v-bind="shapeAttrs(p.style)"
        />
        <rect
          v-if="interactive"
          :x="q(p.x)"
          :y="q(p.y)"
          :width="q(p.w)"
          :height="q(p.h)"
          fill="transparent"
          stroke="transparent"
          :stroke-width="hitWidth(p.style)"
        />
      </template>

      <template v-else-if="p.kind === 'ellipse'">
        <ellipse
          :cx="q(p.cx)"
          :cy="q(p.cy)"
          :rx="q(p.rx)"
          :ry="q(p.ry)"
          v-bind="shapeAttrs(p.style)"
        />
        <ellipse
          v-if="interactive"
          :cx="q(p.cx)"
          :cy="q(p.cy)"
          :rx="q(p.rx)"
          :ry="q(p.ry)"
          fill="transparent"
          stroke="transparent"
          :stroke-width="hitWidth(p.style)"
        />
      </template>

      <template v-else-if="p.kind === 'line'">
        <line
          :x1="q(p.x1)"
          :y1="q(p.y1)"
          :x2="q(p.x2)"
          :y2="q(p.y2)"
          v-bind="shapeAttrs(p.style)"
        />
        <line
          v-if="interactive"
          :x1="q(p.x1)"
          :y1="q(p.y1)"
          :x2="q(p.x2)"
          :y2="q(p.y2)"
          stroke="transparent"
          :stroke-width="hitWidth(p.style)"
        />
      </template>

      <template v-else-if="p.kind === 'polyline'">
        <polygon v-if="p.closed" :points="polyPoints(p.points)" v-bind="shapeAttrs(p.style)" />
        <polyline v-else :points="polyPoints(p.points)" v-bind="shapeAttrs(p.style)" />
        <polyline
          v-if="interactive"
          :points="polyPoints(p.points)"
          :fill="p.closed ? 'transparent' : 'none'"
          stroke="transparent"
          :stroke-width="hitWidth(p.style)"
        />
      </template>

      <template v-else>
        <text
          :x="q(p.x)"
          :y="q(p.y)"
          :font-size="p.size * cellPx"
          :text-anchor="p.anchor"
          :fill="p.color"
          font-family="'Segoe UI', sans-serif"
          dominant-baseline="middle"
        >
          {{ p.text }}
        </text>
        <rect
          v-if="interactive"
          :x="textLeft(p.x, p.anchor, textWidth(p.text, p.size))"
          :y="q(p.y) - (p.size * cellPx) / 2"
          :width="Math.max(textWidth(p.text, p.size), HIT_MIN_PX)"
          :height="p.size * cellPx"
          fill="transparent"
        />
      </template>
    </g>
  </g>
</template>

<style scoped>
.interactive {
  cursor: pointer;
}
</style>
