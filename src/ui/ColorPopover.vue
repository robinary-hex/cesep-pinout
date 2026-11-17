<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import ColorField from './ColorField.vue'

// Petit volet flottant avec un champ de couleur, posé près de ce qu'il modifie (la pastille d'une
// palette). Choisir une couleur l'envoie (`pick`) ; Échap, ou un clic ailleurs (après avoir validé
// un code en cours de saisie, comme partout), le referme (`close`). C'est à qui l'ouvre de le
// retirer ensuite.

const props = defineProps<{
  /** Rectangle de ce qu'on modifie, dans la fenêtre : le volet se met dessous, centré. */
  anchor: { left: number; top: number; width: number; height: number }
  /** Couleur montrée à l'ouverture : celle qu'on part modifier. */
  value: string
}>()
const emit = defineEmits<{ pick: [hex: string]; close: [] }>()

const PANEL = { width: 126, height: 42, gap: 6, margin: 8 }

const panel = ref<HTMLElement | null>(null)
const field = ref<InstanceType<typeof ColorField> | null>(null)

/** Sous l'ancre, centré sur elle ; au-dessus s'il n'y a pas la place, et jamais hors de la fenêtre. */
const place = computed(() => {
  const { left, top, width, height } = props.anchor
  const below = top + height + PANEL.gap
  const fits = below + PANEL.height + PANEL.margin <= window.innerHeight
  const centered = left + width / 2 - PANEL.width / 2
  return {
    left: Math.max(
      PANEL.margin,
      Math.min(centered, window.innerWidth - PANEL.width - PANEL.margin)
    ),
    top: fits ? below : top - PANEL.gap - PANEL.height
  }
})

function onPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && panel.value?.contains(target)) return
  emit('close')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // Échap ne va pas plus loin : il ferme le volet, pas la sélection de l'éditeur.
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true)
  void nextTick(() => field.value?.focus())
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="panel"
      class="color-popover"
      :style="{ left: `${place.left}px`, top: `${place.top}px` }"
      @keydown="onKeyDown"
    >
      <ColorField ref="field" :value="value" @change="emit('pick', $event)" />
    </div>
  </Teleport>
</template>

<style scoped>
.color-popover {
  position: fixed;
  z-index: 60;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px var(--shadow);
}
</style>
