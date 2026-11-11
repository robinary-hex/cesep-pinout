<script setup lang="ts">
import { computed } from 'vue'
import {
  BASE_VARIANT,
  componentVariants,
  hasVariants,
  instanceDefinition,
  componentFields,
  ROTATIONS,
  TEXT_SCALES,
  type FreeEndStyle,
  type ProfileFact,
  type Rotation,
  type StyleProfile,
  type TextAnchor
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ColorAdder from '@/ui/ColorAdder.vue'
import ColorField from '@/ui/ColorField.vue'
import Icon from '@/ui/Icon.vue'
import type { IconName } from '@/ui/icons'
import { useSchematicStore } from './store'

// Panneau de droite du montage (replié par défaut, touche I). Toujours : le projet, avec son nom
// et le bouton d'export. Sans sélection : le profil et le contenu du montage. Avec une
// sélection : seulement les propriétés de l'élément (composant, fil(s), étiquette, groupe). Le
// bloc « Profil de style » décrit le style propre à ce montage, modifiable d'ici ; les réglages
// où il s'écarte du profil général sont surlignés, avec un bouton pour l'y aligner.

const emit = defineEmits<{ editProfile: []; exportImage: [] }>()
const store = useSchematicStore()
const library = useLibraryStore()
const doc = computed(() => store.doc)
const profile = computed(() => store.profile)

/** Lignes du bloc « Profil de style » : un texte par groupe de réglages, pour n'importe quel profil. */
const FACT_TEXTS: { key: ProfileFact; text: (p: StyleProfile) => string }[] = [
  { key: 'name', text: (p) => `Profil « ${p.name} »` },
  { key: 'cell', text: (p) => `Cellule : ${p.cellPx} px à l’écran` },
  { key: 'wires', text: (p) => `Fils : ${p.wireWidth} cellule, coins de rayon ${p.cornerRadius}` },
  { key: 'componentStroke', text: (p) => `Trait des composants : ${p.componentStroke} cellule` },
  {
    key: 'junction',
    text: (p) =>
      `Point de jonction : ×${p.junctionScale}, ${
        p.junctionColor === 'wire' ? 'couleur du fil porteur' : `couleur ${p.junctionColor}`
      }`
  },
  { key: 'labels', text: (p) => `Libellés : ${p.labelFont.family} ${p.labelFont.size} pt` },
  {
    key: 'endLabels',
    text: (p) => `Étiquettes d’extrémité : ${p.endLabelFont.family} ${p.endLabelFont.size} pt`
  }
]

/** Le style du montage, ligne par ligne ; celles qui s'écartent du profil général sont marquées. */
const profileFacts = computed(() =>
  FACT_TEXTS.map((fact) => ({
    key: fact.key,
    text: fact.text(profile.value),
    general: fact.text(library.defaultProfile),
    differs: store.profileDiffs.includes(fact.key)
  }))
)

const onlyInstances = computed(
  () => store.selectedWires.length === 0 && store.selectedLabels.length === 0
)
const onlyWires = computed(() => store.selection.length === 0 && store.selectedLabels.length === 0)
const onlyLabels = computed(() => store.selection.length === 0 && store.selectedWires.length === 0)

const single = computed(() => {
  if (store.selection.length !== 1 || !onlyInstances.value) return null
  const id = store.selection[0]
  const instance = doc.value.components.find((candidate) => candidate.id === id)
  // Dans la variante que l'exemplaire montre : ses champs sont ceux de ce dessin-là.
  const def = instance ? instanceDefinition(doc.value, instance) : undefined
  return instance && def ? { instance, def } : null
})

/** Variantes du composant sélectionné, s'il en a plusieurs. */
const variants = computed(() =>
  single.value && hasVariants(single.value.def) ? componentVariants(single.value.def) : []
)

function setVariant(event: Event): void {
  if (!single.value) return
  store.setInstancesVariant([single.value.instance.id], (event.target as HTMLSelectElement).value)
}

const fields = computed(() => (single.value ? componentFields(single.value.def) : []))

/** Définition de la bibliothèque plus récente que la copie embarquée, s'il y en a une. */
const libraryUpdate = computed(() =>
  single.value ? store.newerLibraryDefinition(single.value.def.id) : null
)

const selectedWireList = computed(() =>
  doc.value.wires.filter((wire) => store.selectedWires.includes(wire.id))
)
const singleWire = computed(() =>
  onlyWires.value && selectedWireList.value.length === 1
    ? (selectedWireList.value[0] ?? null)
    : null
)
const wiresOnly = computed(() => onlyWires.value && selectedWireList.value.length > 1)

const selectedLabelList = computed(() =>
  doc.value.labels.filter((label) => store.selectedLabels.includes(label.id))
)
const singleLabel = computed(() =>
  onlyLabels.value && selectedLabelList.value.length === 1
    ? (selectedLabelList.value[0] ?? null)
    : null
)

const mixedCount = computed(
  () => store.selection.length + store.selectedWires.length + store.selectedLabels.length
)

/** Contenu du montage, pour le bloc « Éléments ». */
const inventory = computed(() => {
  const nets = new Set(store.connectivity.wireNet.values()).size
  const unconnected = store.connectivity.unconnectedPinKeys.size
  return [
    `${doc.value.components.length} composant(s)`,
    `${doc.value.wires.length} fil(s), ${nets} net(s)`,
    `${doc.value.labels.length} étiquette(s)`,
    `${store.connectivity.junctions.length} jonction(s), ${doc.value.crossingOverrides.length} exception(s) de croisement`,
    `${unconnected} broche(s) reliée(s) à rien`
  ]
})

const swatches = computed(() => store.colorChoices)

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function numberValue(event: Event): number {
  return Math.round(Number((event.target as HTMLInputElement).value))
}

function setName(event: Event): void {
  const name = inputValue(event).trim()
  if (name.length > 0) store.setProjectName(name)
}

function setPosition(axis: 'x' | 'y', event: Event): void {
  const current = single.value
  if (!current) return
  const value = numberValue(event)
  store.setInstancePosition(
    current.instance.id,
    axis === 'x' ? value : current.instance.x,
    axis === 'y' ? value : current.instance.y
  )
}

function setRotation(event: Event): void {
  const current = single.value
  if (!current) return
  store.setInstanceOrientation(
    current.instance.id,
    Number(inputValue(event)) as Rotation,
    current.instance.mirror
  )
}

function setMirror(event: Event): void {
  const current = single.value
  if (!current) return
  store.setInstanceOrientation(
    current.instance.id,
    current.instance.rotation,
    (event.target as HTMLInputElement).checked
  )
}

function setBehindWires(event: Event): void {
  const current = single.value
  if (!current) return
  store.setInstancesBehindWires([current.instance.id], (event.target as HTMLInputElement).checked)
}

function setField(name: string, event: Event): void {
  const current = single.value
  if (current) store.setInstanceField(current.instance.id, name, inputValue(event))
}

function recolor(hex: string): void {
  store.setCurrentColor(hex)
}

function recolorCustom(hex: string): void {
  store.addCustomColor(hex)
  store.setCurrentColor(hex)
}

function setFreeEnds(event: Event): void {
  const wire = singleWire.value
  if (wire) store.setWireFreeEnds(wire.id, inputValue(event) as FreeEndStyle)
}

function setEndLabel(endIndex: number, event: Event): void {
  const wire = singleWire.value
  if (wire) store.setWireEndLabel(wire.id, endIndex, inputValue(event))
}

function setLabelText(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelText(label.id, inputValue(event))
}

const BOX_FIELDS = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'w', label: 'Largeur' },
  { key: 'h', label: 'Hauteur' }
] as const

function setLabelAnchor(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelAnchor(label.id, inputValue(event) as TextAnchor)
}

function setLabelBox(key: 'x' | 'y' | 'w' | 'h', event: Event): void {
  const label = singleLabel.value
  if (!label) return
  const value = numberValue(event)
  if (!Number.isFinite(value)) return
  store.setLabelBox(label.id, { x: label.x, y: label.y, w: label.w, h: label.h, [key]: value })
}

/** Tailles proposées : multiples de la taille des repères du profil, plus la taille actuelle. */
const labelSizeChoices = computed(() => {
  const base = profile.value.labelFont.size
  const list: { scale: number; size: number }[] = TEXT_SCALES.map((scale) => ({
    scale,
    size: base * scale
  }))
  const current = singleLabel.value?.size
  if (current !== undefined && !list.some((choice) => Math.abs(choice.size - current) < 1e-6)) {
    list.push({ scale: Math.round((current / base) * 100) / 100, size: current })
  }
  return list.sort((a, b) => a.size - b.size)
})

function setLabelSize(event: Event): void {
  const label = singleLabel.value
  const size = Number(inputValue(event))
  if (label && Number.isFinite(size)) store.setLabelSize(label.id, Math.max(4, size))
}

type LabelStyleKey = 'bold' | 'italic' | 'underline' | 'strike'

/** Styles de texte, un bouton à pictogramme chacun ; `label` sert d'infobulle et de libellé d'annulation. */
const LABEL_STYLE_OPTIONS: { key: LabelStyleKey; label: string; icon: IconName }[] = [
  { key: 'bold', label: 'Gras', icon: 'bold' },
  { key: 'italic', label: 'Italique', icon: 'italic' },
  { key: 'underline', label: 'Souligné', icon: 'underline' },
  { key: 'strike', label: 'Barré', icon: 'strikethrough' }
]

function toggleLabelStyle(option: (typeof LABEL_STYLE_OPTIONS)[number]): void {
  const label = singleLabel.value
  if (!label) return
  const on = !label[option.key]
  store.setLabelStyle(label.id, `${option.label} ${on ? 'activé' : 'retiré'}`, {
    [option.key]: on
  })
}

function setLabelColor(color: string): void {
  const label = singleLabel.value
  if (label) store.setLabelStyle(label.id, 'Couleur de l’étiquette', { color })
}

function setLabelBackground(event: Event): void {
  const label = singleLabel.value
  if (!label) return
  const background = (event.target as HTMLInputElement).checked
  store.setLabelStyle(label.id, background ? 'Fond de l’étiquette' : 'Étiquette sans fond', {
    background
  })
}

function setLabelVertical(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelVertical(label.id, (event.target as HTMLInputElement).checked)
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
      <h3>Projet</h3>
      <div class="row name-row">
        <label class="field">
          <span>Nom du montage</span>
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

    <template v-if="!store.hasSelection">
      <section class="block">
        <h3>Profil de style</h3>
        <ul class="facts">
          <li
            v-for="fact in profileFacts"
            :key="fact.key"
            :class="{ differs: fact.differs }"
            :title="fact.differs ? `Profil général — ${fact.general}` : undefined"
          >
            {{ fact.text }}
          </li>
        </ul>
        <div class="row profile-actions">
          <button
            type="button"
            class="small with-icon"
            title="Modifier le style de ce montage seulement"
            @click="emit('editProfile')"
          >
            <Icon name="brush" :size="13" /> Modifier le style…
          </button>
          <button
            v-if="store.profileDiffs.length > 0"
            type="button"
            class="small with-icon"
            title="Rétablit le profil de style général pour ce montage (annulable)"
            @click="store.adoptGeneralProfile()"
          >
            <Icon name="refresh" :size="13" /> Réinitialiser
          </button>
        </div>
      </section>

      <section class="block">
        <h3>Éléments</h3>
        <ul class="facts">
          <li v-for="line in inventory" :key="line">{{ line }}</li>
        </ul>
      </section>
    </template>

    <template v-else-if="single">
      <section class="block">
        <h3>{{ single.def.name }}</h3>
        <label v-if="variants.length > 0" class="field">
          <span>Variante</span>
          <select :value="single.instance.variant ?? BASE_VARIANT" @change="setVariant">
            <option v-for="variant in variants" :key="variant.id" :value="variant.id">
              {{ variant.name }}
            </option>
          </select>
        </label>
        <div v-if="libraryUpdate" class="notice">
          <Icon name="refresh" :size="16" class="notice-icon" />
          <div class="notice-body">
            <strong>Version plus récente dans la bibliothèque</strong>
            <button
              type="button"
              class="primary small with-icon"
              @click="store.updateDefinition(libraryUpdate)"
            >
              <Icon name="refresh" :size="13" /> Mettre à jour dans ce montage
            </button>
          </div>
        </div>
        <label class="field">
          <span>Libellé</span>
          <input
            type="text"
            :value="single.instance.label"
            placeholder="R1, U2…"
            @change="store.setInstanceLabel(single.instance.id, inputValue($event).trim())"
          />
        </label>
        <template v-if="fields.length > 0">
          <label v-for="field in fields" :key="field.name" class="field">
            <span>{{ field.name }}{{ field.unit.length > 0 ? ` (${field.unit})` : '' }}</span>
            <input
              type="text"
              :value="single.instance.fields[field.name] ?? ''"
              :placeholder="field.defaultValue.length > 0 ? field.defaultValue : '(vide)'"
              @change="setField(field.name, $event)"
            />
          </label>
        </template>
      </section>
      <section class="block">
        <h3>Position et orientation</h3>
        <div class="row">
          <label class="field">
            <span>X (cellules)</span>
            <input
              type="number"
              step="1"
              :value="single.instance.x"
              @change="setPosition('x', $event)"
            />
          </label>
          <label class="field">
            <span>Y (cellules)</span>
            <input
              type="number"
              step="1"
              :value="single.instance.y"
              @change="setPosition('y', $event)"
            />
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>Rotation</span>
            <select :value="single.instance.rotation" @change="setRotation">
              <option v-for="rotation in ROTATIONS" :key="rotation" :value="rotation">
                {{ rotation }}°
              </option>
            </select>
          </label>
          <label class="check">
            <input type="checkbox" :checked="single.instance.mirror" @change="setMirror" />
            <span>Miroir</span>
          </label>
        </div>
        <label
          class="check"
          title="Le composant se dessine sous les fils, qui restent visibles sur lui"
        >
          <input type="checkbox" :checked="single.instance.behindWires" @change="setBehindWires" />
          <span>Derrière les fils</span>
        </label>
      </section>
    </template>

    <section v-else-if="singleWire || wiresOnly" class="block">
      <h3>{{ singleWire ? 'Fil' : `${selectedWireList.length} fils` }}</h3>
      <div class="field">
        <span>Couleur</span>
        <div class="swatches">
          <button
            v-for="swatch in swatches"
            :key="swatch.hex"
            type="button"
            class="swatch"
            :class="{
              current: singleWire && singleWire.color.toLowerCase() === swatch.hex.toLowerCase()
            }"
            :style="{ background: swatch.hex }"
            :title="swatch.name"
            @click="recolor(swatch.hex)"
          />
          <ColorAdder
            :value="singleWire?.color ?? store.currentColor"
            title="Couleur personnalisée, gardée dans ce montage"
            @pick="recolorCustom"
          />
        </div>
      </div>
      <template v-if="singleWire">
        <label class="field">
          <span>Extrémités libres</span>
          <select :value="singleWire.freeEnds" @change="setFreeEnds">
            <option value="flat">Nettes</option>
            <option value="arrow">En flèche</option>
            <option value="dotted">En pointillés</option>
          </select>
        </label>
        <div class="row">
          <label class="field">
            <span>Étiquette au départ</span>
            <input
              type="text"
              :value="singleWire.endLabels.start"
              placeholder="VCC"
              @change="setEndLabel(0, $event)"
            />
          </label>
          <label class="field">
            <span>Étiquette à l’arrivée</span>
            <input
              type="text"
              :value="singleWire.endLabels.end"
              placeholder="vers J3"
              @change="setEndLabel(singleWire.points.length - 1, $event)"
            />
          </label>
        </div>
      </template>
    </section>

    <template v-else-if="singleLabel">
      <section class="block">
        <h3>Étiquette</h3>
        <label class="field">
          <span>Texte</span>
          <textarea rows="3" :value="singleLabel.text" @change="setLabelText" />
        </label>
        <div class="row">
          <label class="field">
            <span>Alignement</span>
            <select :value="singleLabel.anchor" @change="setLabelAnchor">
              <option value="start">Gauche</option>
              <option value="middle">Centre</option>
              <option value="end">Droite</option>
            </select>
          </label>
          <label class="field">
            <span>Taille</span>
            <select :value="singleLabel.size" @change="setLabelSize">
              <option v-for="choice in labelSizeChoices" :key="choice.size" :value="choice.size">
                ×{{ choice.scale }}
              </option>
            </select>
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>Couleur</span>
            <ColorField :value="singleLabel.color" @change="setLabelColor" />
          </label>
          <div class="field">
            <span>Style</span>
            <div class="toggles">
              <button
                v-for="option in LABEL_STYLE_OPTIONS"
                :key="option.key"
                type="button"
                class="toggle"
                :class="{ active: singleLabel[option.key] }"
                :title="option.label"
                @click="toggleLabelStyle(option)"
              >
                <Icon :name="option.icon" />
              </button>
            </div>
          </div>
        </div>
        <label class="check" title="Le texte est tourné de 90° et se lit de haut en bas">
          <input type="checkbox" :checked="singleLabel.vertical" @change="setLabelVertical" />
          <span>Vertical</span>
        </label>
        <label class="check" title="Un fond de la couleur du papier masque ce qui passe derrière">
          <input type="checkbox" :checked="singleLabel.background" @change="setLabelBackground" />
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
              :value="singleLabel[side.key]"
              @change="setLabelBox(side.key, $event)"
            />
          </label>
        </div>
      </section>
    </template>

    <section v-else class="block">
      <h3>{{ mixedCount }} élément(s) sélectionné(s)</h3>
      <p class="hint">
        {{ store.selection.length }} composant(s), {{ store.selectedWires.length }} fil(s),
        {{ store.selectedLabels.length }} étiquette(s).
      </p>
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
  padding: 6px 8px 6px 14px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface-2);
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

.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.row .field {
  flex: 1;
  min-width: 90px;
  margin-bottom: 0;
}

/* Nom du montage et bouton d'export sur une seule ligne. */
.name-row {
  flex-wrap: nowrap;
}

.name-row button {
  flex: none;
  padding: 6px;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 6px;
}

/* Styles de texte : un bouton à pictogramme par style, allumé quand il est actif. */
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

.facts {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-muted);
}

.facts li {
  margin: 2px 0;
}

/* Les boutons du style, un peu sous la liste pour ne pas la toucher. */
.profile-actions {
  margin-top: 12px;
}

/* Réglage qui s'écarte du profil général : rouge en clair, ambre en sombre. */
.facts li.differs {
  color: var(--alert);
  font-weight: 600;
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

.notice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0 0 10px;
  padding: 10px;
  border: 1px solid var(--warning-border);
  border-radius: 6px;
  background: var(--warning-bg);
  font-size: 12px;
}

.notice-icon {
  flex: none;
  margin-top: 1px;
  color: var(--warning-text);
}

.notice-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.notice-body strong {
  color: var(--text);
}

.notice-body button {
  align-self: flex-start;
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

/* Le « + » des couleurs personnalisées a la taille des pastilles du panneau. */
.swatches {
  --color-adder-size: 20px;
}
</style>
