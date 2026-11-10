<script setup lang="ts">
import { computed } from 'vue'
import {
  DIAGRAM_FONT_FAMILIES,
  layoutNodeText,
  nodeParts,
  nodeTextAttrs,
  nodeTextTone,
  SUBTITLE_OPACITY,
  TINT_OPACITY,
  type DiagramNode,
  type DiagramStyle,
  type NodePart
} from '@/domain'
import { screenColor } from './ink'

// Un nœud de diagramme, en cellules : ses tracés (catalogue du domaine) puis son texte. Sans
// état ; le canevas, la bibliothèque et les aperçus s'en servent. Le noir pur prend l'encre du
// thème. Un fond teinté se pose sur une sous-couche couleur papier, pour masquer ce qui passe
// derrière le nœud.

const props = defineProps<{ node: DiagramNode; look: DiagramStyle }>()

const parts = computed(() => nodeParts(props.node, props.look))
const text = computed(() => layoutNodeText(props.node, props.look))
const color = computed(() => screenColor(props.node.color))

function fillOf(part: NodePart): string {
  if (part.fill === 'color') return color.value
  return part.fill === 'body' && props.node.fill !== 'none' ? color.value : 'none'
}

function opacityOf(part: NodePart): number | undefined {
  return part.fill === 'body' && props.node.fill === 'tint' ? TINT_OPACITY : undefined
}

/** Texte : l'encre du thème, sauf sur un fond plein, où il contraste avec lui. */
const textColor = computed(() => {
  const tone = nodeTextTone(props.node)
  if (tone === 'ink') return 'var(--ink)'
  // Fond plein à l'encre du thème : le texte prend la couleur du papier.
  if (props.node.color.toLowerCase() === '#000000') return 'var(--paper)'
  return tone === 'light' ? '#ffffff' : '#000000'
})
</script>

<template>
  <g class="diagram-node">
    <template v-for="(part, index) in parts" :key="index">
      <path
        v-if="part.fill === 'body' && node.fill === 'tint'"
        :d="part.d"
        fill="var(--paper)"
        stroke="none"
      />
      <path
        :d="part.d"
        :fill="fillOf(part)"
        :fill-opacity="opacityOf(part)"
        :stroke="part.stroke ? color : 'none'"
        :stroke-width="look.lineWidth"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </template>
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
