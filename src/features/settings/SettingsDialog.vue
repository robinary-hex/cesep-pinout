<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  DEFAULT_SETTINGS,
  EXPORT_SCALES,
  settingsSchema,
  type ExportScale,
  type PaletteColor,
  type Settings,
  type Theme
} from '@/domain'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { bridge } from '@/io/bridge'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'
import { applyTheme } from '@/ui/theme'
import PaletteEditor from './PaletteEditor.vue'

// Paramètres de l'application : apparence, dossiers et palette des fils à gauche ; copie de
// secours, export et palette des diagrammes à droite (les fils ont des couleurs vives, les
// diagrammes les leurs, pastel au départ). On édite une copie et on n'enregistre qu'à la
// validation ; le dossier de Pinout, le seul que les paramètres pointent, change tout de suite,
// dès qu'on en choisit un autre. Le profil de style a sa propre boîte (ProfileDialog), ouverte
// depuis la barre d'application.

const emit = defineEmits<{ close: [] }>()
const library = useLibraryStore()
const schematic = useSchematicStore()
const diagram = useDiagramStore()

const draft = ref<Settings>(structuredClone(library.settings ?? DEFAULT_SETTINGS))
const errors = ref<string[]>([])

const defaultColorChoices = computed(() => draft.value.palette)

function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function number(event: Event, fallback: number): number {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : fallback
}

/** Les deux palettes s'éditent de la même façon : celle des fils, celle des diagrammes. */
function setPalette(key: 'palette' | 'diagramPalette', colors: PaletteColor[]): void {
  draft.value = { ...draft.value, [key]: colors }
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

// Dossier de Pinout

const dataNote = ref('')

/**
 * Change le dossier de Pinout. S'il avait déjà ses réglages, ils remplacent ceux de
 * l'application : la boîte les montre, et les documents ouverts qui suivaient l'ancien style
 * général prennent le nouveau.
 */
async function relocate(move: () => Promise<'adopted' | 'moved' | 'failed' | null>): Promise<void> {
  const previousProfile = library.defaultProfile
  const previousStyle = library.diagramDefaults.style
  const result = await move()
  if (result === null) return
  if (result === 'failed') {
    dataNote.value = library.problem
    return
  }
  if (result === 'moved') {
    dataNote.value = 'Dossier préparé : réglages, profils et composants y sont copiés.'
    return
  }
  dataNote.value = 'Ce dossier avait déjà ses réglages : ils sont repris.'
  draft.value = structuredClone(library.settings ?? DEFAULT_SETTINGS)
  applyTheme(draft.value.theme)
  schematic.followGeneralProfile(previousProfile, library.defaultProfile)
  diagram.followGeneralStyle(previousStyle, library.diagramDefaults.style)
  diagram.syncDefaults()
}

async function save(): Promise<void> {
  const parsed = settingsSchema.safeParse(draft.value)
  if (!parsed.success) {
    errors.value = parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`)
    return
  }
  // Seuls les réglages de cette boîte sont enregistrés : les dossiers ont déjà changé à leur
  // choix, et le reste (profils, fichiers récents) ne se modifie pas ici.
  const {
    theme,
    libraryView,
    autoOpenInspector,
    palette,
    defaultWireColor,
    diagramPalette,
    autosaveSeconds
  } = parsed.data
  await library.updateSettings({
    theme,
    libraryView,
    autoOpenInspector,
    palette,
    defaultWireColor,
    diagramPalette,
    autosaveSeconds,
    export: parsed.data.export
  })
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
          <h3>Dossier de Pinout</h3>
          <p
            class="hint path"
            title="Tout y est rangé : Composants, Montages, Diagrammes, et Applications (réglages et profils). Les fichiers récents restent sur chaque machine."
          >
            {{ library.dataRoot ?? 'Pas encore choisi' }}
          </p>
          <div class="row tight">
            <button
              type="button"
              class="with-icon"
              @click="relocate(() => library.chooseDataDir())"
            >
              <Icon name="folder-open" /> Choisir un autre dossier…
            </button>
            <button
              v-if="library.dataRoot"
              type="button"
              @click="bridge().showInFolder(library.dataRoot)"
            >
              Afficher dans l’Explorateur
            </button>
          </div>
          <p v-if="dataNote" class="hint">{{ dataNote }}</p>
        </section>

        <section class="block">
          <h3>Palette des fils</h3>
          <PaletteEditor :colors="draft.palette" @change="setPalette('palette', $event)">
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
          </PaletteEditor>
        </section>
      </div>

      <div class="column">
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

        <section class="block">
          <h3>Palette des diagrammes</h3>
          <PaletteEditor
            :colors="draft.diagramPalette"
            @change="setPalette('diagramPalette', $event)"
          />
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
/* Deux colonnes de même largeur : chacune porte une palette, et aucune ne s'élargit pour elle. */
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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

.radio,
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 2px 0;
}

/* Boutons qui suivent directement un chemin : pas de marge en plus. */
.row.tight {
  margin-top: 0;
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
