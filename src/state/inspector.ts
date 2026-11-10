import { computed, ref, watch, type ComputedRef, type WritableComputedRef } from 'vue'

export interface InspectorPanel {
  /** Vrai quand le panneau est à l'écran. L'écrire l'ouvre pour de bon (vrai) ou le ferme (faux). */
  open: WritableComputedRef<boolean>
  /**
   * Vrai quand c'est une sélection qui le montre : il flotte alors sur le bord de la zone de
   * dessin, sans rien déplacer. Ouvert pour de bon, il prend sa place à côté du canevas.
   */
  floating: ComputedRef<boolean>
  /** À appeler quand un clic vient de sélectionner un élément. */
  reveal: () => void
}

/**
 * Panneau de propriétés d'un éditeur, le même dans les trois (décision du 11 novembre 2026).
 * Replié au départ. La touche I, le bouton de la barre d'outils, le menu contextuel ou la croix
 * du panneau l'ouvrent pour de bon ou le ferment. Avec le paramètre « ouvrir à la sélection »,
 * un clic sur un élément le montre aussi : il se referme alors de lui-même dès que plus rien
 * n'est sélectionné, sauf si on l'avait ouvert soi-même. Montré par une sélection, il flotte
 * par-dessus le bord droit de la zone de dessin : le canevas ne change pas de taille à chaque
 * clic, et la feuille centrée de l'éditeur de composants ne glisse pas sous le pointeur.
 */
export function useInspectorPanel(options: {
  hasSelection: () => boolean
  autoOpen: () => boolean
}): InspectorPanel {
  /** Ouvert par l'utilisateur : il reste, sélection ou pas. */
  const pinned = ref(false)
  /** Montré par un clic sur un élément : il ne dure que le temps de la sélection. */
  const peeking = ref(false)

  // Tout de suite, pas au prochain rendu : un clic qui change de sélection la vide puis la remplit,
  // et `reveal` suit dans le même geste.
  watch(
    options.hasSelection,
    (selected) => {
      if (!selected) peeking.value = false
    },
    { flush: 'sync' }
  )

  const open = computed({
    get: () => pinned.value || peeking.value,
    set: (value: boolean) => {
      pinned.value = value
      if (!value) peeking.value = false
    }
  })

  const floating = computed(() => peeking.value && !pinned.value)

  function reveal(): void {
    if (options.autoOpen() && !pinned.value) peeking.value = options.hasSelection()
  }

  return { open, floating, reveal }
}
