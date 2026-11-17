<script setup lang="ts">
import { computed } from 'vue'
import {
  createNode,
  DEFAULT_DIAGRAM_STYLE,
  type DiagramNode,
  type DiagramStyle,
  type LinkDash,
  type NodeFill
} from '@/domain'
import DiagramNodeGraphic from '@/render/DiagramNodeGraphic.vue'
import { baseName } from '@/io/paths'
import Icon from '@/ui/Icon.vue'
import ToolbarBasics from '@/ui/ToolbarBasics.vue'
import ToolbarPalette from '@/ui/ToolbarPalette.vue'
import { useDiagramStore } from './store'

// Barre d'outils du diagramme. D'abord le début commun aux trois éditeurs (`ToolbarBasics` :
// zoom, annuler, rétablir, corbeille), puis les outils (pictogramme seul, raccourci dans
// l'infobulle), le fond des nœuds, le style des liens, la palette (un clic droit sur une couleur
// la modifie ou la supprime) et, s'il y a des groupes, la
// case qui montre leur contour ; à droite,
// le nom du document et le bouton du panneau de propriétés. La palette, le fond et le style des liens règlent ce que
// seront les prochains éléments et changent aussi la sélection. Les formes se posent depuis la
// bibliothèque, à gauche ; les actions de fichier passent par le menu Fichier.

const store = useDiagramStore()

const fileLabel = computed(() => (store.filePath ? baseName(store.filePath) : 'Non enregistré'))

/** Infobulle du bouton de copie de style, selon qu'elle est en cours, possible ou non. */
const styleCopyTitle = computed(() => {
  if (store.tool === 'style') return 'Arrêter la copie de style (S ou Échap)'
  return store.styleCandidate
    ? 'Copier le style de la sélection : clic ou lasso sur les éléments du même type (S)'
    : 'Copier le style (S) : sélectionne d’abord une forme, un lien ou un texte'
})

function pickCustom(hex: string): void {
  // La couleur choisie reste dans ce diagramme ; la palette générale se règle dans les Paramètres.
  store.addCustomColor(hex)
  store.setCurrentColor(hex)
}

/** Fonds proposés, chacun montré par un petit nœud d'exemple dans la couleur courante. */
const FILLS: { value: NodeFill; label: string; title: string }[] = [
  { value: 'none', label: 'Contour', title: 'Fond : contour seul' },
  {
    value: 'tint',
    label: 'Teinté',
    title: 'Fond : teinté, plus clair que le contour (plus sombre en thème sombre)'
  },
  {
    value: 'solid',
    label: 'Plein',
    title: 'Fond : plein, la couleur même, contour qui s’en détache'
  }
]

/** Nœud d'exemple d'une pastille de fond : la forme, sans texte, dans la couleur des nœuds. */
function fillSample(fill: NodeFill): DiagramNode {
  return {
    ...createNode(fill, 'rounded', 0, 0),
    w: 10,
    h: 6,
    color: firstNode.value?.color ?? store.nodeColor,
    fill
  }
}

const SAMPLE_LOOK: DiagramStyle = { ...DEFAULT_DIAGRAM_STYLE, lineWidth: 0.7, nodeRadius: 1.5 }

// Fond et style de lien : les boutons montrent ceux de la sélection s'il y en a une, sinon ceux
// des prochains éléments ; un clic règle les deux.
const firstNode = computed(
  () => store.doc.nodes.find((node) => store.selectedNodes.includes(node.id)) ?? null
)
const firstLink = computed(
  () => store.doc.links.find((link) => store.selectedLinks.includes(link.id)) ?? null
)
const shownFill = computed(() => firstNode.value?.fill ?? store.nodeFill)
const dashed = computed(() => (firstLink.value?.dash ?? store.linkDash) === 'dashed')
const startArrow = computed(() => firstLink.value?.startArrow ?? store.linkStartArrow)
const endArrow = computed(() => firstLink.value?.endArrow ?? store.linkEndArrow)

function toggleDash(): void {
  const dash: LinkDash = dashed.value ? 'solid' : 'dashed'
  store.linkDash = dash
  store.setLinksStyle(store.selectedLinks, { dash })
}

function toggleStartArrow(): void {
  const on = !startArrow.value
  store.linkStartArrow = on
  store.setLinksStyle(store.selectedLinks, { startArrow: on })
}

function toggleEndArrow(): void {
  const on = !endArrow.value
  store.linkEndArrow = on
  store.setLinksStyle(store.selectedLinks, { endArrow: on })
}
</script>

<template>
  <div class="toolbar">
    <div class="main">
      <ToolbarBasics
        :zoom="`${Math.round(store.view.zoom * 100)} %`"
        :undo-label="store.undoLabel"
        :redo-label="store.redoLabel"
        :can-delete="store.hasSelection"
        @zoom-out="store.zoomAround(1 / 1.25)"
        @zoom-in="store.zoomAround(1.25)"
        @zoom-reset="store.resetZoom()"
        @fit="store.fitToContent()"
        @undo="store.undo()"
        @redo="store.redo()"
        @remove="store.removeSelection()"
      />

      <div class="group">
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'select' }"
          title="Sélection (V)"
          @click="store.selectTool()"
        >
          <Icon name="cursor" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'link' }"
          title="Tracer un lien (F)"
          @click="store.startLinkTool()"
        >
          <Icon name="link" :size="18" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: store.tool === 'text' }"
          title="Poser un texte libre (E)"
          @click="store.startTextTool()"
        >
          <Icon name="type" :size="18" />
        </button>
      </div>

      <!-- La copie de style, un peu à part : elle ne pose rien, elle retouche ce qui est là. -->
      <div class="group">
        <button
          type="button"
          class="tool icon-only style-copy"
          :class="{ active: store.tool === 'style' }"
          :disabled="store.tool !== 'style' && store.styleCandidate === null"
          :title="styleCopyTitle"
          @click="store.toggleStyleCopy()"
        >
          <Icon name="paint-roller" :size="18" />
        </button>
      </div>

      <div class="group fills">
        <button
          v-for="fill in FILLS"
          :key="fill.value"
          type="button"
          class="tool fill-choice"
          :class="{ active: shownFill === fill.value }"
          :title="`${fill.title} ; change aussi les nœuds sélectionnés`"
          :aria-label="fill.label"
          @click="store.setCurrentFill(fill.value)"
        >
          <svg viewBox="-1 -1 12 8" width="24" height="16" aria-hidden="true">
            <DiagramNodeGraphic :node="fillSample(fill.value)" :look="SAMPLE_LOOK" />
          </svg>
        </button>
      </div>

      <div class="group" title="Style des prochains liens ; change aussi les liens sélectionnés">
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: startArrow }"
          title="Flèche au départ du lien"
          @click="toggleStartArrow"
        >
          <Icon name="arrow-left" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: endArrow }"
          title="Flèche à l'arrivée du lien"
          @click="toggleEndArrow"
        >
          <Icon name="arrow-right" />
        </button>
        <button
          type="button"
          class="tool icon-only"
          :class="{ active: dashed }"
          title="Lien en pointillés"
          @click="toggleDash"
        >
          <Icon name="dash" />
        </button>
      </div>

      <ToolbarPalette
        class="group palette"
        :title="
          store.paletteOnLinks
            ? 'Couleur des prochains liens ; recolore aussi la sélection'
            : 'Couleur des prochains nœuds ; recolore aussi la sélection'
        "
        :swatches="store.colorChoices"
        :current="store.currentColor"
        adder-title="Couleur personnalisée, gardée dans ce diagramme"
        palette-name="Palette des diagrammes"
        custom-name="Couleur de ce diagramme"
        @pick="store.setCurrentColor"
        @add="pickCustom"
        @change="store.changeColorChoice"
        @remove="store.removeColorChoice"
      />

      <div v-if="store.hasGroups" class="group">
        <label class="check" title="Entourer les groupes">
          <input v-model="store.showGroups" type="checkbox" />
          Groupes
        </label>
      </div>
    </div>

    <div class="right">
      <span class="doc-name" :title="store.filePath ?? 'Pas encore enregistré'">
        <span class="name">{{ store.doc.name }}</span>
        <span class="file">{{ fileLabel }}</span>
      </span>
      <button
        type="button"
        class="tool icon-only"
        :class="{ active: store.inspectorOpen }"
        title="Afficher ou masquer le panneau de propriétés (I)"
        @click="store.inspectorOpen = !store.inspectorOpen"
      >
        <Icon name="panel" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 6px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

/* Partie gauche : ses groupes passent à la ligne quand la place manque. */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}

.right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

/* Pastilles et fonds serrés : avec l'outil de copie de style, à part des autres, la barre tient
   encore sur une ligne dans la fenêtre de départ (1400 px). */
.palette {
  gap: 2px;
}

/* Pastilles de fond : un petit nœud dessiné sur la couleur du papier, comme sur le diagramme. */
.fills {
  gap: 1px;
}

.fill-choice {
  display: inline-flex;
  align-items: center;
  padding: 4px 2px;
  background: var(--paper);
}

.fill-choice svg {
  display: block;
}

.fill-choice.active {
  background: var(--paper);
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.doc-name {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
  line-height: 1.2;
}

.doc-name .name,
.doc-name .file {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-name .name {
  font-weight: 600;
}

.file {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
