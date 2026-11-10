<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { answerDialog, pendingDialogs } from './dialogs'
import ModalDialog from './ModalDialog.vue'

// Boîte des questions de l'application (`ask` de dialogs.ts) : une à la fois, dans le style des
// autres boîtes plutôt que celui de Windows. Montée une seule fois, en dernier, par la coque :
// elle passe ainsi au-dessus de toute autre boîte ouverte.

const current = computed(() => pendingDialogs.value[0] ?? null)
const buttons = ref<HTMLElement | null>(null)

// Le choix mis en avant prend le clavier : Entrée le valide, Échap répond par l'annulation.
watch(
  () => current.value?.id,
  async (id) => {
    if (id === undefined) return
    await nextTick()
    const preferred = buttons.value?.querySelector<HTMLButtonElement>('button.primary')
    ;(preferred ?? buttons.value?.querySelector<HTMLButtonElement>('button'))?.focus()
  },
  { immediate: true }
)
</script>

<template>
  <ModalDialog
    v-if="current"
    :key="current.id"
    :title="current.title"
    compact
    @close="answerDialog(current.id, current.cancel)"
  >
    <p class="message">{{ current.message }}</p>
    <p v-if="current.detail" class="detail">{{ current.detail }}</p>
    <template #footer>
      <div ref="buttons" class="buttons">
        <button
          v-for="button in current.buttons"
          :key="button.label"
          type="button"
          :class="button.kind"
          @click="answerDialog(current.id, button.value)"
        >
          {{ button.label }}
        </button>
      </div>
    </template>
  </ModalDialog>
</template>

<style scoped>
.message {
  margin: 0;
  font-size: 14px;
}

.detail {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
