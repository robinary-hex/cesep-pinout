<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ModalDialog from './ModalDialog.vue'

// Petite boîte de saisie d'une valeur texte : Entrée valide, Échap annule. Avec `multiline`, le
// texte peut tenir sur plusieurs lignes : Maj+Entrée va à la ligne, Entrée valide toujours.

const props = defineProps<{
  title: string
  label: string
  value: string
  placeholder?: string
  hint?: string
  multiline?: boolean
}>()
const emit = defineEmits<{ submit: [value: string]; close: [] }>()

const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
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
        <textarea
          v-if="multiline"
          ref="input"
          v-model="draft"
          rows="4"
          :placeholder="placeholder"
          @keydown.enter.exact.prevent="submit"
        />
        <input v-else ref="input" v-model="draft" type="text" :placeholder="placeholder" />
      </label>
      <p v-if="hint || multiline" class="hint">
        {{ hint }}{{ hint && multiline ? ' ' : ''
        }}{{ multiline ? 'Maj+Entrée va à la ligne.' : '' }}
      </p>
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

.field input,
.field textarea {
  font: inherit;
  font-size: 14px;
  color: var(--text);
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}

.field textarea {
  resize: vertical;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
