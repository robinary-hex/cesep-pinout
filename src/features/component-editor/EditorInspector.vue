<script setup lang="ts">
import { computed } from 'vue'
import {
  DOT_SCALES,
  naturalImageSize,
  PIN_KIND_LABELS,
  PIN_KINDS,
  PRIMITIVE_KIND_LABELS,
  STROKE_WEIGHTS,
  TEXT_BASE_SIZE_CELLS,
  TEXT_SCALES,
  turnedTextBox,
  type Arrows,
  type PinKind
} from '@/domain'
import Icon from '@/ui/Icon.vue'
import type { IconName } from '@/ui/icons'
import { useComponentEditorStore } from './store'

// Panneau de droite, replié par défaut comme dans les autres éditeurs (touche I, bouton de la
// barre). Sans sélection : le composant (propriétés, taille, broches). Avec des
// formes sélectionnées : seulement elles. Une broche sélectionnée reste dans la liste du
// composant, mise en évidence, avec les contrôles de cohérence ; une forme sélectionnée les cache.
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

// Broches

function selectPin(id: string): void {
  store.selectPin(id)
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
const primitiveCount = computed(() => doc.value.visual.primitives.length)
/** Formes et broches sélectionnées, ensemble. */
const multiCount = computed(() => store.selectedIndexes.length + store.selectedPinIds.length)
const shapeStyle = computed(() =>
  primitive.value && 'style' in primitive.value ? primitive.value.style : null
)
const weightChoices = computed(() => {
  const current = shapeStyle.value?.weight
  const list: number[] = [...STROKE_WEIGHTS]
  if (current !== undefined && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
})

// Image : sa taille à l'écran, et le retour à sa taille d'origine (80 px par cellule).

const QUARTERS = 4
const cells = (quarters: number): string =>
  (quarters / QUARTERS).toLocaleString('fr-BE', { maximumFractionDigits: 2 })

const imageSize = computed(() => {
  const current = primitive.value
  if (current?.kind !== 'image') return null
  const natural = naturalImageSize(current)
  return {
    shown: `${cells(current.w)} × ${cells(current.h)} cellules`,
    natural: natural ? `${cells(natural.w)} × ${cells(natural.h)} cellules` : null,
    resized: natural !== null && (natural.w !== current.w || natural.h !== current.h)
  }
})

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

function setFillOpacity(event: Event): void {
  const opacity = Math.min(1, Math.max(0, numberValue(event) / 100))
  store.updateStyle(primitiveIndex.value, { fillOpacity: opacity })
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

type TextStyleKey = 'bold' | 'italic' | 'underline' | 'strike'

/** Styles de texte, un bouton à pictogramme chacun ; `label` sert d'infobulle et de libellé d'annulation. */
const TEXT_STYLE_OPTIONS: { key: TextStyleKey; label: string; icon: IconName }[] = [
  { key: 'bold', label: 'Gras', icon: 'bold' },
  { key: 'italic', label: 'Italique', icon: 'italic' },
  { key: 'underline', label: 'Souligné', icon: 'underline' },
  { key: 'strike', label: 'Barré', icon: 'strikethrough' }
]

function toggleTextStyle(option: (typeof TEXT_STYLE_OPTIONS)[number]): void {
  const current = primitive.value
  if (!current || current.kind !== 'text') return
  const on = !current[option.key]
  store.updatePrimitive(
    primitiveIndex.value,
    `${option.label} ${on ? 'activé' : 'retiré'}`,
    (p) => {
      if (p.kind === 'text') p[option.key] = on
    }
  )
}

function setFollowsRotation(event: Event): void {
  const follows = checked(event)
  store.updatePrimitive(
    primitiveIndex.value,
    follows ? 'Texte qui tourne avec le composant' : 'Texte toujours horizontal',
    (p) => {
      if (p.kind === 'text') p.followsRotation = follows
    }
  )
}

/** Tailles de point proposées, plus la taille actuelle si elle n'en fait pas partie. */
const dotScaleChoices = computed(() => {
  const list: number[] = [...DOT_SCALES]
  const current = primitive.value?.kind === 'dot' ? primitive.value.scale : undefined
  if (current !== undefined && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
})

function setDotScale(event: Event): void {
  const scale = Math.max(0.1, numberValue(event))
  store.updatePrimitive(primitiveIndex.value, 'Taille du point', (p) => {
    if (p.kind === 'dot') p.scale = scale
  })
}

function setDotColor(event: Event): void {
  const color = inputValue(event)
  store.updatePrimitive(primitiveIndex.value, 'Couleur du point', (p) => {
    if (p.kind === 'dot') p.color = color
  })
}

function setVertical(event: Event): void {
  const vertical = checked(event)
  store.updatePrimitive(
    primitiveIndex.value,
    vertical ? 'Texte vertical' : 'Texte horizontal',
    (p) => {
      if (p.kind !== 'text') return
      // Une boîte couchée dans l'autre sens tourne avec le texte.
      Object.assign(p, turnedTextBox(p, vertical))
      p.vertical = vertical
    }
  )
}

function setRectRadius(event: Event): void {
  const rx = Math.max(0, Math.round(numberValue(event)))
  store.updatePrimitive(primitiveIndex.value, 'Arrondi du rectangle', (p) => {
    if (p.kind === 'rect') p.rx = rx
  })
}

function setPolyRadius(event: Event): void {
  const radius = Math.max(0, Math.round(numberValue(event)))
  store.updatePrimitive(primitiveIndex.value, 'Arrondi des angles', (p) => {
    if (p.kind === 'polyline') p.radius = radius
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

    <!-- Une forme seule -->
    <section v-if="primitive" class="block">
      <h3>{{ PRIMITIVE_KIND_LABELS[primitive.kind] }}</h3>
      <div class="row order">
        <span class="hint">Ordre {{ primitiveIndex + 1 }} / {{ primitiveCount }}</span>
        <div class="toggles">
          <button
            type="button"
            class="toggle"
            title="Arrière-plan (Ctrl+Maj+Page bas)"
            :disabled="primitiveIndex === 0"
            @click="store.reorderPrimitive('bottom')"
          >
            <Icon name="arrow-down-line" />
          </button>
          <button
            type="button"
            class="toggle"
            title="Reculer (Ctrl+Page bas)"
            :disabled="primitiveIndex === 0"
            @click="store.reorderPrimitive('down')"
          >
            <Icon name="arrow-down" />
          </button>
          <button
            type="button"
            class="toggle"
            title="Avancer (Ctrl+Page haut)"
            :disabled="primitiveIndex >= primitiveCount - 1"
            @click="store.reorderPrimitive('up')"
          >
            <Icon name="arrow-up" />
          </button>
          <button
            type="button"
            class="toggle"
            title="Premier plan (Ctrl+Maj+Page haut)"
            :disabled="primitiveIndex >= primitiveCount - 1"
            @click="store.reorderPrimitive('top')"
          >
            <Icon name="arrow-up-line" />
          </button>
        </div>
      </div>

      <template v-if="primitive.kind === 'text'">
        <label class="check">
          <input type="checkbox" :checked="primitive.variable" @change="setVariable" />
          <span>Texte variable</span>
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
          <div class="field">
            <span>Style</span>
            <div class="toggles">
              <button
                v-for="option in TEXT_STYLE_OPTIONS"
                :key="option.key"
                type="button"
                class="toggle"
                :class="{ active: primitive[option.key] }"
                :title="option.label"
                @click="toggleTextStyle(option)"
              >
                <Icon :name="option.icon" />
              </button>
            </div>
          </div>
        </div>
        <label
          class="check"
          title="Sinon le texte reste horizontal quelle que soit l'orientation du composant. Un miroir ne reflète jamais un texte."
        >
          <input
            type="checkbox"
            :checked="primitive.followsRotation"
            @change="setFollowsRotation"
          />
          <span>Tourne avec le composant sur le montage</span>
        </label>
        <label class="check" title="Le texte est tourné de 90° et se lit de haut en bas">
          <input type="checkbox" :checked="primitive.vertical" @change="setVertical" />
          <span>Vertical</span>
        </label>
      </template>

      <template v-else-if="primitive.kind === 'image' && imageSize">
        <p class="hint">
          {{ imageSize.shown
          }}{{ imageSize.resized ? ` (taille d’origine : ${imageSize.natural})` : '' }}
        </p>
        <button
          type="button"
          :disabled="!imageSize.resized"
          title="Rendre à l’image sa taille d’origine : 80 px du fichier par cellule"
          @click="store.resetImageSize(primitiveIndex)"
        >
          Taille d’origine
        </button>
      </template>

      <template v-else-if="primitive.kind === 'dot'">
        <div class="row">
          <label class="field">
            <span>Taille</span>
            <select :value="primitive.scale" @change="setDotScale">
              <option v-for="scale in dotScaleChoices" :key="scale" :value="scale">
                ×{{ scale }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>Couleur</span>
            <input type="color" :value="primitive.color" @change="setDotColor" />
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
          <label class="field opacity">
            <span>Opacité du remplissage : {{ Math.round(shapeStyle.fillOpacity * 100) }} %</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              :value="Math.round(shapeStyle.fillOpacity * 100)"
              :disabled="shapeStyle.fill === 'none'"
              @change="setFillOpacity"
            />
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
        <label v-if="primitive.kind === 'polyline'" class="field">
          <span>Arrondi des angles (quarts de cellule)</span>
          <input type="number" min="0" step="1" :value="primitive.radius" @change="setPolyRadius" />
        </label>
        <label v-if="primitive.kind === 'polyline'" class="check">
          <input type="checkbox" :checked="primitive.closed" @change="setClosed" />
          <span>Fermée (polygone)</span>
        </label>
      </template>
    </section>

    <!-- Plusieurs éléments : formes, broches, ou les deux -->
    <section v-else-if="multiCount > 1" class="block">
      <h3 class="alone">{{ multiCount }} éléments sélectionnés</h3>
    </section>

    <!-- Rien de sélectionné, ou une broche : le composant, la broche en évidence dans la liste -->
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
        <p v-if="store.folder" class="hint">Dossier : {{ store.folder }}</p>
        <p v-else class="hint">Pas encore enregistré ; l’identifiant sera dérivé du nom.</p>
      </section>

      <section class="block">
        <h3>Taille</h3>
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
      </section>

      <section class="block">
        <h3>Broches</h3>
        <p v-if="doc.pins.length === 0" class="hint">Aucune broche.</p>
        <div
          v-for="(pin, index) in doc.pins"
          :key="pin.id"
          class="pin-row"
          :class="{ selected: store.selectedPinIds.includes(pin.id) }"
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
        </div>
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
    </template>
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

.block h3.alone {
  margin: 0;
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

.order {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.order .hint {
  margin: 0;
}

.field.opacity {
  flex-basis: 100%;
}

.field input[type='range'] {
  padding: 0;
  border: 0;
  background: transparent;
  accent-color: var(--accent);
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

.pin-row.selected {
  background: var(--accent-soft);
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
