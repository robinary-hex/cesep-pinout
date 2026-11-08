<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  EXPORT_SCALES,
  settingsSchema,
  type ExportScale,
  type PaletteColor,
  type Settings,
  type StyleProfile
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ModalDialog from '@/ui/ModalDialog.vue'
import ProfileFields from './ProfileFields.vue'

// Paramètres de l'application : bibliothèque, palette, profil par défaut, export, copie de secours.
// On édite une copie et on n'enregistre qu'à la validation.

const emit = defineEmits<{ close: [] }>()
const library = useLibraryStore()

const draft = ref<Settings>(structuredClone(library.settings ?? DEFAULT_SETTINGS))
const errors = ref<string[]>([])

const defaultColorChoices = computed(() => [
  ...draft.value.palette,
  ...draft.value.customColors.map((hex) => ({ name: hex, hex }))
])

function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function number(event: Event, fallback: number): number {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : fallback
}

function updatePaletteColor(index: number, changes: Partial<PaletteColor>): void {
  const palette = draft.value.palette.map((color, i) =>
    i === index ? { ...color, ...changes } : color
  )
  draft.value = { ...draft.value, palette }
}

function removePaletteColor(index: number): void {
  if (draft.value.palette.length <= 1) return
  draft.value = { ...draft.value, palette: draft.value.palette.filter((_, i) => i !== index) }
}

function addPaletteColor(): void {
  draft.value = {
    ...draft.value,
    palette: [
      ...draft.value.palette,
      { name: `Couleur ${draft.value.palette.length + 1}`, hex: '#808080' }
    ]
  }
}

function setDefaultProfile(profile: StyleProfile): void {
  draft.value = { ...draft.value, defaultProfile: profile }
}

function setExportScale(scale: ExportScale): void {
  draft.value = { ...draft.value, export: { ...draft.value.export, scale } }
}

async function save(): Promise<void> {
  const parsed = settingsSchema.safeParse(draft.value)
  if (!parsed.success) {
    errors.value = parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`)
    return
  }
  await library.updateSettings(parsed.data)
  emit('close')
}
</script>

<template>
  <ModalDialog title="Paramètres" wide @close="emit('close')">
    <div class="columns">
      <section class="block">
        <h3>Bibliothèque de composants</h3>
        <p class="hint path">{{ library.libraryDir || 'Dossier par défaut' }}</p>
        <button type="button" @click="library.chooseDir()">Choisir un autre dossier…</button>
        <p class="hint">
          Un dossier OneDrive partage la bibliothèque entre le PC et le portable. Les projets
          gardent de toute façon une copie de leurs composants.
        </p>
      </section>

      <section class="block">
        <h3>Palette des fils</h3>
        <div v-for="(color, index) in draft.palette" :key="index" class="palette-row">
          <input
            type="color"
            :value="color.hex"
            @change="updatePaletteColor(index, { hex: text($event) })"
          />
          <input
            type="text"
            :value="color.name"
            @change="updatePaletteColor(index, { name: text($event).trim() || color.name })"
          />
          <button
            type="button"
            class="small danger"
            title="Retirer"
            @click="removePaletteColor(index)"
          >
            ✕
          </button>
        </div>
        <button type="button" class="small" @click="addPaletteColor">Ajouter une couleur</button>
        <label class="field">
          <span>Couleur par défaut des nouveaux fils</span>
          <select
            :value="draft.defaultWireColor"
            @change="draft = { ...draft, defaultWireColor: text($event) }"
          >
            <option v-for="choice in defaultColorChoices" :key="choice.hex" :value="choice.hex">
              {{ choice.name }}
            </option>
          </select>
        </label>
      </section>

      <section class="block">
        <h3>Profil de style des nouveaux montages</h3>
        <ProfileFields
          :model-value="draft.defaultProfile"
          @update:model-value="setDefaultProfile"
        />
      </section>

      <section class="block">
        <h3>Export par défaut</h3>
        <div class="row">
          <label v-for="scale in EXPORT_SCALES" :key="scale" class="radio">
            <input
              type="radio"
              name="export-scale"
              :checked="draft.export.scale === scale"
              @change="setExportScale(scale)"
            />
            {{ scale }}×
          </label>
        </div>
        <label class="field">
          <span>Marge (cellules)</span>
          <input
            type="number"
            min="0"
            step="1"
            :value="draft.export.marginCells"
            @change="
              draft = {
                ...draft,
                export: {
                  ...draft.export,
                  marginCells: Math.max(0, Math.round(number($event, draft.export.marginCells)))
                }
              }
            "
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="draft.export.labels"
            @change="
              draft = {
                ...draft,
                export: { ...draft.export, labels: ($event.target as HTMLInputElement).checked }
              }
            "
          />
          <span>Repères des composants</span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="draft.export.grid"
            @change="
              draft = {
                ...draft,
                export: { ...draft.export, grid: ($event.target as HTMLInputElement).checked }
              }
            "
          />
          <span>Grille</span>
        </label>
      </section>

      <section class="block">
        <h3>Copie de secours</h3>
        <label class="field">
          <span>Intervalle (secondes)</span>
          <input
            type="number"
            min="10"
            step="10"
            :value="draft.autosaveSeconds"
            @change="
              draft = {
                ...draft,
                autosaveSeconds: Math.max(10, Math.round(number($event, draft.autosaveSeconds)))
              }
            "
          />
        </label>
        <p class="hint">
          Tant qu'un montage a des modifications non enregistrées, une copie est écrite à cet
          intervalle et proposée au prochain lancement si l'application s'est arrêtée sans
          enregistrer.
        </p>
      </section>
    </div>

    <ul v-if="errors.length > 0" class="errors">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>

    <template #footer>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary" @click="save">Enregistrer</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #57606a;
}

.hint {
  margin: 6px 0;
  font-size: 12px;
  color: #57606a;
}

.path {
  word-break: break-all;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.palette-row input[type='text'] {
  flex: 1;
  font: inherit;
  padding: 3px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
}

.palette-row input[type='color'] {
  width: 32px;
  height: 26px;
  padding: 0 2px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
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
  gap: 12px;
  flex-wrap: wrap;
}

.radio,
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 0;
}

.errors {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #a40e26;
}
</style>
