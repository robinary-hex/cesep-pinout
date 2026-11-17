<script setup lang="ts">
import { ref } from 'vue'
import { sameColor, startsDocumentColors, type ColorChoice } from '@/domain'
import ColorAdder from './ColorAdder.vue'
import ColorPopover from './ColorPopover.vue'
import ContextMenu from './ContextMenu.vue'
import { heading, item, type MenuItem } from './contextMenu'

// Palette d'une barre d'outils (montage, diagramme) : une pastille par couleur proposée, puis le
// « + » qui en ajoute une au document ; un trait sépare les couleurs de l'application de celles
// du document (`data-first-own`, dessiné par style.css). Un clic choisit la couleur ; un clic
// droit ouvre un menu
// qui la modifie (un petit volet avec le champ de couleur, sous la pastille) ou la supprime
// (décision du 17 novembre 2026). La palette ne sait rien des documents : elle dit ce qu'on lui
// demande, et l'éditeur fait le reste.

const props = defineProps<{
  swatches: readonly ColorChoice[]
  /** Couleur courante : sa pastille est entourée. */
  current: string
  /** Infobulle du « + ». */
  adderTitle: string
  /** Nom de la palette de l'application, dans le menu : « Palette des fils ». */
  paletteName: string
  /** Nom d'une couleur propre au document, dans le menu : « Couleur de ce montage ». */
  customName: string
}>()
const emit = defineEmits<{
  pick: [hex: string]
  add: [hex: string]
  /** La couleur d'une pastille est remplacée par une autre. */
  change: [hex: string, next: string]
  remove: [hex: string]
}>()

type Anchor = { left: number; top: number; width: number; height: number }

const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)
/** Pastille dont on modifie la couleur, et où elle est : le volet se met dessous. */
const editing = ref<{ hex: string; anchor: Anchor } | null>(null)

function openMenu(swatch: ColorChoice, event: MouseEvent): void {
  event.preventDefault()
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const anchor: Anchor = { left: box.left, top: box.top, width: box.width, height: box.height }
  // La palette de l'application garde au moins une couleur.
  const last = !swatch.custom && props.swatches.filter((entry) => !entry.custom).length <= 1
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    items: [
      heading(swatch.custom ? props.customName : `${props.paletteName} : ${swatch.name}`),
      item(
        'Modifier…',
        () => {
          editing.value = { hex: swatch.hex, anchor }
        },
        { icon: 'edit' }
      ),
      item('Supprimer', () => emit('remove', swatch.hex), {
        icon: 'trash',
        danger: true,
        disabled: last
      })
    ]
  }
}

function change(next: string): void {
  const current = editing.value
  editing.value = null
  if (current) emit('change', current.hex, next)
}
</script>

<template>
  <div class="palette">
    <button
      v-for="(swatch, index) in swatches"
      :key="swatch.hex"
      type="button"
      class="swatch"
      :data-first-own="startsDocumentColors(swatches, index) || undefined"
      :class="{ current: sameColor(swatch.hex, current) }"
      :style="{ background: swatch.hex }"
      :title="swatch.name"
      @click="emit('pick', swatch.hex)"
      @contextmenu="openMenu(swatch, $event)"
    />
    <ColorAdder :value="current" :title="adderTitle" @pick="emit('add', $event)" />
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" @close="menu = null" />
    <ColorPopover
      v-if="editing"
      :anchor="editing.anchor"
      :value="editing.hex"
      @pick="change"
      @close="editing = null"
    />
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  align-items: center;
  gap: 3px;
}

.swatch {
  flex: none;
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
