<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ModalDialog from './ModalDialog.vue'

// Petite boîte de saisie d'une valeur texte : Entrée valide, Échap annule.

const props = defineProps<{
  title: string
  label: string
  value: string
  placeholder?: string
  hint?: string
}>()
const emit = defineEmits<{ submit: [value: string]; close: [] }>()

const input = ref<HTMLInputElement | null>(null)
const draft = ref(props.value)

onMounted(() => {
  input.value?.focus()
  input.value?.select()
})

function submit(): void {
  emit('submit', draft.value)
  emit('close')
}
</script>

<template>
  <ModalDialog :title="title" @close="emit('close')">
    <form class="prompt" @submit.prevent="submit">
      <label class="field">
        <span>{{ label }}</span>
        <input ref="input" v-model="draft" type="text" :placeholder="placeholder" />
      </label>
      <p v-if="hint" class="hint">{{ hint }}</p>
    </form>
    <template #footer>
      <button type="button" @click="emit('close')">Annuler</button>
      <button type="button" class="primary" @click="submit">OK</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input {
  font: inherit;
  font-size: 14px;
  color: var(--text);
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
