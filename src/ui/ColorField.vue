<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseHexColor } from './hexColor'

// Champ de couleur : la pastille, qui ouvre le sélecteur de couleurs, et à côté le code
// hexadécimal de la couleur, qu'on peut lire, taper ou coller sans passer par le sélecteur
// (décision du 11 novembre 2026). Les deux disent la même couleur. Le code valide au `change`,
// comme les autres champs des panneaux ; ce qui n'en est pas un est refusé, et le champ reprend
// la couleur.

const props = defineProps<{ value: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [hex: string] }>()

const typed = ref(props.value)
watch(
  () => props.value,
  (value) => {
    typed.value = value
  }
)
/** Ce qu'on est en train de taper n'est pas (encore) un code de couleur. */
const invalid = computed(() => parseHexColor(typed.value) === null)

function pick(event: Event): void {
  emit('change', (event.target as HTMLInputElement).value)
}

/** Valide ce que le champ contient ; il affiche ensuite le code complet, ou la couleur gardée. */
function commit(event: Event): void {
  const input = event.target as HTMLInputElement
  const hex = parseHexColor(input.value)
  typed.value = hex ?? props.value
  input.value = typed.value
  if (hex !== null && hex !== props.value.toLowerCase()) emit('change', hex)
}

const code = ref<HTMLInputElement | null>(null)

/** Met le curseur dans le code, tout sélectionné : prêt à être remplacé. */
function focus(): void {
  code.value?.focus()
  code.value?.select()
}

defineExpose({ focus })
</script>

<template>
  <span class="color-field">
    <input type="color" :value="value" :disabled="disabled" @change="pick" />
    <input
      ref="code"
      v-model="typed"
      type="text"
      class="hex"
      :class="{ invalid }"
      maxlength="9"
      spellcheck="false"
      autocomplete="off"
      :disabled="disabled"
      title="Code hexadécimal de la couleur, par exemple #d62828"
      @change="commit"
    />
  </span>
</template>

<style scoped>
.color-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.color-field input[type='color'] {
  flex: none;
  width: 32px;
  height: 28px;
  padding: 0 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  cursor: pointer;
}

.color-field .hex {
  flex: 0 1 auto;
  width: 72px;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  padding: 0 6px;
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}

.color-field .hex.invalid {
  border-color: var(--danger);
}

.color-field input:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
