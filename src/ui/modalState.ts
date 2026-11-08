import { ref } from 'vue'

/** Nombre de boîtes de dialogue ouvertes : les éditeurs suspendent leurs raccourcis tant qu'il y en a. */
export const openModals = ref(0)
