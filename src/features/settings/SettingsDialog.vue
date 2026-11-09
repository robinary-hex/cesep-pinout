<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  EXPORT_SCALES,
  settingsSchema,
  styleProfileSchema,
  type ExportScale,
  type PaletteColor,
  type Settings,
  type StyleProfile,
  type Theme
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'
import { applyTheme } from '@/ui/theme'
import ProfileFields from './ProfileFields.vue'

// Paramètres de l'application : bibliothèque, palette, copie de secours à gauche ; profil par
// défaut et export à droite. On édite une copie et on n'enregistre qu'à la validation, sauf
// « Appliquer au montage ouvert », qui est une commande du montage (annulable) à part.

const emit = defineEmits<{ close: [] }>()
const library = useLibraryStore()
const schematic = useSchematicStore()

const draft = ref<Settings>(structuredClone(library.settings ?? DEFAULT_SETTINGS))
const errors = ref<string[]>([])
const applied = ref('')

const defaultColorChoices = computed(() => [
  ...draft.value.palette,
  ...draft.value.customColors.map((hex) => ({ name: hex, hex }))
])

const montageSummary = computed(() => {
  const count = schematic.doc.components.length + schematic.doc.wires.length
  return count === 0 ? 'Le montage ouvert est vide.' : `Montage ouvert : « ${schematic.doc.name} ».`
})

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

/** Copie le profil par défaut (tel que réglé ici) dans le montage ouvert, en une commande. */
function applyProfileToMontage(): void {
  const parsed = styleProfileSchema.safeParse(draft.value.defaultProfile)
  if (!parsed.success) {
    applied.value = parsed.error.issues.map((issue) => issue.message).join(' ; ')
    return
  }
  schematic.setProfile(parsed.data)
  applied.value = `Profil « ${parsed.data.name} » appliqué au montage ouvert (Ctrl+Z pour revenir).`
}

function setExportScale(scale: ExportScale): void {
  draft.value = { ...draft.value, export: { ...draft.value.export, scale } }
}

/** Le thème s'essaie tout de suite ; fermer sans enregistrer remet celui des paramètres. */
function setTheme(theme: Theme): void {
  draft.value = { ...draft.value, theme }
  applyTheme(theme)
}

onUnmounted(() => applyTheme(library.theme))

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
      <div class="column">
        <section class="block">
          <h3>Apparence</h3>
          <div class="row">
            <label class="radio">
              <input
                type="radio"
                name="theme"
                :checked="draft.theme === 'light'"
                @change="setTheme('light')"
              />
              <Icon name="sun" :size="14" /> Clair
            </label>
            <label class="radio">
              <input
                type="radio"
                name="theme"
                :checked="draft.theme === 'dark'"
                @change="setTheme('dark')"
              />
              <Icon name="moon" :size="14" /> Sombre
            </label>
          </div>
          <div class="row">
            <span class="hint">Bibliothèque :</span>
            <label class="radio">
              <input
                type="radio"
                name="libraryView"
                :checked="draft.libraryView === 'list'"
                @change="draft = { ...draft, libraryView: 'list' }"
              />
              Liste
            </label>
            <label class="radio">
              <input
                type="radio"
                name="libraryView"
                :checked="draft.libraryView === 'grid'"
                @change="draft = { ...draft, libraryView: 'grid' }"
              />
              Grille
            </label>
          </div>
          <label class="check spaced">
            <input
              type="checkbox"
              :checked="draft.autoOpenInspector"
              @change="
                draft = { ...draft, autoOpenInspector: ($event.target as HTMLInputElement).checked }
              "
            />
            <span>Ouvrir le panneau de propriétés à la sélection</span>
          </label>
        </section>

        <section class="block">
          <h3>Bibliothèque de composants</h3>
          <p class="hint path">{{ library.libraryDir || 'Dossier par défaut' }}</p>
          <button type="button" class="with-icon" @click="library.chooseDir()">
            <Icon name="folder-open" /> Choisir un autre dossier…
          </button>
        </section>

        <section class="block">
          <h3>Palette des fils</h3>
          <div class="palette-grid">
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
          </div>
          <div class="row">
            <button type="button" class="small with-icon" @click="addPaletteColor">
              <Icon name="plus" :size="14" /> Ajouter une couleur
            </button>
            <label class="field inline">
              <span>Couleur des nouveaux fils</span>
              <select
                :value="draft.defaultWireColor"
                @change="draft = { ...draft, defaultWireColor: text($event) }"
              >
                <option v-for="choice in defaultColorChoices" :key="choice.hex" :value="choice.hex">
                  {{ choice.name }}
                </option>
              </select>
            </label>
          </div>
        </section>

        <section class="block">
          <h3>Copie de secours</h3>
          <label class="field inline">
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
        </section>
      </div>

      <div class="column">
        <section class="block">
          <h3>Profil de style des nouveaux montages</h3>
          <ProfileFields
            :model-value="draft.defaultProfile"
            @update:model-value="setDefaultProfile"
          />
          <div class="row apply">
            <button type="button" class="small" @click="applyProfileToMontage">
              Appliquer au montage ouvert
            </button>
            <span class="hint">{{ applied || montageSummary }}</span>
          </div>
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
            <label class="field inline">
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
          </div>
          <div class="row">
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
              <span>Libellés des composants</span>
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
          </div>
        </section>
      </div>
    </div>

    <ul v-if="errors.length > 0" class="errors">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>

    <template #footer>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary with-icon" @click="save">
        <Icon name="save" /> Enregistrer
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 28px;
  align-items: start;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.block {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-soft);
}

.column .block:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.path {
  margin: 0 0 6px;
  word-break: break-all;
}

.palette-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.palette-row input[type='text'] {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.palette-row input[type='color'] {
  width: 32px;
  height: 26px;
  padding: 0 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
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

.field.inline input[type='number'] {
  width: 80px;
}

.row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}

.row.apply .hint {
  margin: 0;
}

.radio,
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 2px 0;
}

/* Un peu d'air entre les choix d'apparence et la case à cocher. */
.check.spaced {
  margin-top: 10px;
}

.errors {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--danger);
}
</style>
