import type { useLibraryStore } from '@/features/library/store'
import { newComponentId, saveComponent } from '@/io/library'
import { askToSave } from '@/ui/dialogs'
import type { useComponentEditorStore } from './store'

// Enregistrement du composant en cours d'édition, partagé par l'éditeur (Ctrl+S, menu Fichier),
// la fermeture d'un onglet et la garde à la fermeture de l'application.

type EditorStore = ReturnType<typeof useComponentEditorStore>
type LibraryStore = ReturnType<typeof useLibraryStore>

/** Enregistre le composant dans la bibliothèque ; faux si c'est impossible (le statut l'explique). */
export async function saveComponentDoc(
  store: EditorStore,
  library: LibraryStore
): Promise<boolean> {
  if (store.hasErrors) {
    // Les erreurs sont dans le panneau, sous le composant : on le montre, sans forme sélectionnée.
    store.selection = null
    store.inspectorOpen = true
    store.status = 'Corrige les erreurs listées à droite avant d’enregistrer.'
    return false
  }
  if (library.libraryDir.length === 0) {
    store.status = 'Bibliothèque indisponible : choisis un dossier dans le panneau de gauche.'
    return false
  }
  if (store.folder === null) {
    store.setId(newComponentId(store.doc.name, library.ids))
  }
  try {
    const folder = await saveComponent(library.libraryDir, store.doc)
    store.markSaved(folder)
    store.status = `Enregistré dans ${folder}`
    await library.refresh()
    return true
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${error instanceof Error ? error.message : String(error)}`
    return false
  }
}

/**
 * Ferme un onglet de composant. S'il a des modifications, la question est posée d'abord :
 * Enregistrer (le composant est affiché, puis enregistré ; un échec garde l'onglet), Ne pas
 * enregistrer, ou Annuler. Vrai si l'onglet est fermé.
 */
export async function closeComponentTabAsking(
  store: EditorStore,
  library: LibraryStore,
  id: number
): Promise<boolean> {
  const tab = store.tabs.find((candidate) => candidate.id === id)
  if (!tab) return false
  if (tab.dirty) {
    const choice = await askToSave(tab.name)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      store.activateTab(id)
      if (!(await saveComponentDoc(store, library))) return false
    }
  }
  store.closeTab(id)
  return true
}
