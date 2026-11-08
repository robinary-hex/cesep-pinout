<script setup lang="ts">
import { computed } from 'vue'
import { componentFields, ROTATIONS, TEXT_SCALES, type FreeEndStyle, type Rotation } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import Icon from '@/ui/Icon.vue'
import { useSchematicStore } from './store'

// Panneau de droite du montage (replié par défaut, touche I). Toujours : le projet, avec
// enregistrer et exporter. Sans sélection : le profil et le contenu du montage. Avec une
// sélection : seulement les propriétés de l'élément (composant, fil(s), étiquette, groupe).

const emit = defineEmits<{ editProfile: []; save: []; exportImage: [] }>()
const store = useSchematicStore()
const library = useLibraryStore()
const doc = computed(() => store.doc)
const profile = computed(() => store.profile)

const onlyInstances = computed(
  () => store.selectedWires.length === 0 && store.selectedLabels.length === 0
)
const onlyWires = computed(() => store.selection.length === 0 && store.selectedLabels.length === 0)
const onlyLabels = computed(() => store.selection.length === 0 && store.selectedWires.length === 0)

const single = computed(() => {
  if (store.selection.length !== 1 || !onlyInstances.value) return null
  const id = store.selection[0]
  const instance = doc.value.components.find((candidate) => candidate.id === id)
  const def = instance ? doc.value.embeddedDefs[instance.defId] : undefined
  return instance && def ? { instance, def } : null
})

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
const rotatable = computed(() => store.selection.length > 0 && onlyInstances.value)

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

const swatches = computed(() => [
  ...library.palette.map((color) => ({ hex: color.hex, name: color.name })),
  ...library.customColors.map((hex) => ({ hex, name: hex }))
])

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

function setField(name: string, event: Event): void {
  const current = single.value
  if (current) store.setInstanceField(current.instance.id, name, inputValue(event))
}

function recolor(hex: string): void {
  store.setCurrentColor(hex)
}

function recolorCustom(event: Event): void {
  const hex = inputValue(event)
  store.setCurrentColor(hex)
  void library.rememberCustomColor(hex)
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

function setLabelBold(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelBold(label.id, (event.target as HTMLInputElement).checked)
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
      <label class="field">
        <span>Nom du montage</span>
        <input type="text" :value="doc.name" @change="setName" />
      </label>
      <div class="row">
        <button
          type="button"
          class="primary with-icon"
          title="Enregistrer (Ctrl+S)"
          @click="emit('save')"
        >
          <Icon name="save" /> Enregistrer
        </button>
        <button
          type="button"
          class="with-icon"
          title="Exporter en PNG ou SVG (Ctrl+E)"
          @click="emit('exportImage')"
        >
          <Icon name="export" /> Exporter…
        </button>
      </div>
      <p v-if="store.filePath" class="hint path">{{ store.filePath }}</p>
      <p v-else class="hint">Pas encore enregistré.</p>
    </section>

    <template v-if="!store.hasSelection">
      <section class="block">
        <h3>Profil de style</h3>
        <ul class="facts">
          <li>Profil « {{ profile.name }} »</li>
          <li>Cellule : {{ profile.cellPx }} px à l’écran</li>
          <li>Fils : {{ profile.wireWidth }} cellule, coins de rayon {{ profile.cornerRadius }}</li>
          <li>Trait des composants : {{ profile.componentStroke }} cellule</li>
          <li>
            Point de jonction : ×{{ profile.junctionScale }},
            {{
              profile.junctionColor === 'wire'
                ? 'couleur du fil porteur'
                : `couleur ${profile.junctionColor}`
            }}
          </li>
          <li>Repères : {{ profile.labelFont.family }} {{ profile.labelFont.size }} pt</li>
        </ul>
        <button type="button" class="small" @click="emit('editProfile')">
          Modifier le profil…
        </button>
      </section>

      <section class="block">
        <h3>Éléments</h3>
        <ul class="facts">
          <li v-for="line in inventory" :key="line">{{ line }}</li>
        </ul>
      </section>
    </template>

    <section v-else-if="single" class="block">
      <h3>{{ single.def.name }}</h3>
      <label class="field">
        <span>Repère</span>
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
        <p class="hint">Un champ vide reprend la valeur par défaut de la définition.</p>
      </template>
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
      <div v-if="libraryUpdate" class="notice">
        <p>La bibliothèque a une version plus récente de ce composant.</p>
        <button type="button" class="small" @click="store.updateDefinition(libraryUpdate)">
          Mettre à jour dans ce montage
        </button>
      </div>
      <div class="row">
        <button
          type="button"
          class="icon-only"
          title="Rotation antihoraire (Maj+R)"
          @click="store.rotate('ccw')"
        >
          <Icon name="rotate-ccw" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Rotation horaire (R)"
          @click="store.rotate('cw')"
        >
          <Icon name="rotate-cw" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Miroir horizontal (T)"
          @click="store.flip('horizontal')"
        >
          <Icon name="flip-h" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Miroir vertical (Maj+T)"
          @click="store.flip('vertical')"
        >
          <Icon name="flip-v" />
        </button>
        <button type="button" class="danger with-icon" @click="store.removeSelection()">
          <Icon name="trash" /> Supprimer
        </button>
      </div>
    </section>

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
          <label class="custom" title="Couleur personnalisée">
            <input
              type="color"
              :value="singleWire?.color ?? store.currentColor"
              @change="recolorCustom"
            />
            <span>+</span>
          </label>
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
      <div class="row">
        <button type="button" class="icon-only" title="Reculer" @click="store.reorderWires('down')">
          <Icon name="arrow-down" />
        </button>
        <button type="button" class="icon-only" title="Avancer" @click="store.reorderWires('up')">
          <Icon name="arrow-up" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Arrière-plan"
          @click="store.reorderWires('bottom')"
        >
          <Icon name="arrow-down-line" />
        </button>
        <button
          type="button"
          class="icon-only"
          title="Premier plan"
          @click="store.reorderWires('top')"
        >
          <Icon name="arrow-up-line" />
        </button>
        <button type="button" class="danger with-icon" @click="store.removeSelection()">
          <Icon name="trash" /> Supprimer
        </button>
      </div>
    </section>

    <section v-else-if="singleLabel" class="block">
      <h3>Étiquette</h3>
      <label class="field">
        <span>Texte</span>
        <input type="text" :value="singleLabel.text" @change="setLabelText" />
      </label>
      <div class="row">
        <label class="field">
          <span>Taille</span>
          <select :value="singleLabel.size" @change="setLabelSize">
            <option v-for="choice in labelSizeChoices" :key="choice.size" :value="choice.size">
              ×{{ choice.scale }}
            </option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" :checked="singleLabel.bold" @change="setLabelBold" />
          <span>Gras</span>
        </label>
      </div>
      <div class="row">
        <button type="button" class="with-icon" @click="store.duplicateSelection()">
          <Icon name="duplicate" /> Dupliquer
        </button>
        <button type="button" class="danger with-icon" @click="store.removeSelection()">
          <Icon name="trash" /> Supprimer
        </button>
      </div>
    </section>

    <section v-else class="block">
      <h3>{{ mixedCount }} élément(s) sélectionné(s)</h3>
      <p class="hint">
        {{ store.selection.length }} composant(s), {{ store.selectedWires.length }} fil(s),
        {{ store.selectedLabels.length }} étiquette(s).
      </p>
      <div class="row">
        <button
          type="button"
          class="icon-only"
          :disabled="!rotatable"
          title="Rotation antihoraire"
          @click="store.rotate('ccw')"
        >
          <Icon name="rotate-ccw" />
        </button>
        <button
          type="button"
          class="icon-only"
          :disabled="!rotatable"
          title="Rotation horaire"
          @click="store.rotate('cw')"
        >
          <Icon name="rotate-cw" />
        </button>
        <button
          type="button"
          class="icon-only"
          :disabled="!rotatable"
          title="Miroir horizontal"
          @click="store.flip('horizontal')"
        >
          <Icon name="flip-h" />
        </button>
        <button
          type="button"
          class="icon-only"
          :disabled="!rotatable"
          title="Miroir vertical"
          @click="store.flip('vertical')"
        >
          <Icon name="flip-v" />
        </button>
        <button type="button" class="with-icon" @click="store.duplicateSelection()">
          <Icon name="duplicate" /> Dupliquer
        </button>
        <button type="button" class="danger with-icon" @click="store.removeSelection()">
          <Icon name="trash" /> Supprimer
        </button>
      </div>
      <p v-if="!rotatable" class="hint">Rotation et miroir s’appliquent aux composants seuls.</p>
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
.field select {
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

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 6px;
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
  margin: 8px 0;
  padding: 8px;
  border: 1px solid var(--warning-border);
  border-radius: 4px;
  background: var(--warning-bg);
  font-size: 12px;
}

.notice p {
  margin: 0 0 6px;
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

.custom {
  position: relative;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed var(--text-faint);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
