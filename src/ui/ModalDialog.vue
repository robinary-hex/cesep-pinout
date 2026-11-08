<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { openModals } from './modalState'

// Boîte de dialogue modale : fond assombri, Échap ou clic hors de la boîte pour fermer.
// Tant qu'elle est ouverte, les éditeurs ignorent leurs raccourcis (voir openModals).

defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  openModals.value++
  window.addEventListener('keydown', onKeyDown, true)
})

onUnmounted(() => {
  openModals.value--
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <div class="dialog" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
      <header class="head">
        <h2>{{ title }}</h2>
        <button type="button" class="close" title="Fermer (Échap)" @click="emit('close')">✕</button>
      </header>
      <div class="body">
        <slot />
      </div>
      <footer v-if="$slots['footer']" class="foot">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(31, 35, 40, 0.45);
}

.dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(31, 35, 40, 0.35);
}

.dialog.wide {
  width: min(960px, calc(100vw - 32px));
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #d0d7de;
}

.head h2 {
  margin: 0;
  font-size: 15px;
}

.close {
  padding: 2px 8px;
}

.body {
  padding: 14px 16px;
  overflow: auto;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #d0d7de;
}
</style>
