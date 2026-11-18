<script setup lang="ts">
import type { UpdateStatus } from '../../electron/api'
import Icon from '@/ui/Icon.vue'
import { updateButtonLabel, updateButtonTitle } from './update'

// Le bouton de mise à jour : le même dans la barre d'application et dans la boîte du premier
// lancement, qui cache la barre tant qu'on n'a pas choisi le dossier de Pinout. Il dit où en est
// la mise à jour ; ce que fait le clic se décide dans `App.vue` (`onUpdateClick`).

defineProps<{ status: UpdateStatus }>()
</script>

<template>
  <button
    type="button"
    class="with-icon update"
    :class="status.state"
    :disabled="status.state === 'downloading' || status.state === 'installing'"
    :title="updateButtonTitle(status)"
  >
    <Icon name="export" :size="15" /> {{ updateButtonLabel(status) }}
  </button>
</template>
