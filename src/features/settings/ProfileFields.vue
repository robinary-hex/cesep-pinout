<script setup lang="ts">
import ColorField from '@/ui/ColorField.vue'
import { JUNCTION_SCALES, type JunctionScale, type StyleProfile } from '@/domain'

// Champs d'un profil de style, partagés par les paramètres (profil par défaut) et par le montage.

const profile = defineModel<StyleProfile>({ required: true })

function patch(changes: Partial<StyleProfile>): void {
  profile.value = { ...profile.value, ...changes }
}

function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function number(event: Event, fallback: number): number {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : fallback
}
</script>

<template>
  <div class="fields">
    <label class="field">
      <span>Nom du profil</span>
      <input
        type="text"
        :value="profile.name"
        @change="patch({ name: text($event).trim() || profile.name })"
      />
    </label>
    <div class="row">
      <label class="field">
        <span>Cellule à l’écran (px)</span>
        <input
          type="number"
          min="4"
          step="1"
          :value="profile.cellPx"
          @change="patch({ cellPx: Math.max(4, Math.round(number($event, profile.cellPx))) })"
        />
      </label>
      <label class="field">
        <span>Épaisseur des fils (cellules)</span>
        <input
          type="number"
          min="0.02"
          step="0.01"
          :value="profile.wireWidth"
          @change="patch({ wireWidth: Math.max(0.02, number($event, profile.wireWidth)) })"
        />
      </label>
    </div>
    <div class="row">
      <label class="field">
        <span>Rayon des coins (cellules)</span>
        <input
          type="number"
          min="0"
          step="0.05"
          :value="profile.cornerRadius"
          @change="patch({ cornerRadius: Math.max(0, number($event, profile.cornerRadius)) })"
        />
      </label>
      <label class="field">
        <span>Trait des composants (cellules)</span>
        <input
          type="number"
          min="0.02"
          step="0.01"
          :value="profile.componentStroke"
          @change="
            patch({ componentStroke: Math.max(0.02, number($event, profile.componentStroke)) })
          "
        />
      </label>
      <label class="field">
        <span>Point de jonction (× épaisseur)</span>
        <select
          :value="profile.junctionScale"
          @change="patch({ junctionScale: Number(text($event)) as JunctionScale })"
        >
          <option v-for="scale in JUNCTION_SCALES" :key="scale" :value="scale">
            ×{{ scale }}{{ scale === 1 ? ' (invisible)' : '' }}
          </option>
        </select>
      </label>
    </div>
    <div class="row">
      <label class="check">
        <input
          type="checkbox"
          :checked="profile.junctionColor === 'wire'"
          @change="
            patch({
              junctionColor: ($event.target as HTMLInputElement).checked ? 'wire' : '#000000'
            })
          "
        />
        <span>Point de la couleur du fil porteur</span>
      </label>
      <label v-if="profile.junctionColor !== 'wire'" class="field">
        <span>Couleur fixe</span>
        <ColorField :value="profile.junctionColor" @change="patch({ junctionColor: $event })" />
      </label>
    </div>
    <div class="row">
      <label class="field">
        <span>Police des libellés</span>
        <input
          type="text"
          :value="profile.labelFont.family"
          @change="
            patch({
              labelFont: {
                ...profile.labelFont,
                family: text($event).trim() || profile.labelFont.family
              }
            })
          "
        />
      </label>
      <label class="field">
        <span>Taille (pt)</span>
        <input
          type="number"
          min="4"
          step="1"
          :value="profile.labelFont.size"
          @change="
            patch({
              labelFont: {
                ...profile.labelFont,
                size: Math.max(4, number($event, profile.labelFont.size))
              }
            })
          "
        />
      </label>
    </div>
    <div class="row">
      <label class="field">
        <span>Police des étiquettes d’extrémité</span>
        <input
          type="text"
          :value="profile.endLabelFont.family"
          @change="
            patch({
              endLabelFont: {
                ...profile.endLabelFont,
                family: text($event).trim() || profile.endLabelFont.family
              }
            })
          "
        />
      </label>
      <label class="field">
        <span>Taille (pt)</span>
        <input
          type="number"
          min="4"
          step="1"
          :value="profile.endLabelFont.size"
          @change="
            patch({
              endLabelFont: {
                ...profile.endLabelFont,
                size: Math.max(4, number($event, profile.endLabelFont.size))
              }
            })
          "
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.row .field {
  flex: 1;
  min-width: 140px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
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

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 6px;
}
</style>
