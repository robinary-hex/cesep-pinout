<script setup lang="ts">
import { computed } from 'vue'
import {
  NODE_FAMILIES,
  NODE_SPECS,
  NODE_TEXT_SCALES,
  nodeFont,
  TEXT_SCALES,
  type DiagramStyle,
  type LinkDash,
  type NodeFill,
  type NodeShape,
  type TextAnchor
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import DiagramStyleFields from '@/features/settings/DiagramStyleFields.vue'
import Icon from '@/ui/Icon.vue'
import type { IconName } from '@/ui/icons'
import { useDiagramStore } from './store'

// Panneau de droite du diagramme (replié par défaut, touche I). Toujours : le diagramme, avec son
// nom et sa police. Avec une sélection : seulement les propriétés de l'élément (nœud, lien, texte
// libre, groupe).

const emit = defineEmits<{ exportImage: [] }>()
const store = useDiagramStore()
const library = useLibraryStore()
const doc = computed(() => store.doc)

/** Le style du diagramme se règle champ par champ : chaque changement est une commande. */
function setStyle(style: DiagramStyle): void {
  store.setStyle(style)
}

const count = computed(
  () => store.selectedNodes.length + store.selectedLinks.length + store.selectedTexts.length
)
const singleNode = computed(() =>
  count.value === 1
    ? (doc.value.nodes.find((node) => node.id === store.selectedNodes[0]) ?? null)
    : null
)
const singleLink = computed(() =>
  count.value === 1
    ? (doc.value.links.find((link) => link.id === store.selectedLinks[0]) ?? null)
    : null
)
const singleText = computed(() =>
  count.value === 1
    ? (doc.value.texts.find((text) => text.id === store.selectedTexts[0]) ?? null)
    : null
)

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function setName(event: Event): void {
  const name = inputValue(event).trim()
  if (name.length > 0) store.setName(name)
}

function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

// Nœud

const BOX_FIELDS = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'w', label: 'Largeur' },
  { key: 'h', label: 'Hauteur' }
] as const

const FILLS: { value: NodeFill; label: string }[] = [
  { value: 'none', label: 'Contour' },
  { value: 'tint', label: 'Teinté' },
  { value: 'solid', label: 'Plein' }
]

function setNodeShape(event: Event): void {
  const node = singleNode.value
  if (node) store.setNodeShape(node.id, inputValue(event) as NodeShape)
}

function setNodeTitle(event: Event): void {
  const node = singleNode.value
  if (node) store.setNodeText(node.id, { title: inputValue(event) })
}

function setNodeSubtitle(event: Event): void {
  const node = singleNode.value
  if (node) store.setNodeText(node.id, { subtitle: inputValue(event) })
}

type NodeTextKey = 'bold' | 'italic' | 'underline' | 'strike'

/** Styles du titre d'un nœud, un bouton à pictogramme chacun. */
const NODE_TEXT_OPTIONS: { key: NodeTextKey; label: string; icon: IconName }[] = [
  { key: 'bold', label: 'Gras', icon: 'bold' },
  { key: 'italic', label: 'Italique', icon: 'italic' },
  { key: 'underline', label: 'Souligné', icon: 'underline' },
  { key: 'strike', label: 'Barré', icon: 'strikethrough' }
]

function toggleNodeText(option: (typeof NODE_TEXT_OPTIONS)[number]): void {
  const node = singleNode.value
  if (!node) return
  const on = !node[option.key]
  store.setNodesTextStyle([node.id], `${option.label} ${on ? 'activé' : 'retiré'}`, {
    [option.key]: on
  })
}

/** Le nœud est-il en chasse fixe, par son propre choix ou par la police du diagramme ? */
const nodeIsMono = computed(() =>
  singleNode.value ? nodeFont(singleNode.value, doc.value.style) === 'mono' : false
)

/** Bascule la police du nœud ; revenu à celle du diagramme, il la suit de nouveau. */
function toggleNodeMono(): void {
  const node = singleNode.value
  if (!node) return
  const wanted = nodeIsMono.value ? 'sans' : 'mono'
  store.setNodesTextStyle(
    [node.id],
    wanted === 'mono' ? 'Texte en chasse fixe' : 'Texte en police normale',
    { font: wanted === doc.value.style.font ? null : wanted }
  )
}

/** Tailles proposées pour le texte d'un nœud, plus la sienne si elle n'en fait pas partie. */
const nodeScaleChoices = computed(() => {
  const list: number[] = [...NODE_TEXT_SCALES]
  const current = singleNode.value?.textScale
  if (current !== undefined && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
})

function setNodeScale(event: Event): void {
  const node = singleNode.value
  const scale = Number(inputValue(event))
  if (node && Number.isFinite(scale) && scale > 0) {
    store.setNodesTextStyle([node.id], 'Taille du texte du nœud', { textScale: scale })
  }
}

function setNodeFill(event: Event): void {
  const node = singleNode.value
  if (node) store.setNodesStyle([node.id], { fill: inputValue(event) as NodeFill })
}

function setNodeBox(key: 'x' | 'y' | 'w' | 'h', event: Event): void {
  const node = singleNode.value
  const value = Number(inputValue(event))
  if (!node || !Number.isFinite(value)) return
  store.setNodeBox(node.id, {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    [key]: Math.round(value)
  })
}

// Lien

function setLinkDash(event: Event): void {
  const link = singleLink.value
  if (link) store.setLinksStyle([link.id], { dash: inputValue(event) as LinkDash })
}

function setLinkArrow(end: 'startArrow' | 'endArrow', event: Event): void {
  const link = singleLink.value
  if (link) store.setLinksStyle([link.id], { [end]: checked(event) })
}

function setLinkLabel(event: Event): void {
  const link = singleLink.value
  if (link) store.setLinkLabel(link.id, inputValue(event))
}

/** Position de l'étiquette le long du lien, en pourcentage de sa longueur. */
function setLinkLabelAt(event: Event): void {
  const link = singleLink.value
  const percent = Number(inputValue(event))
  if (link && Number.isFinite(percent)) {
    store.setLinkLabelPlacement(link.id, percent / 100, link.labelSide)
  }
}

function flipLinkLabel(): void {
  const link = singleLink.value
  if (link) store.setLinkLabelPlacement(link.id, link.labelAt, link.labelSide === 1 ? -1 : 1)
}

function setLinkLabelBackground(event: Event): void {
  const link = singleLink.value
  if (link) store.setLinksStyle([link.id], { labelBackground: checked(event) })
}

// Texte libre

function setTextContent(event: Event): void {
  const text = singleText.value
  if (text) store.setTextContent(text.id, inputValue(event))
}

function setTextAnchor(event: Event): void {
  const text = singleText.value
  if (text) store.setTextAnchor(text.id, inputValue(event) as TextAnchor)
}

/** Tailles proposées : multiples de la taille des étiquettes du diagramme, plus la taille actuelle. */
const textSizeChoices = computed(() => {
  const base = doc.value.style.labelSize
  const list: { scale: number; size: number }[] = TEXT_SCALES.map((scale) => ({
    scale,
    size: base * scale
  }))
  const current = singleText.value?.size
  if (current !== undefined && !list.some((choice) => Math.abs(choice.size - current) < 1e-6)) {
    list.push({ scale: Math.round((current / base) * 100) / 100, size: current })
  }
  return list.sort((a, b) => a.size - b.size)
})

function setTextSize(event: Event): void {
  const text = singleText.value
  const size = Number(inputValue(event))
  if (text && Number.isFinite(size)) store.setTextSize(text.id, Math.max(4, size))
}

type TextStyleKey = 'bold' | 'italic' | 'underline' | 'strike'

const TEXT_STYLE_OPTIONS: { key: TextStyleKey; label: string; icon: IconName }[] = [
  { key: 'bold', label: 'Gras', icon: 'bold' },
  { key: 'italic', label: 'Italique', icon: 'italic' },
  { key: 'underline', label: 'Souligné', icon: 'underline' },
  { key: 'strike', label: 'Barré', icon: 'strikethrough' }
]

function toggleTextStyle(option: (typeof TEXT_STYLE_OPTIONS)[number]): void {
  const text = singleText.value
  if (!text) return
  const on = !text[option.key]
  store.setTextStyle(text.id, `${option.label} ${on ? 'activé' : 'retiré'}`, { [option.key]: on })
}

function setTextColor(event: Event): void {
  const text = singleText.value
  if (text) store.setTextStyle(text.id, 'Couleur du texte', { color: inputValue(event) })
}

function setTextBackground(event: Event): void {
  const text = singleText.value
  if (!text) return
  const background = checked(event)
  store.setTextStyle(text.id, background ? 'Fond du texte' : 'Texte sans fond', { background })
}

function setTextVertical(event: Event): void {
  const text = singleText.value
  if (text) store.setTextVertical(text.id, checked(event))
}

function setTextBox(key: 'x' | 'y' | 'w' | 'h', event: Event): void {
  const text = singleText.value
  const value = Number(inputValue(event))
  if (!text || !Number.isFinite(value)) return
  store.setTextBox(text.id, {
    x: text.x,
    y: text.y,
    w: text.w,
    h: text.h,
    [key]: Math.round(value)
  })
}
</script>

<template>
  <aside class="inspector">
    <header class="panel-head">
      <span>Propriétés</span>
      <button
        type="button"
        class="small"
        title="Masquer le panneau (I)"
        @click="store.inspectorOpen = false"
      >
        ✕
      </button>
    </header>

    <section class="block">
      <h3>Diagramme</h3>
      <div class="row name-row">
        <label class="field">
          <span>Nom du diagramme</span>
          <input type="text" :value="doc.name" @change="setName" />
        </label>
        <button
          type="button"
          class="icon-only"
          title="Exporter en PNG ou SVG (Ctrl+E)"
          @click="emit('exportImage')"
        >
          <Icon name="export" />
        </button>
      </div>
      <p v-if="store.filePath" class="hint path">{{ store.filePath }}</p>
      <p v-else class="hint">Pas encore enregistré.</p>
    </section>

    <section v-if="!store.hasSelection" class="block">
      <h3>Style</h3>
      <DiagramStyleFields
        :model-value="doc.style"
        :reference="library.diagramDefaults.style"
        @update:model-value="setStyle"
      />
      <div v-if="!store.followsGeneralStyle" class="row">
        <button
          type="button"
          class="small with-icon"
          title="Rétablit le style général des diagrammes pour celui-ci (annulable)"
          @click="store.adoptGeneralStyle()"
        >
          <Icon name="refresh" :size="13" /> Réinitialiser
        </button>
      </div>
      <p class="hint">
        {{ doc.nodes.length }} nœud(s), {{ doc.links.length }} lien(s),
        {{ doc.texts.length }} texte(s).
      </p>
    </section>

    <template v-else-if="singleNode">
      <section class="block">
        <h3>{{ NODE_SPECS[singleNode.shape].label }}</h3>
        <label class="field">
          <span>Forme</span>
          <select :value="singleNode.shape" @change="setNodeShape">
            <optgroup v-for="family in NODE_FAMILIES" :key="family.label" :label="family.label">
              <option v-for="shape in family.shapes" :key="shape" :value="shape">
                {{ NODE_SPECS[shape].label }}
              </option>
            </optgroup>
          </select>
        </label>
        <template v-if="NODE_SPECS[singleNode.shape].text">
          <label class="field">
            <span>Titre</span>
            <textarea rows="2" :value="singleNode.title" @change="setNodeTitle" />
          </label>
          <label class="field">
            <span>Sous-titre</span>
            <textarea rows="2" :value="singleNode.subtitle" @change="setNodeSubtitle" />
          </label>
          <div class="row">
            <div class="field">
              <span title="Gras, italique, souligné et barré stylent le titre">Style du texte</span>
              <div class="toggles">
                <button
                  v-for="option in NODE_TEXT_OPTIONS"
                  :key="option.key"
                  type="button"
                  class="toggle"
                  :class="{ active: singleNode[option.key] }"
                  :title="`${option.label} (titre)`"
                  @click="toggleNodeText(option)"
                >
                  <Icon :name="option.icon" />
                </button>
                <button
                  type="button"
                  class="toggle"
                  :class="{ active: nodeIsMono }"
                  title="Chasse fixe, pour du code (titre et sous-titre)"
                  @click="toggleNodeMono"
                >
                  <Icon name="code" />
                </button>
              </div>
            </div>
            <label class="field scale">
              <span>Taille</span>
              <select :value="singleNode.textScale" @change="setNodeScale">
                <option v-for="scale in nodeScaleChoices" :key="scale" :value="scale">
                  ×{{ scale }}
                </option>
              </select>
            </label>
          </div>
        </template>
        <div class="field">
          <span>Couleur</span>
          <div class="swatches">
            <button
              v-for="choice in store.colorChoices"
              :key="choice.hex"
              type="button"
              class="swatch"
              :class="{ current: sameColor(choice.hex, singleNode.color) }"
              :style="{ background: choice.hex }"
              :title="choice.name"
              @click="store.setCurrentColor(choice.hex)"
            />
          </div>
        </div>
        <label class="field">
          <span>Fond</span>
          <select :value="singleNode.fill" @change="setNodeFill">
            <option v-for="fill in FILLS" :key="fill.value" :value="fill.value">
              {{ fill.label }}
            </option>
          </select>
        </label>
        <div class="row">
          <button
            v-if="NODE_SPECS[singleNode.shape].text"
            type="button"
            class="with-icon"
            title="Ajuste la taille du nœud à son texte, au plus près"
            @click="store.fitNodeToText(singleNode.id)"
          >
            <Icon name="fit" /> Ajuster
          </button>
          <button type="button" class="with-icon" @click="store.duplicateSelection()">
            <Icon name="duplicate" /> Dupliquer
          </button>
        </div>
      </section>
      <section class="block">
        <h3>Position et taille</h3>
        <div class="row">
          <label v-for="side in BOX_FIELDS" :key="side.key" class="field">
            <span>{{ side.label }}</span>
            <input
              type="number"
              step="1"
              :value="singleNode[side.key]"
              @change="setNodeBox(side.key, $event)"
            />
          </label>
        </div>
      </section>
    </template>

    <section v-else-if="singleLink" class="block">
      <h3>Lien</h3>
      <label class="field">
        <span>Étiquette</span>
        <textarea rows="2" :value="singleLink.label" @change="setLinkLabel" />
      </label>
      <div v-if="singleLink.label.length > 0" class="row">
        <label class="field">
          <span title="Du départ (0) à l'arrivée (100) ; se règle aussi en la glissant">
            Position le long du lien
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            :value="Math.round(singleLink.labelAt * 100)"
            @change="setLinkLabelAt"
          />
        </label>
        <button
          type="button"
          class="with-icon"
          title="Met l'étiquette de l'autre côté du trait"
          @click="flipLinkLabel"
        >
          <Icon name="swap" /> Côté
        </button>
      </div>
      <label
        v-if="singleLink.label.length > 0"
        class="check"
        title="Un fond de la couleur du papier masque ce qui passe derrière l'étiquette"
      >
        <input
          type="checkbox"
          :checked="singleLink.labelBackground"
          @change="setLinkLabelBackground"
        />
        <span>Fond de l’étiquette</span>
      </label>
      <div class="field">
        <span>Couleur</span>
        <div class="swatches">
          <button
            v-for="choice in store.colorChoices"
            :key="choice.hex"
            type="button"
            class="swatch"
            :class="{ current: sameColor(choice.hex, singleLink.color) }"
            :style="{ background: choice.hex }"
            :title="choice.name"
            @click="store.setCurrentColor(choice.hex)"
          />
        </div>
      </div>
      <label class="field">
        <span>Trait</span>
        <select :value="singleLink.dash" @change="setLinkDash">
          <option value="solid">Plein</option>
          <option value="dashed">Pointillé</option>
        </select>
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="singleLink.startArrow"
          @change="setLinkArrow('startArrow', $event)"
        />
        <span>Flèche au départ</span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="singleLink.endArrow"
          @change="setLinkArrow('endArrow', $event)"
        />
        <span>Flèche à l'arrivée</span>
      </label>
      <div class="row">
        <button
          type="button"
          class="with-icon"
          title="Le départ devient l'arrivée"
          @click="store.reverseLinks([singleLink.id])"
        >
          <Icon name="swap" /> Inverser
        </button>
        <button type="button" class="with-icon" @click="store.duplicateSelection()">
          <Icon name="duplicate" /> Dupliquer
        </button>
      </div>
    </section>

    <template v-else-if="singleText">
      <section class="block">
        <h3>Texte</h3>
        <label class="field">
          <span>Texte</span>
          <textarea rows="3" :value="singleText.text" @change="setTextContent" />
        </label>
        <div class="row">
          <label class="field">
            <span>Alignement</span>
            <select :value="singleText.anchor" @change="setTextAnchor">
              <option value="start">Gauche</option>
              <option value="middle">Centre</option>
              <option value="end">Droite</option>
            </select>
          </label>
          <label class="field">
            <span>Taille</span>
            <select :value="singleText.size" @change="setTextSize">
              <option v-for="choice in textSizeChoices" :key="choice.size" :value="choice.size">
                ×{{ choice.scale }}
              </option>
            </select>
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>Couleur</span>
            <input type="color" :value="singleText.color" @change="setTextColor" />
          </label>
          <div class="field">
            <span>Style</span>
            <div class="toggles">
              <button
                v-for="option in TEXT_STYLE_OPTIONS"
                :key="option.key"
                type="button"
                class="toggle"
                :class="{ active: singleText[option.key] }"
                :title="option.label"
                @click="toggleTextStyle(option)"
              >
                <Icon :name="option.icon" />
              </button>
            </div>
          </div>
        </div>
        <label class="check" title="Le texte est tourné de 90° et se lit de haut en bas">
          <input type="checkbox" :checked="singleText.vertical" @change="setTextVertical" />
          <span>Vertical</span>
        </label>
        <label class="check" title="Un fond de la couleur du papier masque ce qui passe derrière">
          <input type="checkbox" :checked="singleText.background" @change="setTextBackground" />
          <span>Fond</span>
        </label>
        <div class="row">
          <button type="button" class="with-icon" @click="store.duplicateSelection()">
            <Icon name="duplicate" /> Dupliquer
          </button>
        </div>
      </section>
      <section class="block">
        <h3>Position et taille</h3>
        <div class="row">
          <label v-for="side in BOX_FIELDS" :key="side.key" class="field">
            <span>{{ side.label }}</span>
            <input
              type="number"
              step="1"
              :min="side.key === 'w' || side.key === 'h' ? 1 : undefined"
              :value="singleText[side.key]"
              @change="setTextBox(side.key, $event)"
            />
          </label>
        </div>
      </section>
    </template>

    <section v-else class="block">
      <h3>{{ count }} éléments</h3>
      <div class="field">
        <span>Couleur</span>
        <div class="swatches">
          <button
            v-for="choice in store.colorChoices"
            :key="choice.hex"
            type="button"
            class="swatch"
            :style="{ background: choice.hex }"
            :title="choice.name"
            @click="store.setCurrentColor(choice.hex)"
          />
        </div>
      </div>
      <div class="row">
        <button type="button" class="with-icon" @click="store.duplicateSelection()">
          <Icon name="duplicate" /> Dupliquer
        </button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.inspector {
  width: 300px;
  flex: none;
  overflow-y: auto;
  background: var(--surface);
  border-left: 1px solid var(--border);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-soft);
}

.block {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
}

.block h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input,
.field select,
.field textarea {
  font: inherit;
  font-size: 13px;
  color: var(--text);
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}

.field textarea {
  resize: vertical;
}

.field input[type='range'] {
  padding: 0;
  border: 0;
}

.field input[type='color'] {
  padding: 0 2px;
  height: 28px;
  width: 56px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.row .field {
  flex: 1;
  min-width: 60px;
  margin-bottom: 0;
}

.row .field input[type='number'] {
  width: 100%;
  box-sizing: border-box;
}

/* Taille du texte d'un nœud : à côté des boutons de style, sans leur prendre la place. */
.row .field.scale {
  flex: 0 0 70px;
  min-width: 0;
}

/* Nom du diagramme et bouton d'export sur une seule ligne. */
.name-row {
  flex-wrap: nowrap;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 6px;
}

.toggles {
  display: flex;
  gap: 2px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  padding: 4px 6px;
}

.toggle.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.hint {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-word;
}

.path {
  word-break: break-all;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 2px;
}

.swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.current {
  box-shadow: 0 0 0 2px var(--accent);
}
</style>
