<script setup lang="ts">
import { computed } from 'vue'
import {
  arrowHeadPoints,
  dotRadiusCells,
  layoutText,
  middleArrowHead,
  NO_ARROWS,
  pointsAttribute,
  QUARTERS_PER_CELL,
  roundedPathData,
  strokeWidthCells,
  textStyleAttrs,
  textTransform,
  trimForArrows,
  type Arrows,
  type ComponentDefinition,
  type FieldValues,
  type LocalPoint,
  type Primitive,
  type ShapeStyle,
  type TextPrimitive
} from '@/domain'
import { screenColor } from './ink'

// Dessin d'un composant (ses formes, images comprises) dans un <g> SVG, à une taille de cellule
// donnée.
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
    /** Montage : les textes sont dessinés ailleurs, hors de la transformation (droits ou tournés, jamais en miroir). */
    skipTexts?: boolean
    /** Couleur imposée aux traits et aux textes (composant dont la bibliothèque a une version plus récente). */
    ink?: string | null
  }>(),
  {
    strokeBase: 0.1,
    fields: undefined,
    interactive: false,
    moving: null,
    preview: null,
    skipTexts: false,
    ink: null
  }
)

const emit = defineEmits<{ primitiveDown: [index: number, event: PointerEvent] }>()

type Stroked = Extract<Primitive, { kind: 'line' | 'polyline' }>

const q = (value: number): number => (value * props.cellPx) / QUARTERS_PER_CELL
const primitives = computed(() => {
  const all = props.def.visual.primitives
  const hideTexts = props.skipTexts
  const list = hideTexts ? all.filter((primitive) => primitive.kind !== 'text') : all
  const preview = props.preview
  return preview
    ? list.map((primitive, i) => (i === preview.index ? preview.primitive : primitive))
    : list
})

const HIT_MIN_PX = 10

function strokePx(style: ShapeStyle): number {
  return strokeWidthCells(style, props.strokeBase) * props.cellPx
}

/** Couleur à l'écran, ou l'encre imposée quand la couleur est visible. */
function inkFor(color: string): string {
  return props.ink && color !== 'none' ? props.ink : screenColor(color)
}

function shapeAttrs(style: ShapeStyle): Record<string, string | number> {
  return {
    stroke: inkFor(style.stroke),
    'stroke-width': strokePx(style),
    // Un remplissage de la couleur du trait fait partie du trait (forme pleine).
    fill:
      props.ink && style.fill !== 'none' && style.fill === style.stroke
        ? props.ink
        : screenColor(style.fill),
    ...(style.fillOpacity < 1 ? { 'fill-opacity': style.fillOpacity } : {}),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
}

/** Rayon d'un point en pixels, et rayon de sa zone cliquable (jamais minuscule). */
function dotRadiusPx(scale: number): number {
  return dotRadiusCells(scale, props.strokeBase) * props.cellPx
}

function dotHitRadiusPx(scale: number): number {
  return Math.max(dotRadiusPx(scale), HIT_MIN_PX / 2)
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

/** Tracé d'une polyligne ou d'un polygone aux angles arrondis, en pixels. */
function roundedPath(primitive: Extract<Primitive, { kind: 'polyline' }>): string {
  const points = primitive.closed
    ? primitive.points.map(([x, y]) => ({ x: q(x), y: q(y) }))
    : strokePoints(primitive)
  return roundedPathData(points, q(primitive.radius), primitive.closed)
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
  if (arrows.middle) {
    const head = middleArrowHead(cells, width)
    if (head) heads.push(scaled(head))
  }
  return heads
}

function textLayout(primitive: TextPrimitive): ReturnType<typeof layoutText> {
  return layoutText(primitive, props.fields)
}

/** Style du texte ; dans l'éditeur, un texte variable sans valeur s'affiche en italique. */
function textAttrs(primitive: TextPrimitive): Record<string, string | undefined> {
  const attributes = textStyleAttrs(primitive)
  if (primitive.variable && !props.fields) attributes['font-style'] = 'italic'
  return attributes
}

function down(index: number, event: PointerEvent): void {
  if (props.interactive) emit('primitiveDown', index, event)
}
</script>

<template>
  <g class="component-graphic">
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
          :fill="inkFor(p.style.stroke)"
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
        <path v-if="p.radius > 0" :d="roundedPath(p)" v-bind="shapeAttrs(p.style)" />
        <polygon v-else-if="p.closed" :points="polyPoints(p.points)" v-bind="shapeAttrs(p.style)" />
        <polyline v-else :points="pointsAttribute(strokePoints(p))" v-bind="shapeAttrs(p.style)" />
        <polygon
          v-for="(head, h) in arrowHeads(p)"
          :key="h"
          :points="head"
          :fill="inkFor(p.style.stroke)"
        />
        <polyline
          v-if="interactive"
          :points="polyPoints(p.points)"
          :fill="p.closed ? 'transparent' : 'none'"
          stroke="transparent"
          :stroke-width="hitWidth(p.style)"
        />
      </template>

      <template v-else-if="p.kind === 'dot'">
        <circle :cx="q(p.x)" :cy="q(p.y)" :r="dotRadiusPx(p.scale)" :fill="inkFor(p.color)" />
        <circle
          v-if="interactive"
          :cx="q(p.x)"
          :cy="q(p.y)"
          :r="dotHitRadiusPx(p.scale)"
          fill="transparent"
        />
      </template>

      <template v-else-if="p.kind === 'image'">
        <image
          v-if="p.dataUrl"
          :href="p.dataUrl"
          :x="q(p.x)"
          :y="q(p.y)"
          :width="q(p.w)"
          :height="q(p.h)"
          preserveAspectRatio="none"
        />
        <!-- Fichier perdu : un cadre gris à la place de l'image. -->
        <g v-else class="missing-image">
          <rect
            :x="q(p.x)"
            :y="q(p.y)"
            :width="q(p.w)"
            :height="q(p.h)"
            fill="#eef1f4"
            stroke="#8c959f"
            stroke-dasharray="6 4"
            vector-effect="non-scaling-stroke"
          />
          <text
            :x="q(p.x + p.w / 2)"
            :y="q(p.y + p.h / 2)"
            text-anchor="middle"
            dominant-baseline="middle"
            :font-size="Math.min(q(p.w) / 9, q(p.h) / 2)"
            fill="#57606a"
          >
            Image manquante
          </text>
        </g>
        <rect
          v-if="interactive"
          :x="q(p.x)"
          :y="q(p.y)"
          :width="q(p.w)"
          :height="q(p.h)"
          fill="transparent"
        />
      </template>

      <template v-else>
        <text
          :font-size="p.size * cellPx"
          :text-anchor="p.anchor"
          :fill="inkFor(p.color)"
          :transform="textTransform(p, cellPx / QUARTERS_PER_CELL)"
          v-bind="textAttrs(p)"
        >
          <tspan
            v-for="(line, l) in textLayout(p).lines"
            :key="l"
            :x="q(textLayout(p).x)"
            :y="q(line.y)"
          >
            {{ line.text }}
          </tspan>
        </text>
        <rect
          v-if="interactive"
          :x="q(p.x)"
          :y="q(p.y)"
          :width="q(p.w)"
          :height="q(p.h)"
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
