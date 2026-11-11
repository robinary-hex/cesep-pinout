<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/ui/Icon.vue'
import ModalDialog from '@/ui/ModalDialog.vue'
import { comboTokens, SHORTCUT_SECTIONS } from './shortcuts'

// Aide : les raccourcis d'un éditeur à la fois, celui qu'on regarde d'abord ; des onglets, dans
// l'ordre et au nom des boutons de mode, mènent aux autres. Le contenu est dans shortcuts.ts ;
// ici, on le dessine : thèmes en colonnes, une touche par capuchon, la souris en pictogramme.
// Les trois planches sont toutes là, une seule visible : la boîte a la taille de la plus haute
// et rien ne bouge quand on change d'onglet.

/** `initial` : titre de la section montrée à l'ouverture (le nom du mode affiché). */
const props = defineProps<{ initial?: string }>()
const emit = defineEmits<{ close: [] }>()

/** Section montrée : celle demandée à l'ouverture, sinon la première. */
const current = ref(
  SHORTCUT_SECTIONS.find((section) => section.title === props.initial)?.title ??
    SHORTCUT_SECTIONS[0]?.title ??
    ''
)

/** Le sens des touches de modification, le même dans les trois éditeurs. */
const MODIFIERS: [string, string][] = [
  ['Maj', 'ajoute, ou varie un tracé'],
  ['Alt', 'copie'],
  ['Ctrl', 'saisit le point le plus proche']
]
</script>

<template>
  <ModalDialog title="Raccourcis clavier" large @close="emit('close')">
    <div class="top">
      <nav class="tabs">
        <button
          v-for="section in SHORTCUT_SECTIONS"
          :key="section.title"
          type="button"
          class="with-icon"
          :class="{ active: section.title === current }"
          @click="current = section.title"
        >
          <Icon :name="section.icon" :size="16" />
          {{ section.title }}
        </button>
      </nav>
      <ul class="modifiers">
        <li v-for="[key, meaning] in MODIFIERS" :key="key">
          <kbd>{{ key }}</kbd>
          {{ meaning }}
        </li>
      </ul>
    </div>

    <div class="sheets">
      <div
        v-for="section in SHORTCUT_SECTIONS"
        :key="section.title"
        class="sheet"
        :class="{ shown: section.title === current }"
        :aria-hidden="section.title !== current"
      >
        <div class="columns">
          <section v-for="category in section.categories" :key="category.title" class="category">
            <h3>{{ category.title }}</h3>
            <div v-for="(row, index) in category.rows" :key="index" class="row">
              <div class="keys">
                <template v-for="(combo, rank) in row.keys" :key="combo">
                  <span v-if="rank > 0" class="joint">ou</span>
                  <span class="combo">
                    <template v-for="(token, place) in comboTokens(combo)" :key="place">
                      <span v-if="place > 0" class="joint">+</span>
                      <span v-if="token.mouse" class="mouse">
                        <svg
                          class="glyph"
                          viewBox="0 0 20 20"
                          width="16"
                          height="16"
                          aria-hidden="true"
                        >
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
                          <path
                            class="outline"
                            d="M5 7a5 5 0 0 1 10 0v6a5 5 0 0 1-10 0z M5 9.5h10 M10 2v7.5"
                          />
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
                          <path
                            v-if="token.mouse.double"
                            class="motion"
                            d="M1.6 4.6l2 1.2 M4 1.2l1.2 2"
                          />
                        </svg>
                        {{ token.text }}
                      </span>
                      <kbd v-else>{{ token.text }}</kbd>
                    </template>
                  </span>
                </template>
              </div>
              <div class="does">
                <span class="label">{{ row.label }}</span>
                <span v-if="row.withShift" class="more">
                  <kbd>Maj</kbd>
                  {{ row.withShift }}
                </span>
              </div>
              <Icon v-if="row.icon" :name="row.icon" :size="15" />
            </div>
          </section>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex: none;
  margin-bottom: 14px;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tabs button.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.modifiers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text-muted);
}

/* Les planches des trois modes sont superposées dans la même case : la boîte prend la taille de
   la plus haute et n'en change pas d'un onglet à l'autre. Chacune défile pour elle-même, sous
   les onglets qui restent en place, et garde la place de son ascenseur qu'il y en ait un ou
   non (`scrollbar-gutter`) : le contenu a la même largeur partout, rien ne saute. Cette place
   est prise sur la marge droite de la boîte, pour que les cadres y restent centrés. */
.sheets {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  margin-right: calc(-1 * var(--scrollbar-size));
}

.sheet {
  grid-area: 1 / 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  visibility: hidden;
}

.sheet.shown {
  visibility: visible;
}

/* Thèmes en colonnes : trois dans la boîte large, deux ou une quand la fenêtre est plus
   étroite. Une colonne ne descend pas sous la largeur où chaque raccourci tient sur sa ligne. */
.columns {
  columns: 3 392px;
  column-gap: 14px;
}

.category {
  break-inside: avoid;
  margin: 0 0 14px;
  padding: 8px 10px 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.category h3 {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

/* Un raccourci, une ligne : le geste à gauche, dans une colonne étroite, ce qu'il fait au
   milieu, le pictogramme de l'action au bout. Le même partage dans tous les thèmes : les
   libellés s'alignent d'un cadre à l'autre. Rien ne passe à la ligne. */
.row {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr) 16px;
  column-gap: 10px;
  align-items: center;
  padding: 3px 0;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
}

.row + .row {
  border-top: 1px solid var(--border-soft);
}

.keys {
  display: flex;
  align-items: center;
  gap: 4px;
}

.combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.joint {
  font-size: 11px;
  color: var(--text-faint);
}

/* Une touche : un capuchon, plus épais en bas. */
kbd {
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 17px;
  text-align: center;
  white-space: nowrap;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
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
  color: var(--text);
  background: var(--accent-soft);
  border-radius: 10px;
}

.glyph {
  flex: none;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.glyph .shell {
  fill: var(--surface);
}

.glyph .outline {
  stroke: var(--text);
  stroke-width: 1.3;
}

.glyph .pressed,
.glyph .wheel {
  fill: var(--accent);
}

.glyph .motion {
  stroke: var(--accent);
  stroke-width: 1.6;
}

/* Ce que fait le geste : son libellé puis, à la suite et en petit, ce qu'il fait avec Maj. */
.does {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.more {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.more kbd {
  min-width: 0;
  padding: 0 4px;
  font-size: 11px;
  line-height: 15px;
}

/* Pictogramme de l'action, celui de son bouton ou de son entrée de menu. */
.row > .icon {
  color: var(--text-muted);
}
</style>
