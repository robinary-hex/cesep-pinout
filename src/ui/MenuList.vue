<script setup lang="ts">
import type { MenuItem } from './contextMenu'
import Icon from './Icon.vue'

// Entrées d'un menu (ou d'un sous-menu) : titres, séparateurs, pastilles de couleur, actions et
// entrées qui ouvrent un sous-menu. `ContextMenu` place les panneaux ; ici, seulement la liste.

type Entry = Extract<MenuItem, { kind: 'item' }>
type Swatches = Extract<MenuItem, { kind: 'swatches' }>

defineProps<{
  items: MenuItem[]
  /** Index de l'entrée dont le sous-menu est ouvert, pour la garder allumée. */
  openIndex?: number | null
}>()
const emit = defineEmits<{
  run: [entry: Entry]
  pick: [entry: Swatches, hex: string]
  /** Le pointeur entre sur une entrée (ou on clique une entrée à sous-menu). */
  enter: [index: number, element: HTMLElement | null]
}>()

function elementOf(event: Event): HTMLElement | null {
  return event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}
</script>

<template>
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
        @click="emit('pick', entry, swatch.hex)"
      />
    </div>
    <button
      v-else-if="entry.kind === 'submenu'"
      type="button"
      class="entry parent"
      :class="{ open: openIndex === index }"
      :disabled="entry.disabled"
      role="menuitem"
      aria-haspopup="menu"
      :aria-expanded="openIndex === index"
      @pointerenter="emit('enter', index, elementOf($event))"
      @click="emit('enter', index, elementOf($event))"
    >
      <span class="check">
        <Icon v-if="entry.icon" :name="entry.icon" :size="15" />
      </span>
      <span class="label">{{ entry.label }}</span>
      <Icon name="chevron-down" :size="12" class="more" />
    </button>
    <button
      v-else
      type="button"
      class="entry"
      :class="{ danger: entry.danger }"
      :disabled="entry.disabled"
      role="menuitem"
      @pointerenter="emit('enter', index, null)"
      @click="emit('run', entry)"
    >
      <span class="check">
        <Icon v-if="entry.checked" name="check" :size="13" class="checked" />
        <Icon v-else-if="entry.icon" :name="entry.icon" :size="15" />
      </span>
      <span class="label">{{ entry.label }}</span>
      <kbd v-if="entry.hint">{{ entry.hint }}</kbd>
    </button>
  </template>
</template>

<style scoped>
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

.entry:hover:not(:disabled),
.entry.open {
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

/* Chevron d'une entrée à sous-menu : il pointe vers le panneau qui s'ouvre à droite. */
.more {
  flex: none;
  color: var(--text-muted);
  transform: rotate(-90deg);
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
