<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { styleProfileSchema, type StyleProfile } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import ProfileFields from '@/features/settings/ProfileFields.vue'
import { deleteProfile, listProfiles, saveProfile, type SavedProfile } from '@/io/profiles'
import ModalDialog from '@/ui/ModalDialog.vue'
import { useSchematicStore } from './store'

// Profil de style du montage courant, et profils nommés réutilisables d'un projet à l'autre.
// Chaque changement s'affiche aussitôt sur le montage (aperçu) ; « Appliquer » l'enregistre dans
// le projet en une seule commande, « Annuler » ou Échap remet le profil du projet.

const emit = defineEmits<{ close: [] }>()
const store = useSchematicStore()
const library = useLibraryStore()

const draft = ref<StyleProfile>(structuredClone(store.doc.profile))
const saved = ref<SavedProfile[]>([])
const message = ref('')
const failed = ref(false)

watch(
  draft,
  (value) => {
    const parsed = styleProfileSchema.safeParse(value)
    store.profilePreview = parsed.success ? parsed.data : null
  },
  { deep: true }
)

onUnmounted(() => {
  store.profilePreview = null
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

function applyToProject(): void {
  const profile = valid()
  if (!profile) return
  store.profilePreview = null
  store.setProfile(profile)
  emit('close')
}

async function useAsDefault(): Promise<void> {
  const profile = valid()
  if (!profile) return
  await library.updateSettings({ defaultProfile: profile })
  report(`« ${profile.name} » devient le profil des nouveaux montages.`)
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
  report(`Profil « ${entry.profile.name} » chargé : le montage le montre, Appliquer le garde.`)
}

async function remove(entry: SavedProfile): Promise<void> {
  if (!window.confirm(`Supprimer le profil « ${entry.profile.name} » ?`)) return
  await deleteProfile(entry.path)
  await refresh()
}
</script>

<template>
  <ModalDialog title="Profil de style du montage" @close="emit('close')">
    <ProfileFields v-model="draft" />
    <p class="hint">
      Le montage derrière la boîte montre le profil tel que tu le règles. Les composants gardent
      leur taille en cellules : changer d'échelle ou de trait ne casse rien.
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
      <button type="button" @click="useAsDefault">Profil par défaut</button>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary" @click="applyToProject">Appliquer</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.hint {
  margin: 8px 0;
  font-size: 12px;
  color: #57606a;
}

.saved h3 {
  margin: 12px 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #57606a;
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
  border-top: 1px solid #eaeef2;
}

.name {
  font-weight: 600;
}

.meta {
  flex: 1;
  font-size: 12px;
  color: #57606a;
}

.message {
  margin: 10px 0 0;
  font-size: 12px;
  color: #1a7f37;
}

.message.failed {
  color: #a40e26;
}
</style>
