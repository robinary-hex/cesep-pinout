<script setup lang="ts">
import type { DiagramFont, DiagramStyle } from '@/domain'

// Champs du style d'un diagramme, partagés par le profil de style général (onglet Diagrammes) et
// par le panneau de propriétés d'un diagramme. Les longueurs se montrent en pixels et les textes
// en points, à 100 % ; le fichier garde les longueurs en cellules. Avec `reference` (le style
// général), les réglages qui s'en écartent sont surlignés.

const style = defineModel<DiagramStyle>({ required: true })
const props = defineProps<{ reference?: DiagramStyle }>()

const FIELDS = [
  {
    key: 'lineWidth',
    label: 'Trait (px)',
    title: 'Épaisseur des contours et des liens',
    step: 0.5,
    min: 0.5,
    max: 8,
    cells: true
  },
  {
    key: 'nodeRadius',
    label: 'Coins (px)',
    title: 'Rayon des coins des rectangles arrondis',
    step: 1,
    min: 0,
    max: 40,
    cells: true
  },
  {
    key: 'cornerRadius',
    label: 'Coudes (px)',
    title: 'Rayon des coudes des liens',
    step: 1,
    min: 0,
    max: 40,
    cells: true
  },
  {
    key: 'titleSize',
    label: 'Titre (pt)',
    title: 'Taille des titres',
    step: 1,
    min: 6,
    max: 48,
    cells: false
  },
  {
    key: 'subtitleSize',
    label: 'Sous-titre (pt)',
    title: 'Taille des sous-titres',
    step: 1,
    min: 6,
    max: 48,
    cells: false
  },
  {
    key: 'labelSize',
    label: 'Étiquettes (pt)',
    title: 'Taille des étiquettes de lien, et des textes libres qu’on pose',
    step: 1,
    min: 6,
    max: 48,
    cells: false
  }
] as const
type Field = (typeof FIELDS)[number]

function patch(changes: Partial<DiagramStyle>): void {
  style.value = { ...style.value, ...changes }
}

function shown(field: Field): number {
  const value = style.value[field.key]
  return field.cells ? Math.round(value * style.value.cellPx * 100) / 100 : value
}

function set(field: Field, event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  const value = Math.min(field.max, Math.max(field.min, raw))
  patch({ [field.key]: field.cells ? value / style.value.cellPx : value })
}

function setFont(event: Event): void {
  patch({ font: (event.target as HTMLSelectElement).value as DiagramFont })
}

function differs(key: keyof DiagramStyle): boolean {
  return props.reference !== undefined && style.value[key] !== props.reference[key]
}
</script>

<template>
  <div class="fields">
    <label class="field" :class="{ differs: differs('font') }">
      <span title="Police de tout le diagramme ; un nœud peut choisir la sienne">Police</span>
      <select :value="style.font" @change="setFont">
        <option value="sans">Normale</option>
        <option value="mono">Chasse fixe (code)</option>
      </select>
    </label>
    <div class="grid">
      <label
        v-for="field in FIELDS"
        :key="field.key"
        class="field"
        :class="{ differs: differs(field.key) }"
      >
        <span :title="field.title">{{ field.label }}</span>
        <input
          type="number"
          :step="field.step"
          :min="field.min"
          :max="field.max"
          :value="shown(field)"
          :title="field.title"
          @change="set(field, $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
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

/* Réglage qui s'écarte du style général : son nom le signale. */
.field.differs > span {
  color: var(--alert);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 8px;
}

.grid input {
  width: 100%;
  box-sizing: border-box;
}
</style>
