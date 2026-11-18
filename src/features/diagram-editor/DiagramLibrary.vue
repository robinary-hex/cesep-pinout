<script setup lang="ts">
import { computed } from 'vue'
import {
  createNode,
  DEFAULT_DIAGRAM_STYLE,
  NODE_FAMILIES,
  NODE_SPECS,
  type DiagramNode,
  type DiagramStyle,
  type NodeShape
} from '@/domain'
import DiagramNodeGraphic from '@/render/DiagramNodeGraphic.vue'
import { useDiagramStore } from './store'

// Bibliothèque du diagramme, dans le panneau latéral (`src/app/SidePanel.vue`, qui porte les
// onglets et le champ de recherche) : les formes du catalogue, en vignettes sur trois colonnes,
// rangées par famille (général, organigramme, activité, communication). Un clic puis un clic
// sur le diagramme pose la forme, ou on la glisse directement dessus. Rien à créer ni à
// enregistrer ici : les formes sont définies en dur dans le domaine.

/** `search` : ce qu'on a tapé dans le champ de recherche du panneau ; les formes dont le nom le contient. */
const props = withDefaults(defineProps<{ search?: string }>(), { search: '' })

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
  note: { w: 16, h: 6 },
  terminal: { w: 16, h: 6 },
  io: { w: 16, h: 6 },
  subroutine: { w: 16, h: 6 },
  preparation: { w: 16, h: 6 },
  connector: { w: 6, h: 6 },
  database: { w: 8, h: 6 },
  cloud: { w: 10, h: 6 }
}

function sample(shape: NodeShape): DiagramNode {
  const { w, h } = SAMPLE_SIZES[shape]
  return {
    ...createNode(shape, shape, (16 - w) / 2, (6 - h) / 2),
    w,
    h,
    fill: 'none'
  }
}

const families = NODE_FAMILIES.map((family) => ({
  label: family.label,
  tiles: family.shapes.map((shape) => ({
    shape,
    label: NODE_SPECS[shape].label,
    node: sample(shape)
  }))
}))

/** Les familles, réduites aux formes que garde la recherche. */
const shown = computed(() => {
  const needle = props.search.trim().toLowerCase()
  if (needle.length === 0) return families
  return families
    .map((family) => ({
      ...family,
      tiles: family.tiles.filter((tile) => tile.label.toLowerCase().includes(needle))
    }))
    .filter((family) => family.tiles.length > 0)
})

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
  <div class="library">
    <p v-if="shown.length === 0" class="hint">Rien ne correspond à la recherche.</p>
    <section v-for="family in shown" :key="family.label" class="family">
      <h3>{{ family.label }}</h3>
      <div class="grid">
        <button
          v-for="tile in family.tiles"
          :key="tile.shape"
          type="button"
          class="tile"
          :class="{ current: store.placement === tile.shape }"
          :title="tile.label"
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
    </section>
  </div>
</template>

<style scoped>
.library {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.hint {
  margin: 16px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Titre d'une famille de formes : comme une catégorie de la bibliothèque de composants. */
.family h3 {
  margin: 0;
  padding: 10px 12px 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px 8px 6px;
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
