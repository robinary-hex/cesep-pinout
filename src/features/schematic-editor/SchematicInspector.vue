<script setup lang="ts">
import { computed } from 'vue'
import {
  componentFields,
  instanceBounds,
  ROTATIONS,
  segmentLength,
  type FreeEndStyle,
  type Rotation
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from './store'

// Panneau de droite du montage (replié par défaut, touche I) : projet, puis composant(s),
// fil(s) ou étiquette(s) sélectionné(s).

const emit = defineEmits<{ editProfile: [] }>()
const store = useSchematicStore()
const library = useLibraryStore()
const doc = computed(() => store.doc)

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
const showGroup = computed(
  () =>
    store.hasSelection &&
    !single.value &&
    !singleWire.value &&
    !wiresOnly.value &&
    !singleLabel.value
)
const rotatable = computed(() => store.selection.length > 0 && onlyInstances.value)

const swatches = computed(() => [
  ...library.palette.map((color) => ({ hex: color.hex, name: color.name })),
  ...library.customColors.map((hex) => ({ hex, name: hex }))
])

function wireLength(points: readonly [number, number][]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b) total += segmentLength(a, b)
  }
  return total
}

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

function setLabelText(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelText(label.id, inputValue(event))
}

function setLabelSize(event: Event): void {
  const label = singleLabel.value
  if (label) store.setLabelSize(label.id, Math.max(4, numberValue(event)))
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
        <span>Nom</span>
        <input type="text" :value="doc.name" @change="setName" />
      </label>
      <p class="hint">
        Profil « {{ doc.profile.name }} » : {{ doc.profile.cellPx }} px par cellule, fils de
        {{ doc.profile.wireWidth }} cellule, trait des composants {{ doc.profile.componentStroke }},
        rayon {{ doc.profile.cornerRadius }}, point de jonction ×{{ doc.profile.junctionScale }}.
      </p>
      <p class="hint">
        {{ doc.components.length }} composant(s), {{ doc.wires.length }} fil(s),
        {{ doc.labels.length }} étiquette(s), {{ doc.crossingOverrides.length }} exception(s) de
        croisement.
      </p>
      <p v-if="store.filePath" class="hint">Fichier : {{ store.filePath }}</p>
      <button type="button" class="small" @click="emit('editProfile')">Modifier le profil…</button>
    </section>

    <section v-if="single" class="block">
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
          <span>{{ field.name }}</span>
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
      <p class="hint">
        Boîte : {{ instanceBounds(single.instance, single.def).width }} ×
        {{ instanceBounds(single.instance, single.def).height }} cellules ·
        {{ single.def.pins.length }} broche(s) · définition « {{ single.def.id }} ».
      </p>
      <div v-if="libraryUpdate" class="notice">
        <p>La bibliothèque a une version plus récente de ce composant.</p>
        <button type="button" class="small" @click="store.updateDefinition(libraryUpdate)">
          Mettre à jour dans ce montage
        </button>
      </div>
      <div class="row">
        <button type="button" @click="store.rotate('ccw')">⟲</button>
        <button type="button" @click="store.rotate('cw')">⟳</button>
        <button type="button" @click="store.flip('horizontal')">↔</button>
        <button type="button" @click="store.flip('vertical')">↕</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
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
          <span>Extrémités libres à l’export</span>
          <select :value="singleWire.freeEnds" @change="setFreeEnds">
            <option value="flat">Nettes</option>
            <option value="arrow">Prolongées d’une flèche</option>
          </select>
        </label>
        <p class="hint">
          {{ singleWire.points.length - 1 }} segment(s), longueur
          {{ wireLength(singleWire.points) }} cellules, rang d’empilement {{ singleWire.stack }}.
          Glisse un segment pour le décaler, un sommet (cercle) pour le déplacer. Alt+clic sur un
          croisement inverse l’ordre à cet endroit seulement.
        </p>
      </template>
      <div class="row">
        <button type="button" title="Reculer" @click="store.reorderWires('down')">▽</button>
        <button type="button" title="Avancer" @click="store.reorderWires('up')">△</button>
        <button type="button" title="Arrière-plan" @click="store.reorderWires('bottom')">⤓</button>
        <button type="button" title="Premier plan" @click="store.reorderWires('top')">⤒</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
      </div>
    </section>

    <section v-else-if="singleLabel" class="block">
      <h3>Étiquette</h3>
      <label class="field">
        <span>Texte</span>
        <input type="text" :value="singleLabel.text" @change="setLabelText" />
      </label>
      <label class="field">
        <span>Taille (pt)</span>
        <input type="number" min="4" step="1" :value="singleLabel.size" @change="setLabelSize" />
      </label>
      <p class="hint">
        Position : ({{ singleLabel.x }}, {{ singleLabel.y }}). Glisse-la pour la déplacer.
      </p>
      <div class="row">
        <button type="button" @click="store.duplicateSelection()">Dupliquer</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
      </div>
    </section>

    <section v-else-if="showGroup" class="block">
      <h3>{{ mixedCount }} élément(s) sélectionné(s)</h3>
      <p class="hint">
        {{ store.selection.length }} composant(s), {{ store.selectedWires.length }} fil(s),
        {{ store.selectedLabels.length }} étiquette(s).
      </p>
      <div class="row">
        <button type="button" :disabled="!rotatable" @click="store.rotate('ccw')">⟲</button>
        <button type="button" :disabled="!rotatable" @click="store.rotate('cw')">⟳</button>
        <button type="button" :disabled="!rotatable" @click="store.flip('horizontal')">↔</button>
        <button type="button" :disabled="!rotatable" @click="store.flip('vertical')">↕</button>
        <button type="button" @click="store.duplicateSelection()">Dupliquer</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
      </div>
      <p v-if="!rotatable" class="hint">Rotation et miroir s’appliquent aux composants seuls.</p>
    </section>

    <section v-else class="block">
      <h3>Sélection</h3>
      <p class="hint">
        Clique un composant de la bibliothèque pour le poser, puis clique sur le montage. W trace un
        fil : départ sur une broche ou une intersection, un clic par coude (l’axe dominant d’abord,
        Maj inverse), double-clic ou Entrée pour finir ; finir sur une broche ou un fil crée la
        connexion. E pose une étiquette texte. Clic droit : menu contextuel ; double-clic sur un
        composant : sa valeur.
      </p>
      <p class="hint">
        Les fils posés sur les broches suivent les composants qu’on déplace, tourne ou retourne.
        Carrés rouges : extrémités de fil reliées à rien. Cercles rouges : broches reliées à rien.
        Survoler un fil éclaire tout son net. Alt+clic sur un croisement choisit le fil du dessus.
      </p>
    </section>
  </aside>
</template>

<style scoped>
.inspector {
  width: 300px;
  flex: none;
  overflow-y: auto;
  background: #ffffff;
  border-left: 1px solid #d0d7de;
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
  color: #57606a;
  border-bottom: 1px solid #eaeef2;
  background: #f6f8fa;
}

.block {
  padding: 12px 14px;
  border-bottom: 1px solid #eaeef2;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #57606a;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #57606a;
}

.field input,
.field select {
  font: inherit;
  font-size: 13px;
  color: #1f2328;
  padding: 4px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #ffffff;
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
  color: #57606a;
  padding-bottom: 6px;
}

.hint {
  margin: 4px 0;
  font-size: 12px;
  color: #57606a;
  word-break: break-word;
}

.notice {
  margin: 8px 0;
  padding: 8px;
  border: 1px solid #d4a72c;
  border-radius: 4px;
  background: #fff8c5;
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
  border: 2px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #d0d7de;
}

.swatch.current {
  box-shadow: 0 0 0 2px #1f6feb;
}

.custom {
  position: relative;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed #8c959f;
  font-size: 12px;
  color: #57606a;
  cursor: pointer;
}

.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
