<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  fitPngToCells,
  PIN_KIND_LABELS,
  PIN_KINDS,
  STROKE_WEIGHTS,
  strokeWidthCells,
  type PinKind,
  type PngFit
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { pickPng, resizePng } from './pngImport'
import { useComponentEditorStore } from './store'

// Panneau de droite : propriétés du composant, liste des broches, forme sélectionnée, contrôles.
// Les champs valident au changement (pas à chaque touche), donc une modification = une commande.

const store = useComponentEditorStore()
const library = useLibraryStore()
const doc = computed(() => store.doc)
const strokeBase = computed(() => library.defaultProfile.componentStroke)

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function numberValue(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function setName(event: Event): void {
  const name = inputValue(event).trim()
  if (name.length === 0) {
    store.status = 'Le nom ne peut pas être vide.'
    return
  }
  store.setMeta({ name })
}

function setSize(axis: 'widthCells' | 'heightCells', event: Event): void {
  const value = Math.max(1, Math.round(numberValue(event)))
  store.setSize({ ...doc.value.size, [axis]: value })
}

// Import d'un PNG

const pending = ref<{ dataUrl: string; width: number; height: number; fit: PngFit } | null>(null)
const importError = ref('')

async function importPng(): Promise<void> {
  importError.value = ''
  pending.value = null
  try {
    const picked = await pickPng()
    if (!picked) return
    const fit = fitPngToCells(picked.width, picked.height)
    if (fit.exact) {
      store.setVisualPng(picked.dataUrl, fit)
      return
    }
    pending.value = { dataUrl: picked.dataUrl, width: picked.width, height: picked.height, fit }
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error)
  }
}

async function acceptResize(): Promise<void> {
  const current = pending.value
  if (!current) return
  try {
    const resized = await resizePng(
      current.dataUrl,
      current.fit.targetWidth,
      current.fit.targetHeight
    )
    store.setVisualPng(resized, current.fit)
    pending.value = null
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error)
  }
}

// Broches

const selectedPinId = computed(() => (store.selection?.kind === 'pin' ? store.selection.id : null))

function selectPin(id: string): void {
  store.selection = { kind: 'pin', id }
}

function setPinName(id: string, event: Event): void {
  const name = inputValue(event).trim()
  if (name.length === 0) {
    store.status = 'Le nom de la broche ne peut pas être vide.'
    return
  }
  store.updatePin(id, { name })
}

function setPinKind(id: string, event: Event): void {
  store.updatePin(id, { kind: inputValue(event) as PinKind })
}

// Forme sélectionnée

const primitive = computed(() => store.selectedPrimitive)
const primitiveIndex = computed(() =>
  store.selection?.kind === 'primitive' ? store.selection.index : -1
)
const shapeStyle = computed(() =>
  primitive.value && primitive.value.kind !== 'text' ? primitive.value.style : null
)
const weightChoices = computed(() => {
  const current = shapeStyle.value?.weight
  const list: number[] = [...STROKE_WEIGHTS]
  if (current !== undefined && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
})

const KIND_LABELS: Record<string, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Ligne',
  polyline: 'Polyligne',
  text: 'Texte'
}

function setStroke(event: Event): void {
  store.updateStyle(primitiveIndex.value, { stroke: inputValue(event) })
}

function toggleStroke(event: Event): void {
  store.updateStyle(primitiveIndex.value, { stroke: checked(event) ? 'none' : '#000000' })
}

function setWeight(event: Event): void {
  store.updateStyle(primitiveIndex.value, { weight: Math.max(0, numberValue(event)) })
}

function setFill(event: Event): void {
  store.updateStyle(primitiveIndex.value, { fill: inputValue(event) })
}

function toggleFill(event: Event): void {
  store.updateStyle(primitiveIndex.value, { fill: checked(event) ? 'none' : '#ffffff' })
}

function setArrow(end: 'start' | 'end', event: Event): void {
  const on = checked(event)
  store.updatePrimitive(
    primitiveIndex.value,
    on ? 'Ajouter une flèche' : 'Retirer la flèche',
    (p) => {
      if (p.kind === 'line' || p.kind === 'polyline') p.arrows[end] = on
    }
  )
}

function setText(event: Event): void {
  const text = inputValue(event)
  store.updatePrimitive(primitiveIndex.value, 'Modifier le texte', (p) => {
    if (p.kind === 'text') p.text = text
  })
}

function setVariable(event: Event): void {
  const variable = checked(event)
  store.updatePrimitive(primitiveIndex.value, variable ? 'Texte variable' : 'Texte fixe', (p) => {
    if (p.kind !== 'text') return
    if (variable && !p.variable) {
      // Le texte saisi devient la valeur par défaut ; le nom du champ reste à donner.
      p.defaultValue = p.text
      p.text = 'valeur'
    } else if (!variable && p.variable) {
      p.text = p.defaultValue.length > 0 ? p.defaultValue : p.text
      p.defaultValue = ''
    }
    p.variable = variable
  })
}

function setDefaultValue(event: Event): void {
  const value = inputValue(event)
  store.updatePrimitive(primitiveIndex.value, 'Valeur par défaut', (p) => {
    if (p.kind === 'text') p.defaultValue = value
  })
}

function setTextSize(event: Event): void {
  const size = Math.max(0.1, numberValue(event))
  store.updatePrimitive(primitiveIndex.value, 'Taille du texte', (p) => {
    if (p.kind === 'text') p.size = size
  })
}

function setTextAnchor(event: Event): void {
  const anchor = inputValue(event) as 'start' | 'middle' | 'end'
  store.updatePrimitive(primitiveIndex.value, 'Alignement du texte', (p) => {
    if (p.kind === 'text') p.anchor = anchor
  })
}

function setTextColor(event: Event): void {
  const color = inputValue(event)
  store.updatePrimitive(primitiveIndex.value, 'Couleur du texte', (p) => {
    if (p.kind === 'text') p.color = color
  })
}

function setRectRadius(event: Event): void {
  const rx = Math.max(0, Math.round(numberValue(event)))
  store.updatePrimitive(primitiveIndex.value, 'Arrondi du rectangle', (p) => {
    if (p.kind === 'rect') p.rx = rx
  })
}

function setClosed(event: Event): void {
  const closed = checked(event)
  store.updatePrimitive(
    primitiveIndex.value,
    closed ? 'Fermer la polyligne' : 'Ouvrir la polyligne',
    (p) => {
      if (p.kind === 'polyline') p.closed = closed
    }
  )
}
</script>

<template>
  <aside class="inspector">
    <section class="block">
      <h3>Composant</h3>
      <label class="field">
        <span>Nom</span>
        <input type="text" :value="doc.name" @change="setName" />
      </label>
      <label class="field">
        <span>Catégorie</span>
        <input
          type="text"
          :value="doc.category"
          @change="store.setMeta({ category: inputValue($event) })"
        />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea
          rows="2"
          :value="doc.description"
          @change="store.setMeta({ description: inputValue($event) })"
        />
      </label>
      <div class="row">
        <label class="field">
          <span>Largeur (cellules)</span>
          <input
            type="number"
            min="1"
            step="1"
            :value="doc.size.widthCells"
            @change="setSize('widthCells', $event)"
          />
        </label>
        <label class="field">
          <span>Hauteur (cellules)</span>
          <input
            type="number"
            min="1"
            step="1"
            :value="doc.size.heightCells"
            @change="setSize('heightCells', $event)"
          />
        </label>
      </div>
      <p v-if="store.folder" class="hint">Dossier : {{ store.folder }}</p>
      <p v-else class="hint">Pas encore enregistré ; l’identifiant sera dérivé du nom.</p>
    </section>

    <section class="block">
      <h3>Broches</h3>
      <p v-if="doc.pins.length === 0" class="hint">
        Aucune broche. Outil Broche (B), puis clic sur une intersection du bord.
      </p>
      <div
        v-for="(pin, index) in doc.pins"
        :key="pin.id"
        class="pin-row"
        :class="{ selected: selectedPinId === pin.id }"
        @pointerenter="store.hoverPinId = pin.id"
        @pointerleave="store.hoverPinId = null"
        @click="selectPin(pin.id)"
      >
        <span class="ordinal">{{ index + 1 }}</span>
        <input
          type="text"
          :value="pin.name"
          title="Nom de la broche"
          @change="setPinName(pin.id, $event)"
        />
        <select :value="pin.kind" title="Type" @change="setPinKind(pin.id, $event)">
          <option v-for="kind in PIN_KINDS" :key="kind" :value="kind">
            {{ PIN_KIND_LABELS[kind] }}
          </option>
        </select>
        <button
          type="button"
          class="small danger"
          title="Supprimer la broche"
          @click.stop="store.removePin(pin.id)"
        >
          ✕
        </button>
      </div>
      <p v-if="doc.pins.length > 0" class="hint">
        Les noms numériques suivent l’ordre ; glisse une broche le long du bord pour la déplacer.
      </p>
    </section>

    <section class="block">
      <h3>Visuel</h3>
      <p v-if="doc.visual.kind === 'drawing'">
        Dessin : {{ doc.visual.primitives.length }} forme(s), trait de base {{ strokeBase }} cellule
        (profil de style).
      </p>
      <p v-else>Image PNG à {{ doc.visual.pxPerCell }} px par cellule.</p>
      <div class="row">
        <button type="button" @click="importPng">Importer un PNG…</button>
        <button v-if="doc.visual.kind === 'png'" type="button" @click="store.setVisualDrawing()">
          Revenir au dessin
        </button>
      </div>
      <div v-if="pending" class="notice">
        <p>
          Le PNG fait {{ pending.width }} × {{ pending.height }} px, soit
          {{ (pending.width / 80).toFixed(2) }} × {{ (pending.height / 80).toFixed(2) }} cellules.
          Le redimensionner en {{ pending.fit.targetWidth }} × {{ pending.fit.targetHeight }} px ({{
            pending.fit.widthCells
          }}
          × {{ pending.fit.heightCells }} cellules) ?
        </p>
        <div class="row">
          <button type="button" class="primary" @click="acceptResize">Redimensionner</button>
          <button type="button" @click="pending = null">Annuler</button>
        </div>
      </div>
      <p v-if="importError" class="error">{{ importError }}</p>
    </section>

    <section v-if="primitive" class="block">
      <h3>{{ KIND_LABELS[primitive.kind] }}</h3>

      <template v-if="primitive.kind === 'text'">
        <label class="check">
          <input type="checkbox" :checked="primitive.variable" @change="setVariable" />
          <span>Texte variable (valeur propre à chaque composant posé)</span>
        </label>
        <label class="field">
          <span>{{ primitive.variable ? 'Nom du champ' : 'Texte' }}</span>
          <input type="text" :value="primitive.text" @change="setText" />
        </label>
        <label v-if="primitive.variable" class="field">
          <span>Valeur par défaut</span>
          <input
            type="text"
            :value="primitive.defaultValue"
            placeholder="10 kΩ"
            @change="setDefaultValue"
          />
        </label>
        <div class="row">
          <label class="field">
            <span>Hauteur (cellules)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              :value="primitive.size"
              @change="setTextSize"
            />
          </label>
          <label class="field">
            <span>Alignement</span>
            <select :value="primitive.anchor" @change="setTextAnchor">
              <option value="start">Gauche</option>
              <option value="middle">Centre</option>
              <option value="end">Droite</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Couleur</span>
          <input type="color" :value="primitive.color" @change="setTextColor" />
        </label>
      </template>

      <template v-else-if="shapeStyle">
        <div class="row">
          <label class="field">
            <span>Trait</span>
            <input
              type="color"
              :value="shapeStyle.stroke === 'none' ? '#000000' : shapeStyle.stroke"
              :disabled="shapeStyle.stroke === 'none'"
              @change="setStroke"
            />
          </label>
          <label class="check">
            <input type="checkbox" :checked="shapeStyle.stroke === 'none'" @change="toggleStroke" />
            <span>Sans trait</span>
          </label>
        </div>
        <label class="field">
          <span
            >Épaisseur (× trait de base =
            {{ strokeWidthCells(shapeStyle, strokeBase).toFixed(2) }} cellule)</span
          >
          <select :value="shapeStyle.weight" @change="setWeight">
            <option v-for="weight in weightChoices" :key="weight" :value="weight">
              ×{{ weight
              }}{{
                weight === 0.5
                  ? ' (fin)'
                  : weight === 1
                    ? ' (normal)'
                    : weight === 2
                      ? ' (gras)'
                      : ''
              }}
            </option>
          </select>
        </label>
        <div class="row">
          <label class="field">
            <span>Remplissage</span>
            <input
              type="color"
              :value="shapeStyle.fill === 'none' ? '#ffffff' : shapeStyle.fill"
              :disabled="shapeStyle.fill === 'none'"
              @change="setFill"
            />
          </label>
          <label class="check">
            <input type="checkbox" :checked="shapeStyle.fill === 'none'" @change="toggleFill" />
            <span>Sans remplissage</span>
          </label>
        </div>
        <template
          v-if="primitive.kind === 'line' || (primitive.kind === 'polyline' && !primitive.closed)"
        >
          <div class="row">
            <label class="check">
              <input
                type="checkbox"
                :checked="primitive.arrows.start"
                @change="setArrow('start', $event)"
              />
              <span>Flèche au début</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                :checked="primitive.arrows.end"
                @change="setArrow('end', $event)"
              />
              <span>Flèche à la fin</span>
            </label>
          </div>
        </template>
        <label v-if="primitive.kind === 'rect'" class="field">
          <span>Arrondi des coins (quarts de cellule)</span>
          <input type="number" min="0" step="1" :value="primitive.rx" @change="setRectRadius" />
        </label>
        <label v-if="primitive.kind === 'polyline'" class="check">
          <input type="checkbox" :checked="primitive.closed" @change="setClosed" />
          <span>Fermée (polygone)</span>
        </label>
        <p class="hint">
          Poignées sur la forme pour la redimensionner ; Ctrl+glisser saisit la poignée la plus
          proche.
        </p>
      </template>

      <button type="button" class="danger" @click="store.removePrimitive(primitiveIndex)">
        Supprimer la forme
      </button>
    </section>

    <section class="block">
      <h3>Contrôles</h3>
      <p v-if="store.issues.length === 0" class="ok">Aucun problème.</p>
      <ul v-else class="issues">
        <li v-for="(issue, i) in store.issues" :key="i" :class="issue.level">
          {{ issue.message }}
        </li>
      </ul>
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
.field select,
.field textarea {
  font: inherit;
  font-size: 13px;
  color: #1f2328;
  padding: 4px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #ffffff;
}

.field input[type='color'] {
  padding: 0 2px;
  height: 28px;
  width: 56px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.row .field {
  flex: 1;
  min-width: 90px;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #57606a;
}

.pin-row {
  display: grid;
  grid-template-columns: 22px 1fr 1fr 28px;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  margin: 0 -4px;
  border-radius: 4px;
  cursor: pointer;
}

.pin-row:hover {
  background: #f0f3f6;
}

.pin-row.selected {
  background: #ddf4ff;
}

.pin-row .ordinal {
  font-size: 12px;
  font-weight: 600;
  color: #57606a;
  text-align: right;
}

.pin-row input,
.pin-row select {
  font: inherit;
  font-size: 12px;
  min-width: 0;
  padding: 3px 5px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #ffffff;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #57606a;
  word-break: break-all;
}

.notice {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #d4a72c;
  border-radius: 4px;
  background: #fff8c5;
  font-size: 12px;
}

.notice p {
  margin: 0 0 8px;
}

.error {
  color: #a40e26;
  font-size: 12px;
}

.ok {
  margin: 0;
  color: #1a7f37;
  font-size: 12px;
}

.issues {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}

.issues .error {
  color: #a40e26;
}

.issues .warning {
  color: #9a6700;
}
</style>
