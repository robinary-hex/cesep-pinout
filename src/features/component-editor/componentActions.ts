import type { useLibraryStore } from '@/features/library/store'
import { newComponentId, saveComponent } from '@/io/library'
import type { useComponentEditorStore } from './store'

// Enregistrement du composant en cours d'édition, partagé par l'éditeur (Ctrl+S, menu Fichier)
// et par la garde à la fermeture.

type EditorStore = ReturnType<typeof useComponentEditorStore>
type LibraryStore = ReturnType<typeof useLibraryStore>

/** Enregistre le composant dans la bibliothèque ; faux si c'est impossible (le statut l'explique). */
export async function saveComponentDoc(
  store: EditorStore,
  library: LibraryStore
): Promise<boolean> {
  if (store.hasErrors) {
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
