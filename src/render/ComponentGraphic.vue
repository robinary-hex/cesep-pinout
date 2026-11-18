<script setup lang="ts">
import { computed } from 'vue'
import {
  abuttingImages,
  imageTurn,
  arrowHeadPoints,
  discsPathData,
  dotRadiusCells,
  FOOTPRINT_STYLE,
  footprintPath,
  HOLE_COLOR,
  HOLE_OPACITY,
  HOLE_PAD_RADIUS_CELLS,
  HOLE_RADIUS_CELLS,
  holeCells,
  isFootprint,
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
  type HolesPrimitive,
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
    /**
     * Taille d'un pixel de l'écran dans l'unité du dessin : 1 quand `cellPx` est en pixels ; le
     * montage, qui dessine en cellules sous une mise à l'échelle, donne un pixel en cellules.
     */
    pixel?: number
    /**
     * Calque de travail de l'éditeur de composants ; absent partout ailleurs, où le composant se
     * dessine tel qu'on le pose, sans ses formes d'empreinte (la place qu'il prend de l'autre
     * côté d'une plaque à trous). `all` : tout le dessin, empreintes comprises ; `drawing` : le
     * dessin, empreintes cachées ; `pins` : le dessin estompé et hors d'atteinte, empreintes
     * cachées ; `footprint` : les empreintes, le reste estompé et hors d'atteinte.
     */
    layer?: 'all' | 'drawing' | 'pins' | 'footprint' | null
  }>(),
  {
    strokeBase: 0.1,
    fields: undefined,
    interactive: false,
    moving: null,
    preview: null,
    skipTexts: false,
    ink: null,
    pixel: 1,
    layer: null
  }
)

const emit = defineEmits<{
  primitiveDown: [index: number, event: PointerEvent]
  /** Clic droit sur une forme cliquable. */
  primitiveMenu: [index: number, event: MouseEvent]
}>()

type Stroked = Extract<Primitive, { kind: 'line' | 'polyline' }>

const q = (value: number): number => (value * props.cellPx) / QUARTERS_PER_CELL
const primitives = computed(() => {
  const all = props.def.visual.primitives
  const hideTexts = props.skipTexts
  // Avec un calque (l'éditeur), rien n'est retiré : le rang d'une forme reste celui du dessin.
  const posed = props.layer === null
  const list =
    hideTexts || posed
      ? all.filter(
          (primitive) =>
            !(hideTexts && primitive.kind === 'text') && !(posed && isFootprint(primitive))
        )
      : all
  const preview = props.preview
  return preview
    ? list.map((primitive, i) => (i === preview.index ? preview.primitive : primitive))
    : list
})

/**
 * Comment chaque forme se montre sur le calque de travail : sous la main, estompée et hors
 * d'atteinte, ou cachée.
 */
const showing = computed<('shown' | 'dimmed' | 'hidden')[]>(() =>
  primitives.value.map((primitive) => {
    const footprint = isFootprint(primitive)
    switch (props.layer) {
      case 'drawing':
        return footprint ? 'hidden' : 'shown'
      case 'pins':
        return footprint ? 'hidden' : 'dimmed'
      case 'footprint':
        return footprint ? 'shown' : 'dimmed'
      default:
        return 'shown'
    }
  })
)

/**
 * Tracé de chaque forme d'empreinte (null pour les autres) : une empreinte se dessine dans
 * l'allure commune aux empreintes (footprint.ts), pas avec son trait ni son remplissage.
 */
const outlines = computed(() =>
  primitives.value.map((primitive) =>
    isFootprint(primitive) && 'style' in primitive ? footprintPath(primitive, props.cellPx) : null
  )
)
// Dans l'éditeur, où l'on zoome fort, le contour d'une empreinte garde son épaisseur à l'écran,
// comme un cadre de sélection : à la mesure des cellules, il deviendrait un bandeau.
const FOOTPRINT_LINE_PX = 2
const FOOTPRINT_DASH_PX = [7, 5]
const footprintLine = computed(() => FOOTPRINT_LINE_PX * props.pixel)
const footprintDashes = computed(() =>
  FOOTPRINT_DASH_PX.map((length) => length * props.pixel).join(' ')
)

const HIT_MIN_PX = 10

/**
 * Une image suivie d'une voisine, à sa droite ou dessous (les tranches d'un composant étiré),
 * déborde d'un pixel sur elle : sans cela le fond passe entre les deux quand leur frontière
 * tombe au milieu d'un pixel.
 */
const lapped = computed(() => abuttingImages(primitives.value))
const lapRight = (index: number): number => (lapped.value.right.has(index) ? props.pixel : 0)
const lapBelow = (index: number): number => (lapped.value.below.has(index) ? props.pixel : 0)

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

/**
 * Tracés d'une grille de trous : toutes ses pastilles en un seul, tous ses trous en un autre
 * (une plaque en a des centaines).
 */
function holesPaths(grid: HolesPrimitive): { pads: string; drills: string } {
  const cells = holeCells(grid)
  return {
    pads: discsPathData(cells, HOLE_PAD_RADIUS_CELLS, props.cellPx),
    drills: discsPathData(cells, HOLE_RADIUS_CELLS, props.cellPx)
  }
}

/** Une empreinte fermée a un intérieur sur son calque ; ailleurs, elle n'est qu'un contour. */
function filledFootprint(index: number): boolean {
  return props.layer === 'footprint' && outlines.value[index]?.closed === true
}

/** Une forme estompée est hors d'atteinte : l'appui la traverse. */
function reachable(index: number): boolean {
  return props.interactive && showing.value[index] === 'shown'
}

function down(index: number, event: PointerEvent): void {
  if (reachable(index)) emit('primitiveDown', index, event)
}

function menu(index: number, event: MouseEvent): void {
  if (reachable(index)) emit('primitiveMenu', index, event)
}
</script>

<template>
  <g class="component-graphic">
    <template v-for="(p, i) in primitives" :key="i">
      <g
        v-if="showing[i] !== 'hidden'"
        :transform="transformFor(i)"
        :class="{ interactive: reachable(i), dimmed: showing[i] === 'dimmed' }"
        @pointerdown="down(i, $event)"
        @contextmenu="menu(i, $event)"
      >
        <!-- Une empreinte : un filet sombre que recouvrent des tirets clairs. Sur son calque,
             un voile sombre la remplit et elle se saisit aussi par l'intérieur ; quand tout
             est affiché, elle n'est qu'un contour, pour laisser voir et saisir le dessin
             qu'elle entoure. -->
        <template v-if="outlines[i]">
          <path
            class="footprint-shape"
            :d="outlines[i]?.d"
            :fill="filledFootprint(i) ? FOOTPRINT_STYLE.dark : 'none'"
            :fill-opacity="FOOTPRINT_STYLE.shadowOpacity"
            :stroke="FOOTPRINT_STYLE.dark"
            :stroke-opacity="FOOTPRINT_STYLE.darkOpacity"
            :stroke-width="footprintLine"
          />
          <path
            class="footprint-dashes"
            :d="outlines[i]?.d"
            fill="none"
            :stroke="FOOTPRINT_STYLE.light"
            :stroke-width="footprintLine"
            :stroke-dasharray="footprintDashes"
          />
          <path
            v-if="interactive"
            :d="outlines[i]?.d"
            :fill="filledFootprint(i) ? 'transparent' : 'none'"
            stroke="transparent"
            :stroke-width="HIT_MIN_PX"
          />
        </template>

        <template v-else-if="p.kind === 'rect'">
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
          <polygon
            v-else-if="p.closed"
            :points="polyPoints(p.points)"
            v-bind="shapeAttrs(p.style)"
          />
          <polyline
            v-else
            :points="pointsAttribute(strokePoints(p))"
            v-bind="shapeAttrs(p.style)"
          />
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

        <template v-else-if="p.kind === 'holes'">
          <path class="hole-pads" :d="holesPaths(p).pads" :fill="p.color" />
          <path
            class="hole-drills"
            :d="holesPaths(p).drills"
            :fill="HOLE_COLOR"
            :fill-opacity="HOLE_OPACITY"
          />
          <rect
            v-if="interactive"
            :x="q(p.x)"
            :y="q(p.y)"
            :width="q(p.w)"
            :height="q(p.h)"
            fill="transparent"
          />
        </template>

        <template v-else-if="p.kind === 'image'">
          <!-- Une tranche de l'image (composant étiré), ou une image tournée : l'image remplit
             un carré d'une unité, où elle tourne autour du centre ; la fenêtre de ce petit SVG
             n'en montre que la tranche voulue, et l'étire à la taille de la boîte. -->
          <svg
            v-if="p.dataUrl && (p.crop || p.rotation)"
            class="image-slice"
            :x="q(p.x)"
            :y="q(p.y)"
            :width="q(p.w) + lapRight(i)"
            :height="q(p.h) + lapBelow(i)"
            :viewBox="
              p.crop ? `${p.crop.x} ${p.crop.y ?? 0} ${p.crop.w} ${p.crop.h ?? 1}` : '0 0 1 1'
            "
            preserveAspectRatio="none"
          >
            <image
              :href="p.dataUrl"
              x="0"
              y="0"
              width="1"
              height="1"
              preserveAspectRatio="none"
              :transform="imageTurn(p)"
            />
          </svg>
          <image
            v-else-if="p.dataUrl"
            :href="p.dataUrl"
            :x="q(p.x)"
            :y="q(p.y)"
            :width="q(p.w) + lapRight(i)"
            :height="q(p.h) + lapBelow(i)"
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
    </template>
  </g>
</template>

<style scoped>
.interactive {
  cursor: pointer;
}

/* Hors du calque de travail : estompé, et hors d'atteinte. */
.dimmed {
  opacity: 0.3;
  pointer-events: none;
}
</style>
