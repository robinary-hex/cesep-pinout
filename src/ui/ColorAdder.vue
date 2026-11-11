<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import ColorField from './ColorField.vue'

// Le « + » d'une palette : une couleur de plus, choisie au sélecteur ou par son code hexadécimal.
// Un clic ouvre un petit volet près du bouton, avec le champ de couleur, le curseur dans le code.
// Choisir une couleur l'envoie (`pick`) et referme le volet ; Échap le referme sans rien envoyer,
// un clic ailleurs aussi (après avoir validé un code en cours de saisie, comme partout).

defineProps<{
  /** Couleur montrée à l'ouverture : celle qu'on part modifier. */
  value: string
  title: string
}>()
const emit = defineEmits<{ pick: [hex: string] }>()

const PANEL = { width: 126, height: 42, gap: 6, margin: 8 }

const open = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const field = ref<InstanceType<typeof ColorField> | null>(null)
const place = ref({ left: 0, top: 0 })

function close(): void {
  if (!open.value) return
  open.value = false
  window.removeEventListener('pointerdown', onPointerDown, true)
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node) {
    if (panel.value?.contains(target) || button.value?.contains(target)) return
  }
  close()
}

/** Sous le bouton, centré sur lui ; au-dessus s'il n'y a pas la place, et jamais hors de la fenêtre. */
function placePanel(): void {
  const box = button.value?.getBoundingClientRect()
  if (!box) return
  const left = box.left + box.width / 2 - PANEL.width / 2
  const below = box.bottom + PANEL.gap
  const fits = below + PANEL.height + PANEL.margin <= window.innerHeight
  place.value = {
    left: Math.max(PANEL.margin, Math.min(left, window.innerWidth - PANEL.width - PANEL.margin)),
    top: fits ? below : box.top - PANEL.gap - PANEL.height
  }
}

function toggle(): void {
  if (open.value) {
    close()
    return
  }
  placePanel()
  open.value = true
  window.addEventListener('pointerdown', onPointerDown, true)
  void nextTick(() => field.value?.focus())
}

function pick(hex: string): void {
  close()
  emit('pick', hex)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // Échap ne va pas plus loin : il ferme le volet, pas la sélection de l'éditeur.
  event.preventDefault()
  event.stopPropagation()
  close()
  button.value?.focus()
}

onUnmounted(close)
</script>

<template>
  <button
    ref="button"
    type="button"
    class="color-adder"
    :class="{ open }"
    :title="title"
    :aria-expanded="open"
    @click="toggle"
  >
    +
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      class="color-adder-panel"
      :style="{ left: `${place.left}px`, top: `${place.top}px` }"
      @keydown="onKeyDown"
    >
      <ColorField ref="field" :value="value" @change="pick" />
    </div>
  </Teleport>
</template>

<style scoped>
/* Une pastille de plus, en pointillés ; sa taille suit celle des pastilles voisines. */
.color-adder {
  flex: none;
  width: var(--color-adder-size, 18px);
  height: var(--color-adder-size, 18px);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px dashed var(--text-faint);
  border-radius: 50%;
  background: transparent;
  font-size: 12px;
  line-height: 1;
  color: var(--text-muted);
}

.color-adder.open {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent);
}

.color-adder-panel {
  position: fixed;
  z-index: 60;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px var(--shadow);
}
</style>
