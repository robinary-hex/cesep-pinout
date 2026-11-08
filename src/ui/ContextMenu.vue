<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { MenuItem } from './contextMenu'
import Icon from './Icon.vue'
import { openModals } from './modalState'

// Menu contextuel flottant, ancré à la position du clic et ramené dans la fenêtre au besoin.
// Il se ferme sur un clic ailleurs, Échap, la molette, un redimensionnement ou la perte du focus.
// Tant qu'il est ouvert, les éditeurs ignorent leurs raccourcis (openModals).

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ close: [] }>()

const menu = ref<HTMLDivElement | null>(null)
const left = ref(props.x)
const top = ref(props.y)

function run(entry: Extract<MenuItem, { kind: 'item' }>): void {
  if (entry.disabled) return
  emit('close')
  entry.action()
}

function pick(entry: Extract<MenuItem, { kind: 'swatches' }>, hex: string): void {
  emit('close')
  entry.pick(hex)
}

function isInside(target: EventTarget | null): boolean {
  return target instanceof Node && menu.value !== null && menu.value.contains(target)
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
    <div
      ref="menu"
      class="context-menu"
      role="menu"
      :style="{ left: `${left}px`, top: `${top}px` }"
      @contextmenu.prevent
    >
      <template v-for="(entry, index) in items" :key="index">
        <div v-if="entry.kind === 'separator'" class="separator" />
        <div v-else-if="entry.kind === 'heading'" class="heading">{{ entry.label }}</div>
        <div v-else-if="entry.kind === 'swatches'" class="swatches">
          <button
            v-for="swatch in entry.swatches"
            :key="swatch.hex"
            type="button"
            class="swatch"
            :class="{ current: swatch.current }"
            :style="{ background: swatch.hex }"
            :title="swatch.name"
            @click="pick(entry, swatch.hex)"
          />
        </div>
        <button
          v-else
          type="button"
          class="entry"
          :class="{ danger: entry.danger }"
          :disabled="entry.disabled"
          role="menuitem"
          @click="run(entry)"
        >
          <span class="check">
            <Icon v-if="entry.checked" name="check" :size="13" class="checked" />
            <Icon v-else-if="entry.icon" :name="entry.icon" :size="15" />
          </span>
          <span class="label">{{ entry.label }}</span>
          <kbd v-if="entry.hint">{{ entry.hint }}</kbd>
        </button>
      </template>
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

.heading {
  padding: 5px 12px 3px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.separator {
  height: 1px;
  margin: 4px 0;
  background: var(--surface-hover);
}

.entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px 5px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.entry:hover:not(:disabled) {
  background: var(--surface-3);
}

.entry:disabled {
  color: var(--text-faint);
  cursor: default;
}

.entry.danger:not(:disabled) {
  color: var(--danger);
}

.entry.danger:hover:not(:disabled) {
  background: var(--danger-soft);
}

.check {
  width: 16px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.check .checked {
  color: var(--accent);
}

.label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry kbd {
  flex: none;
  padding: 0 5px;
  font-size: 11px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface-2);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 12px 6px;
}

.swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}

.swatch.current {
  box-shadow: 0 0 0 2px var(--accent);
}
</style>
