<script setup lang="ts">
import { computed } from 'vue'
import {
  FOOTPRINT_STYLE,
  footprintDashArray,
  footprintDrawing,
  type ComponentDefinition
} from '@/domain'

// L'empreinte d'un composant, telle qu'elle se dessine sur l'autre face d'une plaque à trous, en
// cellules : la silhouette de toutes ses formes d'empreinte réunies, dans l'allure commune aux
// empreintes (footprint.ts). Un voile sombre la remplit ; un filet sombre que recouvrent des
// tirets clairs la cerne. Les traits sont tracés deux fois trop épais et le masque en retire
// tout ce qui tombe dans une forme : il n'en reste que le contour de l'ensemble, sans les côtés
// que deux formes partagent. Le même dessin qu'à l'export (`footprintSvg`).

const props = defineProps<{
  def: ComponentDefinition
  /** Identifiant du masque : unique dans le dessin où l'empreinte est posée. */
  maskId: string
}>()

const drawing = computed(() => footprintDrawing(props.def.visual.primitives))
const closed = computed(() => drawing.value?.shapes.filter((shape) => shape.closed) ?? [])
const dashes = footprintDashArray()

/** Une forme ouverte (une ligne) n'a pas d'intérieur : son trait reste entier. */
function lineWidth(shape: { closed: boolean }): number {
  return shape.closed ? 2 * FOOTPRINT_STYLE.width : FOOTPRINT_STYLE.width
}
</script>

<template>
  <g v-if="drawing" class="footprint-graphic">
    <g class="footprint-shadow" :opacity="FOOTPRINT_STYLE.shadowOpacity">
      <path
        v-for="(shape, i) in closed"
        :key="i"
        :d="shape.d"
        :fill="FOOTPRINT_STYLE.dark"
        :stroke="FOOTPRINT_STYLE.dark"
        :stroke-width="FOOTPRINT_STYLE.seam"
      />
    </g>
    <mask
      :id="maskId"
      maskUnits="userSpaceOnUse"
      :x="drawing.box.x"
      :y="drawing.box.y"
      :width="drawing.box.width"
      :height="drawing.box.height"
    >
      <rect
        :x="drawing.box.x"
        :y="drawing.box.y"
        :width="drawing.box.width"
        :height="drawing.box.height"
        fill="#ffffff"
      />
      <path
        v-for="(shape, i) in closed"
        :key="i"
        :d="shape.d"
        fill="#000000"
        stroke="#000000"
        :stroke-width="FOOTPRINT_STYLE.seam"
      />
    </mask>
    <g class="footprint-outline" :mask="`url(#${maskId})`" fill="none">
      <path
        v-for="(shape, i) in drawing.shapes"
        :key="`filet${i}`"
        :d="shape.d"
        :stroke="FOOTPRINT_STYLE.dark"
        :stroke-opacity="FOOTPRINT_STYLE.darkOpacity"
        :stroke-width="lineWidth(shape)"
      />
      <path
        v-for="(shape, i) in drawing.shapes"
        :key="`tirets${i}`"
        class="footprint-dashes"
        :d="shape.d"
        :stroke="FOOTPRINT_STYLE.light"
        :stroke-width="lineWidth(shape)"
        :stroke-dasharray="dashes"
      />
    </g>
  </g>
</template>
