<script setup lang="ts">
import { computed } from 'vue'
import {
  arrowHeadPoints,
  NO_ARROWS,
  pointsAttribute,
  QUARTERS_PER_CELL,
  strokeWidthCells,
  textContent,
  trimForArrows,
  type Arrows,
  type ComponentDefinition,
  type FieldValues,
  type LocalPoint,
  type Primitive,
  type ShapeStyle,
  type TextPrimitive
} from '@/domain'

// Dessin d'un composant (PNG ou primitives) dans un <g> SVG, à une taille de cellule donnée.
// Sans état : partagé par l'éditeur de composants, les vignettes et le montage.

const props = withDefaults(
  defineProps<{
    def: ComponentDefinition
    cellPx: number
    /** Trait de base des composants (cellules), pris dans le profil de style. */
    strokeBase?: number
    /** Valeurs des textes variables d'un composant posé. */
    fields?: FieldValues
    /** Formes cliquables (éditeur) : elles émettent primitive-down avec leur index. */
    interactive?: boolean
    /** Décalage d'aperçu des formes en cours de glisser, en quarts de cellule. */
    moving?: { indexes: readonly number[]; dx: number; dy: number } | null
    /** Forme remplacée pendant une modification par poignée. */
    preview?: { index: number; primitive: Primitive } | null
  }>(),
  { strokeBase: 0.1, fields: undefined, interactive: false, moving: null, preview: null }
)

const emit = defineEmits<{ primitiveDown: [index: number, event: PointerEvent] }>()

type Stroked = Extract<Primitive, { kind: 'line' | 'polyline' }>

const q = (value: number): number => (value * props.cellPx) / QUARTERS_PER_CELL
const widthPx = computed(() => props.def.size.widthCells * props.cellPx)
const heightPx = computed(() => props.def.size.heightCells * props.cellPx)
const image = computed(() => (props.def.visual.kind === 'png' ? props.def.visual : null))
const primitives = computed(() => {
  const list = props.def.visual.kind === 'drawing' ? props.def.visual.primitives : []
  const preview = props.preview
  return preview
    ? list.map((primitive, i) => (i === preview.index ? preview.primitive : primitive))
    : list
})

const HIT_MIN_PX = 10

function strokePx(style: ShapeStyle): number {
  return strokeWidthCells(style, props.strokeBase) * props.cellPx
}

function shapeAttrs(style: ShapeStyle): Record<string, string | number> {
  return {
    stroke: style.stroke,
    'stroke-width': strokePx(style),
    fill: style.fill,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
}

function hitWidth(style: ShapeStyle): number {
  return Math.max(strokePx(style), HIT_MIN_PX)
}

function transformFor(index: number): string | undefined {
  const m = props.moving
  return m && m.indexes.includes(index) ? `translate(${q(m.dx)} ${q(m.dy)})` : undefined
}

function polyPoints(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y]) => `${q(x)},${q(y)}`).join(' ')
}

/** Sommets d'une ligne ou polyligne en cellules. */
function strokeCells(primitive: Stroked): LocalPoint[] {
  return primitive.kind === 'line'
    ? [
        { x: primitive.x1 / QUARTERS_PER_CELL, y: primitive.y1 / QUARTERS_PER_CELL },
        { x: primitive.x2 / QUARTERS_PER_CELL, y: primitive.y2 / QUARTERS_PER_CELL }
      ]
    : primitive.points.map(([x, y]) => ({ x: x / QUARTERS_PER_CELL, y: y / QUARTERS_PER_CELL }))
}

/** Flèches effectivement dessinées : aucune sans trait ni sur un polygone fermé. */
function shownArrows(primitive: Stroked): Arrows {
  if (primitive.style.stroke === 'none') return NO_ARROWS
  if (primitive.kind === 'polyline' && primitive.closed) return NO_ARROWS
  return primitive.arrows
}

/** Sommets du trait en pixels, raccourcis à la base des flèches pour ne pas les recouvrir. */
function strokePoints(primitive: Stroked): LocalPoint[] {
  const width = strokeWidthCells(primitive.style, props.strokeBase)
  return trimForArrows(strokeCells(primitive), shownArrows(primitive), width).map((point) => ({
    x: point.x * props.cellPx,
    y: point.y * props.cellPx
  }))
}

function lineAttrs(primitive: Stroked): Record<string, number> {
  const [a, b] = strokePoints(primitive)
  return { x1: a?.x ?? 0, y1: a?.y ?? 0, x2: b?.x ?? 0, y2: b?.y ?? 0 }
}

/** Pointes de flèche en pixels d'une ligne ou d'une polyligne ouverte. */
function arrowHeads(primitive: Stroked): string[] {
  const arrows = shownArrows(primitive)
  const cells = strokeCells(primitive)
  const width = strokeWidthCells(primitive.style, props.strokeBase)
  const heads: string[] = []
  const first = cells[0]
  const second = cells[1]
  const last = cells.at(-1)
  const beforeLast = cells.at(-2)
  const scaled = (points: LocalPoint[]): string =>
    pointsAttribute(
      points.map((point) => ({ x: point.x * props.cellPx, y: point.y * props.cellPx }))
    )
  if (arrows.end && last && beforeLast) {
    const head = arrowHeadPoints(beforeLast, last, width)
    if (head) heads.push(scaled(head))
  }
  if (arrows.start && first && second) {
    const head = arrowHeadPoints(second, first, width)
    if (head) heads.push(scaled(head))
  }
  return heads
}

function shownText(primitive: TextPrimitive): string {
  return textContent(primitive, props.fields)
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
        <line v-bind="{ ...lineAttrs(p), ...shapeAttrs(p.style) }" />
        <polygon
          v-for="(head, h) in arrowHeads(p)"
          :key="h"
          :points="head"
          :fill="p.style.stroke"
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
        <polyline v-else :points="pointsAttribute(strokePoints(p))" v-bind="shapeAttrs(p.style)" />
        <polygon
          v-for="(head, h) in arrowHeads(p)"
          :key="h"
          :points="head"
          :fill="p.style.stroke"
        />
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
          :font-style="p.variable && !fields ? 'italic' : undefined"
        >
          {{ shownText(p) }}
        </text>
        <rect
          v-if="interactive"
          :x="textLeft(p.x, p.anchor, textWidth(shownText(p), p.size))"
          :y="q(p.y) - (p.size * cellPx) / 2"
          :width="Math.max(textWidth(shownText(p), p.size), HIT_MIN_PX)"
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
