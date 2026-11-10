<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { MenuItem } from './contextMenu'
import MenuList from './MenuList.vue'
import { openModals } from './modalState'

// Menu contextuel flottant, ancré à la position du clic et ramené dans la fenêtre au besoin.
// Une entrée peut ouvrir un sous-menu (un seul niveau), à sa droite, ou à sa gauche faute de place.
// Il se ferme sur un clic ailleurs, Échap, la molette, un redimensionnement ou la perte du focus.
// Tant qu'il est ouvert, les éditeurs ignorent leurs raccourcis (openModals).

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ close: [] }>()

type Entry = Extract<MenuItem, { kind: 'item' }>
type Swatches = Extract<MenuItem, { kind: 'swatches' }>

/** Délai avant de refermer un sous-menu qu'on quitte : le temps de le rejoindre en biais. */
const SUB_CLOSE_MS = 180
/** Le sous-menu chevauche un peu son entrée, pour qu'on y passe sans quitter le menu. */
const SUB_OVERLAP_PX = 3

const root = ref<HTMLDivElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)
const subMenu = ref<HTMLDivElement | null>(null)
const left = ref(props.x)
const top = ref(props.y)
/** Sous-menu ouvert : l'entrée qui l'ouvre, ses entrées, sa place à l'écran. */
const sub = ref<{ index: number; items: MenuItem[]; left: number; top: number } | null>(null)
let closing: ReturnType<typeof setTimeout> | null = null

function run(entry: Entry): void {
  if (entry.disabled) return
  emit('close')
  entry.action()
}

function pick(entry: Swatches, hex: string): void {
  emit('close')
  entry.pick(hex)
}

function keepSub(): void {
  if (closing) clearTimeout(closing)
  closing = null
}

/**
 * Le pointeur entre sur une entrée du menu principal. Une entrée à sous-menu l'ouvre à côté
 * d'elle ; une autre referme celui qui était ouvert, après un instant.
 */
async function onEnter(index: number, element: HTMLElement | null): Promise<void> {
  const entry = props.items[index]
  if (!entry || entry.kind !== 'submenu' || entry.disabled || !element) {
    if (sub.value && !closing) {
      closing = setTimeout(() => {
        sub.value = null
        closing = null
      }, SUB_CLOSE_MS)
    }
    return
  }
  keepSub()
  if (sub.value?.index === index) return
  const rect = element.getBoundingClientRect()
  sub.value = {
    index,
    items: entry.items,
    left: rect.right - SUB_OVERLAP_PX,
    top: rect.top - 5
  }
  await nextTick()
  const panel = subMenu.value
  const current = sub.value
  if (!panel || !current || current.index !== index) return
  const size = panel.getBoundingClientRect()
  const fitsRight = rect.right - SUB_OVERLAP_PX + size.width <= window.innerWidth - 4
  sub.value = {
    ...current,
    left: fitsRight
      ? rect.right - SUB_OVERLAP_PX
      : Math.max(4, rect.left - size.width + SUB_OVERLAP_PX),
    top: Math.max(4, Math.min(rect.top - 5, window.innerHeight - size.height - 4))
  }
}

function isInside(target: EventTarget | null): boolean {
  return target instanceof Node && root.value !== null && root.value.contains(target)
}

function onPointerDown(event: PointerEvent): void {
  if (!isInside(event.target)) emit('close')
}

function onWheel(event: WheelEvent): void {
  if (!isInside(event.target)) emit('close')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  }
}

function close(): void {
  emit('close')
}

onMounted(async () => {
  openModals.value++
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('wheel', onWheel, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  await nextTick()
  const element = menu.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  left.value = Math.max(4, Math.min(props.x, window.innerWidth - rect.width - 4))
  top.value = Math.max(4, Math.min(props.y, window.innerHeight - rect.height - 4))
})

onUnmounted(() => {
  keepSub()
  openModals.value--
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('wheel', onWheel, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="menu-root" @contextmenu.prevent>
      <div
        ref="menu"
        class="context-menu"
        role="menu"
        :style="{ left: `${left}px`, top: `${top}px` }"
      >
        <MenuList
          :items="items"
          :open-index="sub?.index ?? null"
          @run="run"
          @pick="pick"
          @enter="onEnter"
        />
      </div>
      <div
        v-if="sub"
        ref="subMenu"
        class="context-menu sub-menu"
        role="menu"
        :style="{ left: `${sub.left}px`, top: `${sub.top}px` }"
        @pointerenter="keepSub"
      >
        <MenuList :items="sub.items" @run="run" @pick="pick" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  max-width: 320px;
  padding: 4px 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px var(--shadow);
  font-size: 13px;
  user-select: none;
}

.context-menu.sub-menu {
  z-index: 61;
  min-width: 180px;
}
</style>
