<script setup lang="ts">
import {
  DEFAULT_DIAGRAM_STYLE,
  NODE_SHAPES,
  NODE_SPECS,
  type DiagramNode,
  type DiagramStyle,
  type NodeShape
} from '@/domain'
import DiagramNodeGraphic from '@/render/DiagramNodeGraphic.vue'
import { useDiagramStore } from './store'

// Bibliothèque du diagramme : les formes du catalogue, en vignettes. Un clic puis un clic sur le
// diagramme pose la forme, ou on la glisse directement dessus. Rien à créer ni à enregistrer ici :
// les formes sont définies en dur dans le domaine.

const store = useDiagramStore()

/** Trait épaissi et coins marqués : une vignette montre la forme à petite échelle. */
const THUMB_LOOK: DiagramStyle = { ...DEFAULT_DIAGRAM_STYLE, lineWidth: 0.45, nodeRadius: 1.5 }

/** Taille de l'échantillon dessiné dans la vignette (18 × 8 cellules), par forme. */
const SAMPLE_SIZES: Record<NodeShape, { w: number; h: number }> = {
  rounded: { w: 16, h: 6 },
  rect: { w: 16, h: 6 },
  diamond: { w: 10, h: 6 },
  start: { w: 6, h: 6 },
  end: { w: 6, h: 6 },
  'flow-end': { w: 6, h: 6 },
  bar: { w: 14, h: 0 },
  send: { w: 16, h: 6 },
  receive: { w: 16, h: 6 },
  note: { w: 16, h: 6 }
}

function sample(shape: NodeShape): DiagramNode {
  const { w, h } = SAMPLE_SIZES[shape]
  return {
    id: shape,
    shape,
    x: (16 - w) / 2,
    y: (6 - h) / 2,
    w,
    h,
    title: '',
    subtitle: '',
    color: '#000000',
    fill: 'none'
  }
}

const tiles = NODE_SHAPES.map((shape) => ({
  shape,
  label: NODE_SPECS[shape].label,
  node: sample(shape)
}))

function onDragStart(shape: NodeShape, event: DragEvent): void {
  store.startPlacing(shape)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', shape)
  }
}

function onDragEnd(): void {
  // Lâché hors du diagramme : la pose s'arrête.
  if (store.tool === 'place') store.stopPlacing()
}
</script>

<template>
  <aside class="library">
    <header class="library-head">
      <h2>Formes</h2>
    </header>
    <div class="grid">
      <button
        v-for="tile in tiles"
        :key="tile.shape"
        type="button"
        class="tile"
        :class="{ current: store.placement === tile.shape }"
        :title="`${tile.label} : clic ici puis sur le diagramme, ou glisser-déposer`"
        draggable="true"
        @click="store.startPlacing(tile.shape)"
        @dragstart="onDragStart(tile.shape, $event)"
        @dragend="onDragEnd"
      >
        <svg viewBox="-1 -1 18 8" width="72" height="32" aria-hidden="true">
          <DiagramNodeGraphic :node="tile.node" :look="THUMB_LOOK" />
        </svg>
        <span class="tile-name">{{ tile.label }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.library {
  width: 200px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.library-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
}

.library-head h2 {
  margin: 0;
  font-size: 14px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--paper-text);
  cursor: pointer;
}

.tile:hover {
  background: var(--surface-3);
  border-color: var(--border);
}

.tile.current {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

.tile svg {
  display: block;
  pointer-events: none;
}

.tile-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.2;
  color: var(--text-muted);
}
</style>
