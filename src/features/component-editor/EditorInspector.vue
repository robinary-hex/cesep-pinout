<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  fitPngToCells,
  PIN_KIND_LABELS,
  PIN_KINDS,
  STROKE_WEIGHTS,
  TEXT_BASE_SIZE_CELLS,
  TEXT_SCALES,
  type Arrows,
  type PinKind,
  type PngFit
} from '@/domain'
import Icon from '@/ui/Icon.vue'
import { pickPng, resizePng } from './pngImport'
import { useComponentEditorStore } from './store'

// Panneau de droite. Sans sélection : le composant (propriétés, broches, visuel). Avec une
// sélection : seulement l'élément sélectionné (forme, formes, broche). Les contrôles restent en bas.
// Les champs valident au changement (pas à chaque touche), donc une modification = une commande.

const store = useComponentEditorStore()
const doc = computed(() => store.doc)

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

const selectedPin = computed(() => store.selectedPin)
const selectedPinOrdinal = computed(() =>
  selectedPin.value ? doc.value.pins.findIndex((pin) => pin.id === selectedPin.value?.id) + 1 : 0
)

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

// Forme(s) sélectionnée(s)

const primitive = computed(() => store.selectedPrimitive)
const primitiveIndex = computed(() => store.selectedIndexes[0] ?? -1)
const multiCount = computed(() => store.selectedIndexes.length)
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

function setArrow(end: keyof Arrows, event: Event): void {
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

function setUnit(event: Event): void {
  const unit = inputValue(event).trim()
  store.updatePrimitive(primitiveIndex.value, 'Unité du texte', (p) => {
    if (p.kind === 'text') p.unit = unit
  })
}

/** Tailles proposées : multiples de la hauteur de référence, plus la taille actuelle si elle diffère. */
const textSizeChoices = computed(() => {
  const list: { scale: number; size: number }[] = TEXT_SCALES.map((scale) => ({
    scale,
    size: TEXT_BASE_SIZE_CELLS * scale
  }))
  const current = primitive.value?.kind === 'text' ? primitive.value.size : undefined
  if (current !== undefined && !list.some((choice) => Math.abs(choice.size - current) < 1e-9)) {
    list.push({ scale: Math.round((current / TEXT_BASE_SIZE_CELLS) * 100) / 100, size: current })
  }
  return list.sort((a, b) => a.size - b.size)
})

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

function setBold(event: Event): void {
  const bold = checked(event)
  store.updatePrimitive(primitiveIndex.value, bold ? 'Texte en gras' : 'Texte normal', (p) => {
    if (p.kind === 'text') p.bold = bold
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
    <!-- Une forme seule -->
    <section v-if="primitive" class="block">
      <div class="head-row">
        <h3>{{ KIND_LABELS[primitive.kind] }}</h3>
        <button
          type="button"
          class="small"
          title="Revenir au composant (Échap)"
          @click="store.selection = null"
        >
          <Icon name="chevron-down" :size="12" /> Composant
        </button>
      </div>

      <template v-if="primitive.kind === 'text'">
        <label class="check">
          <input type="checkbox" :checked="primitive.variable" @change="setVariable" />
          <span>Texte variable (valeur propre à chaque composant posé)</span>
        </label>
        <label class="field">
          <span>{{ primitive.variable ? 'Nom du champ' : 'Texte' }}</span>
          <input v-if="primitive.variable" type="text" :value="primitive.text" @change="setText" />
          <textarea v-else rows="3" :value="primitive.text" @change="setText" />
        </label>
        <template v-if="primitive.variable">
          <div class="row">
            <label class="field">
              <span>Valeur par défaut</span>
              <input
                type="text"
                :value="primitive.defaultValue"
                placeholder="4,7"
                @change="setDefaultValue"
              />
            </label>
            <label class="field">
              <span>Unité (à droite)</span>
              <input type="text" :value="primitive.unit" placeholder="kΩ" @change="setUnit" />
            </label>
          </div>
        </template>
        <div class="row">
          <label class="field">
            <span>Taille</span>
            <select :value="primitive.size" @change="setTextSize">
              <option v-for="choice in textSizeChoices" :key="choice.size" :value="choice.size">
                ×{{ choice.scale }}
              </option>
            </select>
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
        <div class="row">
          <label class="field">
            <span>Couleur</span>
            <input type="color" :value="primitive.color" @change="setTextColor" />
          </label>
          <label class="check">
            <input type="checkbox" :checked="primitive.bold" @change="setBold" />
            <span>Gras</span>
          </label>
        </div>
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
          <span>Épaisseur</span>
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
        <div
          v-if="primitive.kind === 'line' || (primitive.kind === 'polyline' && !primitive.closed)"
          class="field"
        >
          <span>Flèche</span>
          <div class="row">
            <label class="check">
              <input
                type="checkbox"
                :checked="primitive.arrows.start"
                @change="setArrow('start', $event)"
              />
              <span>Début</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                :checked="primitive.arrows.middle"
                @change="setArrow('middle', $event)"
              />
              <span>Centre</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                :checked="primitive.arrows.end"
                @change="setArrow('end', $event)"
              />
              <span>Fin</span>
            </label>
          </div>
        </div>
        <label v-if="primitive.kind === 'rect'" class="field">
          <span>Arrondi des coins (quarts de cellule)</span>
          <input type="number" min="0" step="1" :value="primitive.rx" @change="setRectRadius" />
        </label>
        <label v-if="primitive.kind === 'polyline'" class="check">
          <input type="checkbox" :checked="primitive.closed" @change="setClosed" />
          <span>Fermée (polygone)</span>
        </label>
      </template>

      <button type="button" class="danger with-icon" @click="store.removeSelection()">
        <Icon name="trash" /> Supprimer la forme
      </button>
    </section>

    <!-- Plusieurs formes -->
    <section v-else-if="multiCount > 1" class="block">
      <div class="head-row">
        <h3>{{ multiCount }} formes sélectionnées</h3>
        <button
          type="button"
          class="small"
          title="Revenir au composant (Échap)"
          @click="store.selection = null"
        >
          <Icon name="chevron-down" :size="12" /> Composant
        </button>
      </div>
      <button type="button" class="danger with-icon" @click="store.removeSelection()">
        <Icon name="trash" /> Supprimer les formes
      </button>
    </section>

    <!-- Une broche -->
    <section v-else-if="selectedPin" class="block">
      <div class="head-row">
        <h3>Broche {{ selectedPinOrdinal }}</h3>
        <button
          type="button"
          class="small"
          title="Revenir au composant (Échap)"
          @click="store.selection = null"
        >
          <Icon name="chevron-down" :size="12" /> Composant
        </button>
      </div>
      <div class="row">
        <label class="field">
          <span>Nom</span>
          <input
            type="text"
            :value="selectedPin.name"
            @change="setPinName(selectedPin.id, $event)"
          />
        </label>
        <label class="field">
          <span>Type</span>
          <select :value="selectedPin.kind" @change="setPinKind(selectedPin.id, $event)">
            <option v-for="kind in PIN_KINDS" :key="kind" :value="kind">
              {{ PIN_KIND_LABELS[kind] }}
            </option>
          </select>
        </label>
      </div>
      <p class="hint">Position : ({{ selectedPin.x }}, {{ selectedPin.y }})</p>
      <button type="button" class="danger with-icon" @click="store.removePin(selectedPin.id)">
        <Icon name="trash" /> Supprimer la broche
      </button>
    </section>

    <!-- Rien de sélectionné : le composant -->
    <template v-else>
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
        <p v-if="doc.pins.length === 0" class="hint">Aucune broche.</p>
        <div
          v-for="(pin, index) in doc.pins"
          :key="pin.id"
          class="pin-row"
          @pointerenter="store.hoverPinId = pin.id"
          @pointerleave="store.hoverPinId = null"
          @click="selectPin(pin.id)"
        >
          <span class="ordinal">{{ index + 1 }}</span>
          <input
            type="text"
            :value="pin.name"
            title="Nom de la broche"
            @click.stop
            @change="setPinName(pin.id, $event)"
          />
          <select :value="pin.kind" title="Type" @click.stop @change="setPinKind(pin.id, $event)">
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
      </section>

      <section class="block">
        <h3>Visuel</h3>
        <p v-if="doc.visual.kind === 'png'" class="hint">
          Image PNG à {{ doc.visual.pxPerCell }} px par cellule.
        </p>
        <div class="row">
          <button type="button" class="with-icon" @click="importPng">
            <Icon name="image" /> Importer un PNG…
          </button>
          <button v-if="doc.visual.kind === 'png'" type="button" @click="store.setVisualDrawing()">
            Revenir au dessin
          </button>
        </div>
        <div v-if="pending" class="notice">
          <p>
            Le PNG fait {{ pending.width }} × {{ pending.height }} px, soit
            {{ (pending.width / 80).toFixed(2) }} × {{ (pending.height / 80).toFixed(2) }} cellules.
            Le redimensionner en {{ pending.fit.targetWidth }} × {{ pending.fit.targetHeight }} px
            ({{ pending.fit.widthCells }} × {{ pending.fit.heightCells }} cellules) ?
          </p>
          <div class="row">
            <button type="button" class="primary" @click="acceptResize">Redimensionner</button>
            <button type="button" @click="pending = null">Annuler</button>
          </div>
        </div>
        <p v-if="importError" class="error">{{ importError }}</p>
      </section>
    </template>

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
  background: var(--surface);
  border-left: 1px solid var(--border);
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

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.head-row h3 {
  margin: 0;
}

.head-row button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.head-row .icon {
  transform: rotate(90deg);
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
  color: var(--text-muted);
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
  background: var(--surface-3);
}

.pin-row .ordinal {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: right;
}

.pin-row input,
.pin-row select {
  font: inherit;
  font-size: 12px;
  min-width: 0;
  padding: 3px 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
}

.hint {
  margin: 4px 0 8px;
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-word;
}

.notice {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--warning-border);
  border-radius: 4px;
  background: var(--warning-bg);
  font-size: 12px;
}

.notice p {
  margin: 0 0 8px;
}

.error {
  color: var(--danger);
  font-size: 12px;
}

.ok {
  margin: 0;
  color: var(--success);
  font-size: 12px;
}

.issues {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}

.issues .error {
  color: var(--danger);
}

.issues .warning {
  color: var(--warning-text);
}
</style>
