<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UpdateStatus } from '../../electron/api'
import { useLibraryStore } from '@/features/library/store'
import {
  APPLICATION_FOLDER,
  COMPONENTS_FOLDER,
  DIAGRAMS_FOLDER,
  MONTAGES_FOLDER
} from '@/io/dataFolder'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'
import UpdateButton from './UpdateButton.vue'

// Premier lancement (décision du 11 novembre 2026) : l'application demande où mettre le dossier de
// Pinout, celui qui range tout. Elle en propose un ; on l'accepte ou on en choisit un autre. La
// boîte ne se ferme pas autrement : sans ce dossier, rien ne peut être rangé.
//
// Elle cache la barre d'application, donc son bouton de mise à jour : elle le porte elle-même
// dès qu'une mise à jour s'annonce (décision du 18 novembre 2026). Sans cela, une version plus
// ancienne lancée sur un dossier dont une plus récente se sert déjà restait bloquée : le
// dossier était refusé, « mets l'application à jour », et le bouton pour le faire était hors
// d'atteinte. Dans ce cas précis (`updateNeeded`), la boîte le dit et, si rien ne s'est encore
// annoncé, propose de chercher la mise à jour.

const props = defineProps<{
  /** Où en est la mise à jour, ou null s'il n'y a rien à faire (celui de la barre d'application). */
  update: UpdateStatus | null
  /** Vrai le temps d'une recherche de mise à jour demandée d'ici. */
  checking: boolean
}>()
const emit = defineEmits<{ done: []; update: []; checkUpdate: [] }>()
const library = useLibraryStore()
const busy = ref(false)

/** Ce que la boîte dit de la mise à jour, à côté de son bouton ; null s'il n'y a rien à en dire. */
const updateNotice = computed(() => {
  if (library.updateNeeded) {
    return 'Ce dossier sert déjà à une version plus récente de Pinout. Pour l’utiliser, il faut mettre l’application à jour.'
  }
  return props.update === null ? null : 'Une nouvelle version de Pinout est disponible.'
})

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
    <p v-if="library.problem && !library.updateNeeded" class="problem">{{ library.problem }}</p>
    <div v-if="updateNotice" class="update-notice" :class="{ needed: library.updateNeeded }">
      <p>{{ updateNotice }}</p>
      <UpdateButton v-if="update" :status="update" @click="emit('update')" />
      <button
        v-else
        type="button"
        class="with-icon check-update"
        :disabled="checking"
        @click="emit('checkUpdate')"
      >
        <Icon name="refresh" :size="15" />
        {{ checking ? 'Recherche…' : 'Rechercher une mise à jour' }}
      </button>
    </div>

    <template #footer>
      <button type="button" class="with-icon" :disabled="busy" @click="choose">
        <Icon name="folder-open" /> Choisir un autre dossier…
      </button>
      <!-- Refusé faute de mise à jour, le dossier le serait encore : le bouton attendu est celui
           de la mise à jour, pas celui-ci. -->
      <button
        type="button"
        :class="{ primary: !library.updateNeeded }"
        :disabled="busy"
        @click="accept"
      >
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

/* La mise à jour : ce qu'il y a à en dire, et son bouton à droite. */
.update-notice {
  margin: 12px 0 0;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  font-size: 13px;
}

.update-notice p {
  flex: 1;
  margin: 0;
}

.update-notice button {
  flex: none;
}

/* Le dossier demande une version plus récente : c'est ce qui bloque, on le voit. */
.update-notice.needed {
  border-color: var(--danger);
  background: var(--danger-soft);
}

.update-notice.needed p {
  color: var(--danger);
}
</style>
