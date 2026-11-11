<script setup lang="ts">
import { ref } from 'vue'
import { useLibraryStore } from '@/features/library/store'
import {
  APPLICATION_FOLDER,
  COMPONENTS_FOLDER,
  DIAGRAMS_FOLDER,
  MONTAGES_FOLDER
} from '@/io/dataFolder'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'

// Premier lancement (décision du 11 novembre 2026) : l'application demande où mettre le dossier de
// Pinout, celui qui range tout. Elle en propose un ; on l'accepte ou on en choisit un autre. La
// boîte ne se ferme pas autrement : sans ce dossier, rien ne peut être rangé.

const emit = defineEmits<{ done: [] }>()
const library = useLibraryStore()
const busy = ref(false)

/** Ce que le dossier contiendra, dans l'ordre où on le dit. */
const FOLDERS = [
  { name: COMPONENTS_FOLDER, holds: 'les composants de la bibliothèque' },
  { name: MONTAGES_FOLDER, holds: 'les montages' },
  { name: DIAGRAMS_FOLDER, holds: 'les diagrammes' },
  { name: APPLICATION_FOLDER, holds: 'les réglages et les profils de style' }
]

async function settle(move: () => Promise<'adopted' | 'moved' | 'failed' | null>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const result = await move()
    // Un échec s'explique dans la boîte, qui reste ouverte ; un choix annulé aussi.
    if (result === 'adopted' || result === 'moved') emit('done')
  } finally {
    busy.value = false
  }
}

function accept(): void {
  const proposal = library.firstRun?.proposal
  if (proposal) void settle(() => library.setDataDir(proposal))
}

function choose(): void {
  void settle(() => library.chooseDataDir())
}
</script>

<template>
  <ModalDialog title="Dossier de Pinout" persistent>
    <p class="lead">
      Pinout range tout dans un seul dossier. Mis dans OneDrive, il suit d’un ordinateur à l’autre.
    </p>
    <ul class="folders">
      <li v-for="folder in FOLDERS" :key="folder.name">
        <Icon name="folder-open" :size="14" />
        <strong>{{ folder.name }}</strong>
        <span>{{ folder.holds }}</span>
      </li>
    </ul>
    <p class="label">Dossier proposé</p>
    <p class="path">{{ library.firstRun?.proposal }}</p>
    <p class="note">
      Ce que vous avez déjà (composants, réglages, profils) y est copié. Rien n’est supprimé là où
      il se trouve.
    </p>
    <p v-if="library.problem" class="problem">{{ library.problem }}</p>

    <template #footer>
      <button type="button" class="with-icon" :disabled="busy" @click="choose">
        <Icon name="folder-open" /> Choisir un autre dossier…
      </button>
      <button type="button" class="primary" :disabled="busy" @click="accept">
        Utiliser ce dossier
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.lead {
  margin: 0 0 12px;
}

.folders {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.folders li {
  display: grid;
  grid-template-columns: 16px 110px 1fr;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.folders span {
  color: var(--text-muted);
}

.label {
  margin: 0 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.path {
  margin: 0 0 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 13px;
  word-break: break-all;
  user-select: text;
}

.note {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.problem {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
