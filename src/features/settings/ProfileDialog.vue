<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import {
  diagramDefaultsSchema,
  sameProfile,
  styleProfileSchema,
  type DiagramDefaults,
  type NodeFill,
  type StyleProfile
} from '@/domain'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { deleteProfile, listProfiles, saveProfile, type SavedProfile } from '@/io/profiles'
import { confirmAction } from '@/ui/dialogs'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'
import DiagramStyleFields from './DiagramStyleFields.vue'
import ProfileFields from './ProfileFields.vue'

// Boîte de profil de style, pour deux usages. `general` : le style général de l'application, en
// deux onglets, Montages et Diagrammes ; l'aperçu se voit sur le document affiché s'il suit le
// style général, et « Appliquer » enregistre les deux dans les paramètres puis les donne aux
// documents ouverts qui suivaient l'ancien. `montage` : le style propre au montage affiché ;
// l'aperçu est immédiat et « Appliquer » en fait une commande du montage. Les profils enregistrés
// (montages) sont en tête de la boîte, un bouton radio devant chacun : en choisir un le met dans
// les champs et à l'aperçu, « Appliquer » le confirme ; une pastille dit lequel est en usage.
// « Annuler » ou Échap ne change rien. Il n'y a pas
// d'onglet pour les composants : un composant n'a pas de style à lui, il se dessine avec celui
// du montage où il est posé.

const props = defineProps<{
  target: 'general' | 'montage'
  /** Onglet montré à l'ouverture du style général. */
  initialTab?: 'montage' | 'diagram'
}>()
const emit = defineEmits<{ close: [] }>()
const library = useLibraryStore()
const schematic = useSchematicStore()
const diagram = useDiagramStore()

const general = props.target === 'general'
const tab = ref<'montage' | 'diagram'>(general ? (props.initialTab ?? 'montage') : 'montage')
/** Style général des diagrammes en cours de réglage. */
const diagramDraft = ref<DiagramDefaults>(structuredClone(library.diagramDefaults))
/** Le diagramme affiché ne montre l'aperçu que s'il suit le style général. */
const diagramPreviewable = general && diagram.followsGeneralStyle

const FILLS: { value: NodeFill; label: string }[] = [
  { value: 'none', label: 'Contour' },
  { value: 'tint', label: 'Teinté' },
  { value: 'solid', label: 'Plein' }
]
const draft = ref<StyleProfile>(
  structuredClone(general ? library.defaultProfile : schematic.doc.profile)
)
/** Le profil général ne s'aperçoit que sur un montage qui le suit ; un style propre, toujours. */
const previewable = !general || schematic.followsGeneralProfile
const title = general ? 'Profil de style général' : `Style du montage « ${schematic.doc.name} »`
// Hors de la réactivité profonde : un profil enregistré se copie tel quel dans les champs, et
// `structuredClone` refuse les objets que Vue a rendus réactifs (rien ne se chargeait).
const saved = shallowRef<SavedProfile[]>([])
/** Le profil en usage : le profil général, ou le style du montage affiché. */
const applied = computed(() => (general ? library.defaultProfile : schematic.doc.profile))
/** Profil enregistré que les champs montrent : celui qui porte leur nom. */
const shownEntry = computed(
  () => saved.value.find((entry) => entry.profile.name === draft.value.name) ?? null
)
/** Les champs s'écartent-ils du profil enregistré sous ce nom ? */
const modified = computed(
  () => shownEntry.value !== null && !sameProfile(draft.value, shownEntry.value.profile)
)
/** Le profil en usage n'est aucun des profils enregistrés : il a alors sa propre ligne. */
const appliedUnsaved = computed(
  () => !saved.value.some((entry) => sameProfile(entry.profile, applied.value))
)
/** Les champs montrent le profil en usage, sans porter le nom d'un profil enregistré. */
const showsApplied = computed(
  () => shownEntry.value === null && sameProfile(draft.value, applied.value)
)
const appliedLabel = general ? 'profil général' : 'style de ce montage'

function isApplied(profile: StyleProfile): boolean {
  return sameProfile(profile, applied.value)
}

function summary(profile: StyleProfile): string {
  return `${profile.cellPx} px · fils ${profile.wireWidth} · trait ${profile.componentStroke} · rayon ${profile.cornerRadius}`
}
const message = ref('')
const failed = ref(false)

watch(
  draft,
  (value) => {
    if (!previewable) return
    const parsed = styleProfileSchema.safeParse(value)
    schematic.profilePreview = parsed.success ? parsed.data : null
  },
  { deep: true }
)

watch(
  () => diagramDraft.value.style,
  (value) => {
    if (diagramPreviewable) diagram.stylePreview = { ...value }
  },
  { deep: true }
)

onUnmounted(() => {
  schematic.profilePreview = null
  diagram.stylePreview = null
})

async function refresh(): Promise<void> {
  try {
    saved.value = await listProfiles()
  } catch (error) {
    report(error instanceof Error ? error.message : String(error), true)
  }
}

onMounted(() => {
  void refresh()
})

function report(text: string, error = false): void {
  message.value = text
  failed.value = error
}

function valid(): StyleProfile | null {
  const parsed = styleProfileSchema.safeParse(draft.value)
  if (!parsed.success) {
    report(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`).join(' ; '),
      true
    )
    return null
  }
  return parsed.data
}

/**
 * Profil général : il est enregistré, et les montages ouverts qui suivaient l'ancien le prennent.
 * Style d'un montage : une commande du montage, annulable.
 */
async function apply(): Promise<void> {
  const profile = valid()
  if (!profile) return
  schematic.profilePreview = null
  diagram.stylePreview = null
  if (general) {
    const defaults = diagramDefaultsSchema.safeParse(diagramDraft.value)
    if (!defaults.success) {
      report('Style des diagrammes invalide.', true)
      return
    }
    const previous = library.defaultProfile
    const previousStyle = library.diagramDefaults.style
    await library.updateSettings({ defaultProfile: profile, diagramDefaults: defaults.data })
    schematic.followGeneralProfile(previous, profile)
    diagram.followGeneralStyle(previousStyle, defaults.data.style)
    diagram.syncDefaults()
  } else {
    schematic.setProfile(profile)
  }
  emit('close')
}

async function saveNamed(): Promise<void> {
  const profile = valid()
  if (!profile) return
  try {
    const path = await saveProfile(profile)
    await refresh()
    report(`Profil « ${profile.name} » enregistré : ${path}`)
  } catch (error) {
    report(error instanceof Error ? error.message : String(error), true)
  }
}

/** Choisit un profil enregistré : il passe dans les champs et à l'aperçu ; Appliquer le confirme. */
function load(entry: SavedProfile): void {
  draft.value = structuredClone(entry.profile)
  report(
    general
      ? `Profil « ${entry.profile.name} » choisi : Appliquer en fait le profil général.`
      : `Profil « ${entry.profile.name} » choisi : Appliquer le donne à ce montage.`
  )
}

/** Revient au profil en usage, tel qu'il est. */
function loadApplied(): void {
  draft.value = structuredClone(applied.value)
  report('')
}

async function remove(entry: SavedProfile): Promise<void> {
  const confirmed = await confirmAction({
    title: 'Supprimer le profil ?',
    message: `Le profil enregistré « ${entry.profile.name} » sera supprimé.`,
    confirm: 'Supprimer',
    danger: true
  })
  if (!confirmed) return
  await deleteProfile(entry.path)
  await refresh()
}
</script>

<template>
  <ModalDialog :title="title" @close="emit('close')">
    <nav v-if="general" class="tabs">
      <button type="button" :class="{ active: tab === 'montage' }" @click="tab = 'montage'">
        Montages
      </button>
      <button type="button" :class="{ active: tab === 'diagram' }" @click="tab = 'diagram'">
        Diagrammes
      </button>
    </nav>

    <template v-if="tab === 'montage'">
      <section class="profiles">
        <h3>Profils</h3>
        <div class="profile-list" role="radiogroup" aria-label="Profils de style">
          <label
            v-for="entry in saved"
            :key="entry.path"
            class="profile-row"
            :class="{ selected: entry === shownEntry }"
          >
            <input
              type="radio"
              name="style-profile"
              :checked="entry === shownEntry"
              :title="`Choisir le profil « ${entry.profile.name} »`"
              @change="load(entry)"
            />
            <span class="name">{{ entry.profile.name }}</span>
            <span class="meta">{{ summary(entry.profile) }}</span>
            <span
              v-if="entry === shownEntry && modified"
              class="badge changed"
              title="Les réglages ci-dessous ne sont plus ceux du profil enregistré"
            >
              modifié
            </span>
            <span v-if="isApplied(entry.profile)" class="badge" :title="`C’est le ${appliedLabel}`">
              en usage
            </span>
            <button
              type="button"
              class="small icon-only"
              title="Supprimer ce profil enregistré"
              @click.prevent="remove(entry)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </label>
          <label v-if="appliedUnsaved" class="profile-row" :class="{ selected: showsApplied }">
            <input
              type="radio"
              name="style-profile"
              :checked="showsApplied"
              :title="`Revenir au ${appliedLabel}`"
              @change="loadApplied"
            />
            <span class="name">{{ applied.name }}</span>
            <span class="meta">{{ summary(applied) }} · pas enregistré comme profil</span>
            <span class="badge" :title="`C’est le ${appliedLabel}`">en usage</span>
          </label>
          <label v-if="!shownEntry && !showsApplied" class="profile-row selected">
            <input type="radio" name="style-profile" checked />
            <span class="name">{{ draft.name }}</span>
            <span class="meta">réglages ci-dessous, pas encore enregistrés comme profil</span>
          </label>
        </div>
      </section>

      <ProfileFields v-model="draft" />
      <p v-if="!previewable" class="hint">
        Le montage affiché a son propre style : il ne montre pas l’aperçu et ne suivra pas ces
        réglages.
      </p>
    </template>

    <template v-else>
      <DiagramStyleFields v-model="diagramDraft.style" />
      <section class="saved">
        <h3>Nouveaux éléments</h3>
        <div class="defaults">
          <label class="field">
            <span>Couleur des nœuds</span>
            <input v-model="diagramDraft.nodeColor" type="color" />
          </label>
          <label class="field">
            <span>Fond des nœuds</span>
            <select v-model="diagramDraft.nodeFill">
              <option v-for="fill in FILLS" :key="fill.value" :value="fill.value">
                {{ fill.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>Couleur des liens</span>
            <input v-model="diagramDraft.linkColor" type="color" />
          </label>
        </div>
      </section>
      <p v-if="!diagramPreviewable" class="hint">
        Le diagramme affiché a son propre style : il ne montre pas l’aperçu et ne suivra pas ces
        réglages.
      </p>
    </template>

    <p v-if="message" class="message" :class="{ failed }">{{ message }}</p>

    <template #footer>
      <button
        v-if="tab === 'montage'"
        type="button"
        :disabled="shownEntry !== null && !modified"
        :title="
          shownEntry
            ? 'Remplace le profil enregistré de ce nom par les réglages ci-dessus'
            : 'Garde ces réglages comme un profil à part, sous le nom du champ « Nom du profil »'
        "
        @click="saveNamed"
      >
        {{ shownEntry ? 'Mettre à jour le profil' : 'Enregistrer comme profil' }}
      </button>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary" @click="apply">Appliquer</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.tabs button.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

/* Couleurs et fond des nouveaux éléments d'un diagramme, côte à côte. */
.defaults {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.defaults .field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.defaults select {
  font: inherit;
  font-size: 13px;
  color: var(--text);
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}

.defaults input[type='color'] {
  width: 56px;
  height: 28px;
  padding: 0 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}

.hint {
  margin: 8px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.saved h3 {
  margin: 12px 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

/* Profils enregistrés, en tête : un bouton radio devant chacun, celui des champs surligné. */
.profiles h3 {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.profile-list {
  margin-bottom: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 4px 8px;
  cursor: pointer;
}

.profile-row + .profile-row {
  border-top: 1px solid var(--border-soft);
}

.profile-row:hover {
  background: var(--surface-3);
}

.profile-row.selected {
  background: var(--accent-soft);
}

.profile-row input[type='radio'] {
  margin: 0;
  cursor: pointer;
}

.badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background: var(--accent);
}

.badge.changed {
  color: var(--warning-text);
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
}

.name {
  font-weight: 600;
}

.meta {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
}

.message {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--success);
}

.message.failed {
  color: var(--danger);
}
</style>
