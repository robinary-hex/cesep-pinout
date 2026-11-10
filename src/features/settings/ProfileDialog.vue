<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { styleProfileSchema, type StyleProfile } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { deleteProfile, listProfiles, saveProfile, type SavedProfile } from '@/io/profiles'
import ModalDialog from '@/ui/ModalDialog.vue'
import ProfileFields from './ProfileFields.vue'

// Profil de style général de l'application, et profils nommés qu'on peut y charger. Chaque
// changement s'affiche aussitôt sur le montage affiché s'il suit le profil général (aperçu) ;
// « Appliquer » l'enregistre dans les paramètres et le donne aux montages ouverts qui suivaient
// l'ancien ; « Annuler » ou Échap ne change rien.

const emit = defineEmits<{ close: [] }>()
const library = useLibraryStore()
const schematic = useSchematicStore()

const draft = ref<StyleProfile>(structuredClone(library.defaultProfile))
/** Le montage affiché suit le profil général : il sert d'aperçu. Sinon il garde son style. */
const previewable = schematic.followsGeneralProfile
const saved = ref<SavedProfile[]>([])
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

onUnmounted(() => {
  schematic.profilePreview = null
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

/** Le profil devient le profil général ; les montages ouverts qui suivaient l'ancien le prennent. */
async function apply(): Promise<void> {
  const profile = valid()
  if (!profile) return
  const previous = library.defaultProfile
  await library.updateSettings({ defaultProfile: profile })
  schematic.profilePreview = null
  schematic.followGeneralProfile(previous, profile)
  emit('close')
}

async function saveNamed(): Promise<void> {
  const profile = valid()
  if (!profile) return
  try {
    const path = await saveProfile(profile)
    await refresh()
    report(`Profil enregistré : ${path}`)
  } catch (error) {
    report(error instanceof Error ? error.message : String(error), true)
  }
}

function load(entry: SavedProfile): void {
  draft.value = structuredClone(entry.profile)
  report(`Profil « ${entry.profile.name} » chargé : Appliquer en fait le profil général.`)
}

async function remove(entry: SavedProfile): Promise<void> {
  if (!window.confirm(`Supprimer le profil « ${entry.profile.name} » ?`)) return
  await deleteProfile(entry.path)
  await refresh()
}
</script>

<template>
  <ModalDialog title="Profil de style" @close="emit('close')">
    <ProfileFields v-model="draft" />
    <p v-if="!previewable" class="hint">
      Le montage affiché a son propre style : il ne montre pas l’aperçu et ne suivra pas ces
      réglages.
    </p>

    <section class="saved">
      <h3>Profils enregistrés</h3>
      <p v-if="saved.length === 0" class="hint">Aucun pour l'instant.</p>
      <ul v-else>
        <li v-for="entry in saved" :key="entry.path">
          <span class="name">{{ entry.profile.name }}</span>
          <span class="meta"
            >{{ entry.profile.cellPx }} px · fils {{ entry.profile.wireWidth }} · trait
            {{ entry.profile.componentStroke }} · rayon {{ entry.profile.cornerRadius }}</span
          >
          <button type="button" class="small" @click="load(entry)">Charger</button>
          <button type="button" class="small danger" @click="remove(entry)">✕</button>
        </li>
      </ul>
    </section>

    <p v-if="message" class="message" :class="{ failed }">{{ message }}</p>

    <template #footer>
      <button type="button" @click="saveNamed">Enregistrer sous ce nom</button>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary" @click="apply">Appliquer</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
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

.saved ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.saved li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid var(--border-soft);
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
