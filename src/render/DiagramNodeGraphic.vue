<script setup lang="ts">
import { computed } from 'vue'
import {
  DIAGRAM_FONT_FAMILIES,
  isDarkColor,
  layoutNodeText,
  mixColors,
  nodeParts,
  nodeTextAttrs,
  SOLID_BORDER_SHARE,
  solidBorderToward,
  SUBTITLE_OPACITY,
  type DiagramNode,
  type DiagramStyle,
  type NodePart
} from '@/domain'
import { screenColor } from './ink'

// Un nœud de diagramme, en cellules : ses tracés (catalogue du domaine) puis son texte. Sans
// état ; le canevas, la bibliothèque et les aperçus s'en servent. Mêmes règles de couleur que
// `nodePaint` du domaine (ce que l'export écrit), mais avec les variables du thème : le noir pur
// prend l'encre, un fond teinté mêle la couleur au papier (`--node-tint`), un fond plein garde la
// couleur et son contour s'en détache.

const props = defineProps<{ node: DiagramNode; look: DiagramStyle }>()

const parts = computed(() => nodeParts(props.node, props.look))
const text = computed(() => layoutNodeText(props.node, props.look))
const isInk = computed(() => props.node.color.toLowerCase() === '#000000')
const color = computed(() => screenColor(props.node.color))

const stroke = computed(() => {
  if (props.node.fill !== 'solid') return color.value
  if (isInk.value) {
    return `color-mix(in srgb, var(--ink) ${SOLID_BORDER_SHARE * 100}%, var(--paper))`
  }
  return mixColors(props.node.color, solidBorderToward(props.node.color), SOLID_BORDER_SHARE)
})

const body = computed(() => {
  if (props.node.fill === 'none') return 'none'
  if (props.node.fill === 'solid') return color.value
  return `color-mix(in srgb, ${color.value} var(--node-tint), var(--paper))`
})

function fillOf(part: NodePart): string {
  if (part.fill === 'color') return color.value
  return part.fill === 'body' ? body.value : 'none'
}

/** Texte : l'encre du thème, sauf sur un fond plein, où il contraste avec lui. */
const textColor = computed(() => {
  if (props.node.fill !== 'solid') return 'var(--ink)'
  // Fond plein à l'encre du thème : le texte prend la couleur du papier.
  if (isInk.value) return 'var(--paper)'
  return isDarkColor(props.node.color) ? '#ffffff' : '#000000'
})
</script>

<template>
  <g class="diagram-node">
    <path
      v-for="(part, index) in parts"
      :key="index"
      :d="part.d"
      :fill="fillOf(part)"
      :stroke="part.stroke ? stroke : 'none'"
      :stroke-width="look.lineWidth"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <text
      v-if="text"
      text-anchor="middle"
      :font-family="DIAGRAM_FONT_FAMILIES[look.font]"
      :fill="textColor"
    >
      <tspan
        v-for="(line, index) in text.lines"
        :key="index"
        :x="text.x"
        :y="line.y"
        :font-size="line.size"
        :fill-opacity="line.role === 'subtitle' ? SUBTITLE_OPACITY : undefined"
        v-bind="nodeTextAttrs(line.role, look.font)"
      >
        {{ line.text }}
      </tspan>
    </text>
  </g>
</template>

<style scoped>
.diagram-node text {
  pointer-events: none;
}
</style>
