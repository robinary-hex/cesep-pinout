<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import KeyCombo from './KeyCombo.vue'
import { tipContent, tipPlace, type ScreenBox, type TipContent } from './tooltip'

// Infobulles de toute l'application (décision du 18 novembre 2026), à la place de celles de
// Windows : une petite boîte sombre aux coins arrondis, le texte puis son raccourci dessiné, une
// touche par capuchon. Montée une seule fois par la coque, elle écoute toute la fenêtre : rien
// n'est à brancher dans les composants, qui écrivent leur infobulle dans `title` comme toujours
// (`data-tip` sur un élément SVG).
//
// Tant qu'un élément porte `title`, Windows montre la sienne. Le temps du survol, le `title` de
// l'élément et de ses parents est donc mis de côté dans `data-tip`, et rendu en sortant : hors
// du survol, le document est tel que l'application l'a écrit.

/** Temps de survol avant qu'une infobulle se montre ; la suivante vient aussitôt. */
const SHOW_AFTER_MS = 450
const WARM_MS = 400
/** Au-delà de cette taille, l'infobulle se pose près du pointeur plutôt que sous l'élément. */
const WIDE_PX = 360
const TALL_PX = 80

const shown = ref<{ content: TipContent; left: number; top: number; placed: boolean } | null>(null)
const box = ref<HTMLElement | null>(null)

/** L'élément survolé qui a quelque chose à dire, et ceux dont le `title` est mis de côté. */
let target: Element | null = null
const stashed: Element[] = []
let timer: number | undefined
/** Quand une infobulle s'est montrée pour la dernière fois. */
let lastSeen = -Infinity
/** Après un clic ou une touche : plus d'infobulle tant qu'on reste sur le même élément. */
let muted = false
const pointer = { x: 0, y: 0 }
const observer = new MutationObserver(onTitleChanged)

function tipElement(node: EventTarget | null): Element | null {
  return node instanceof Element ? node.closest('[title], [data-tip]') : null
}

/** Met de côté le `title` d'un élément. */
function stash(element: Element): void {
  const title = element.getAttribute('title')
  if (title === null) return
  element.setAttribute('data-tip', title)
  element.removeAttribute('title')
  if (!stashed.includes(element)) stashed.push(element)
}

/** Rend leur `title` aux éléments ; un `title` que l'application a récrit entre-temps reste. */
function restore(): void {
  for (const element of stashed.splice(0)) {
    const tip = element.getAttribute('data-tip')
    if (tip !== null && !element.hasAttribute('title')) element.setAttribute('title', tip)
    element.removeAttribute('data-tip')
  }
}

function hide(): void {
  window.clearTimeout(timer)
  if (shown.value) lastSeen = performance.now()
  shown.value = null
}

function leave(): void {
  hide()
  observer.disconnect()
  restore()
  target = null
}

function enter(element: Element): void {
  leave()
  target = element
  // Tous les `title` de la lignée : celui d'un parent se montrerait à la place du nôtre.
  for (
    let node: Element | null = element;
    node;
    node = node.parentElement?.closest('[title]') ?? null
  ) {
    stash(node)
  }
  observer.observe(element, { attributes: true, attributeFilter: ['title'] })
  if (muted) return
  const warm = performance.now() - lastSeen < WARM_MS
  timer = window.setTimeout(() => void show(), warm ? 0 : SHOW_AFTER_MS)
}

/** Montre l'infobulle de l'élément survolé : d'abord hors de vue, pour la mesurer, puis à sa place. */
async function show(): Promise<void> {
  const element = target
  if (!element) return
  if (!element.isConnected) {
    leave()
    return
  }
  const content = tipContent(element.getAttribute('data-tip') ?? '')
  if (content.text === '' && content.combos.length === 0) {
    hide()
    return
  }
  shown.value = { content, left: 0, top: 0, placed: false }
  await nextTick()
  if (target !== element || !box.value || !shown.value) return
  const rect = element.getBoundingClientRect()
  const size = box.value.getBoundingClientRect()
  // Un grand élément (une ligne de liste, un trait sur la feuille) : près du pointeur.
  const anchor: ScreenBox =
    rect.width > WIDE_PX || rect.height > TALL_PX
      ? { left: pointer.x, right: pointer.x, top: pointer.y - 6, bottom: pointer.y + 14 }
      : rect
  const place = tipPlace(anchor, size, { width: window.innerWidth, height: window.innerHeight })
  shown.value = { content, ...place, placed: true }
}

/**
 * L'application a changé le `title` de l'élément survolé : un nouveau texte (le bouton qui dit
 * autre chose après son clic) est repris ; retiré (Vue le vide puis l'enlève), il n'y a plus
 * rien à dire.
 */
function onTitleChanged(): void {
  const element = target
  if (!element) return
  if (element.hasAttribute('title')) {
    stash(element)
    // Ce qu'on vient de faire n'est pas un changement de l'application.
    observer.takeRecords()
    if (shown.value) void show()
    return
  }
  element.removeAttribute('data-tip')
  const rank = stashed.indexOf(element)
  if (rank >= 0) stashed.splice(rank, 1)
  hide()
}

function onPointerOver(event: PointerEvent): void {
  pointer.x = event.clientX
  pointer.y = event.clientY
  if (event.pointerType === 'touch') return
  const element = tipElement(event.target)
  if (element === target) return
  muted = false
  // Pendant un geste (bouton enfoncé), rien ne se montre.
  if (element && event.buttons === 0) enter(element)
  else leave()
}

function onPointerOut(event: PointerEvent): void {
  // Sorti de la fenêtre : plus rien n'est survolé.
  if (event.relatedTarget === null) leave()
}

function onPointerMove(event: PointerEvent): void {
  pointer.x = event.clientX
  pointer.y = event.clientY
  // L'élément survolé a disparu (un bouton que son propre clic retire).
  if (target && !target.isConnected) leave()
}

/** Un clic, une touche, la molette : l'infobulle s'efface et ne revient pas sur cet élément. */
function silence(): void {
  hide()
  muted = true
}

onMounted(() => {
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
  document.addEventListener('pointerdown', silence, true)
  document.addEventListener('keydown', silence, true)
  document.addEventListener('wheel', silence, { capture: true, passive: true })
  document.addEventListener('scroll', silence, true)
  document.addEventListener('dragstart', silence, true)
  window.addEventListener('blur', leave)
})

onBeforeUnmount(() => {
  leave()
  document.removeEventListener('pointerover', onPointerOver, true)
  document.removeEventListener('pointerout', onPointerOut, true)
  document.removeEventListener('pointermove', onPointerMove, true)
  document.removeEventListener('pointerdown', silence, true)
  document.removeEventListener('keydown', silence, true)
  document.removeEventListener('wheel', silence, true)
  document.removeEventListener('scroll', silence, true)
  document.removeEventListener('dragstart', silence, true)
  window.removeEventListener('blur', leave)
})
</script>

<template>
  <div
    v-if="shown"
    ref="box"
    class="tooltip"
    :class="{ placed: shown.placed }"
    role="tooltip"
    :style="{ left: `${shown.left}px`, top: `${shown.top}px` }"
  >
    <span v-if="shown.content.text" class="tip-text">{{ shown.content.text }}</span>
    <span v-if="shown.content.combos.length > 0" class="tip-keys">
      <template v-for="(combo, rank) in shown.content.combos" :key="combo">
        <span v-if="rank > 0" class="or">ou</span>
        <KeyCombo :combo="combo" />
      </template>
    </span>
  </div>
</template>

<style scoped>
/* Une boîte sombre aux coins arrondis, au-dessus de tout (boîtes de dialogue et menus compris),
   qui ne prend jamais le pointeur. Les touches s'y dessinent en clair sur fond sombre. */
.tooltip {
  position: fixed;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  color: var(--tip-text);
  background: var(--tip-bg);
  border: 1px solid var(--tip-border);
  border-radius: 7px;
  box-shadow: 0 4px 14px var(--shadow-strong);
  pointer-events: none;
  visibility: hidden;
  --key-text: var(--tip-text);
  --key-bg: var(--tip-key-bg);
  --key-border: var(--tip-key-border);
  --key-joint: var(--tip-muted);
  --mouse-bg: var(--tip-key-bg);
  --mouse-shell: transparent;
  --mouse-accent: var(--tip-accent);
}

.tooltip.placed {
  visibility: visible;
}

.tip-keys {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.or {
  font-size: 11px;
  color: var(--tip-muted);
}
</style>
