import { ref } from 'vue'

/** Nombre de boîtes de dialogue ouvertes : les éditeurs suspendent leurs raccourcis tant qu'il y en a. */
export const openModals = ref(0)

/**
 * Boîtes ouvertes, de la plus ancienne à la plus récente : Échap ne ferme que la dernière, celle
 * qu'on voit au-dessus des autres.
 */
export const modalStack: symbol[] = []
