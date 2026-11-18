<script setup lang="ts">
import { computed } from 'vue'
import { comboTokens } from './keyCombo'

// Une combinaison dessinée : une touche par capuchon, un geste de souris par pastille, avec la
// souris et son bouton enfoncé. L'aide (F1) et les infobulles s'en servent toutes deux. Ses
// couleurs se règlent de l'extérieur (`--key-*`, `--mouse-*`), pour une infobulle sombre.

const props = defineProps<{ combo: string }>()
const tokens = computed(() => comboTokens(props.combo))
</script>

<template>
  <span class="combo">
    <template v-for="(token, place) in tokens" :key="place">
      <span v-if="place > 0" class="joint">+</span>
      <span v-if="token.mouse" class="mouse">
        <svg class="glyph" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path class="shell" d="M5 7a5 5 0 0 1 10 0v6a5 5 0 0 1-10 0z" />
          <path
            v-if="token.mouse.button === 'left'"
            class="pressed"
            d="M10 2a5 5 0 0 0-5 5v2.5h5z"
          />
          <path
            v-if="token.mouse.button === 'right'"
            class="pressed"
            d="M10 2a5 5 0 0 1 5 5v2.5h-5z"
          />
          <path class="outline" d="M5 7a5 5 0 0 1 10 0v6a5 5 0 0 1-10 0z M5 9.5h10 M10 2v7.5" />
          <path
            v-if="token.mouse.button === 'middle' || token.mouse.button === 'wheel'"
            class="wheel"
            d="M8.5 4.6a1.5 1.5 0 0 1 3 0v2.4a1.5 1.5 0 0 1-3 0z"
          />
          <path
            v-if="token.mouse.drag"
            class="motion"
            d="M17 7.5l2.2 2.5-2.2 2.5 M3 7.5l-2.2 2.5 2.2 2.5"
          />
          <path
            v-if="token.mouse.button === 'wheel'"
            class="motion"
            d="M16.4 7.2l1.6-2 1.6 2 M16.4 12.8l1.6 2 1.6-2"
          />
          <path v-if="token.mouse.double" class="motion" d="M1.6 4.6l2 1.2 M4 1.2l1.2 2" />
        </svg>
        {{ token.text }}
      </span>
      <kbd v-else class="keycap">{{ token.text }}</kbd>
    </template>
  </span>
</template>

<style scoped>
.combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.joint {
  font-size: 11px;
  color: var(--key-joint, var(--text-faint));
}

/* Un geste de souris : une pastille, avec la souris et son bouton enfoncé. */
.mouse {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 8px 0 3px;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  color: var(--key-text, var(--text));
  background: var(--mouse-bg, var(--accent-soft));
  border-radius: 10px;
}

.glyph {
  flex: none;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.glyph .shell {
  fill: var(--mouse-shell, var(--surface));
}

.glyph .outline {
  stroke: var(--key-text, var(--text));
  stroke-width: 1.3;
}

.glyph .pressed,
.glyph .wheel {
  fill: var(--mouse-accent, var(--accent));
}

.glyph .motion {
  stroke: var(--mouse-accent, var(--accent));
  stroke-width: 1.6;
}
</style>
