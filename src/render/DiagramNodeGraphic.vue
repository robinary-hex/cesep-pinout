<script setup lang="ts">
import { computed } from 'vue'
import {
  DIAGRAM_FONT_FAMILIES,
  isDarkColor,
  layoutNodeText,
  mixColors,
  nodeLineAttrs,
  nodeParts,
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
// couleur et son contour s'en détache ; le texte prend la couleur de la forme.

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

/**
 * Texte : la couleur de la forme, sauf sur un fond plein, où elle ne se lirait pas : il y
 * contraste avec le fond. Ou la couleur propre au nœud ; son noir pur est l'encre du thème, sauf
 * sur un fond plein, où il reste noir.
 */
const textColor = computed(() => {
  const own = props.node.textColor
  const solid = props.node.fill === 'solid'
  if (own !== null) return solid ? own : screenColor(own)
  if (!solid) return color.value
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
      :font-family="DIAGRAM_FONT_FAMILIES[text.font]"
      :fill="textColor"
    >
      <tspan
        v-for="(line, index) in text.lines"
        :key="index"
        :x="text.x"
        :y="line.y"
        :font-size="line.size"
        :fill-opacity="line.role === 'subtitle' ? SUBTITLE_OPACITY : undefined"
        v-bind="nodeLineAttrs(line)"
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
