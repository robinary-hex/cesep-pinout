import { ref, type Ref } from 'vue'

/**
 * Fenêtre étroite (décision du 17 novembre 2026) : en dessous de cette largeur, le panneau latéral
 * (composants, formes) se réduit à une seule colonne de vignettes, pour laisser la place au
 * dessin. La largeur du panneau se règle dans style.css, par la même limite
 * (`@media (max-width: 1100px)`, `--side-panel-width`) ; ici, ce qu'un gabarit doit savoir : la
 * bibliothèque de composants passe alors en vignettes, quel que soit le réglage « liste ou
 * grille ».
 */
export const COMPACT_MAX_WIDTH_PX = 1100

const compact = ref(false)
let watching = false

/**
 * Vrai tant que la fenêtre est étroite ; suit ses changements de largeur. Sans `matchMedia` (les
 * tests), la fenêtre est tenue pour large : un test écrit dans la valeur rendue pour dire le
 * contraire.
 */
export function useCompactLayout(): Ref<boolean> {
  if (!watching && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    watching = true
    const media = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH_PX}px)`)
    compact.value = media.matches
    media.addEventListener('change', (event) => {
      compact.value = event.matches
    })
  }
  return compact
}
