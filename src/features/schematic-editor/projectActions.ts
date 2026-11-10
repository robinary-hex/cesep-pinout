import { FileFormatError } from '@/domain'
import type { useLibraryStore } from '@/features/library/store'
import { syncAutosaves } from '@/io/autosave'
import { dirOf } from '@/io/paths'
import { chooseProjectToSave, writeProject } from '@/io/projectFiles'
import { askToSave } from '@/ui/dialogs'
import type { useSchematicStore } from './store'

// Enregistrement du montage, partagé par l'éditeur (Ctrl+S, menu Fichier), la fermeture d'un
// onglet et la garde à la fermeture (« Enregistrer » avant de quitter).

type SchematicStore = ReturnType<typeof useSchematicStore>
type LibraryStore = ReturnType<typeof useLibraryStore>

export function describeError(error: unknown): string {
  if (error instanceof FileFormatError) return [error.message, ...error.issues].join(' — ')
  return error instanceof Error ? error.message : String(error)
}

/**
 * Enregistre le montage ; demande un chemin s'il n'en a pas (ou si `as`). Vrai si le fichier
 * est écrit, faux si l'utilisateur renonce ou si l'écriture échoue (le statut l'explique).
 */
export async function saveProject(
  store: SchematicStore,
  library: LibraryStore,
  as = false
): Promise<boolean> {
  let path = store.filePath
  if (as || path === null) {
    // Dossier proposé : celui du projet s'il en a un, sinon celui du dernier projet enregistré ou ouvert.
    const dir = path ? dirOf(path) : library.lastProjectDir
    path = await chooseProjectToSave(store.doc.name, dir)
    if (path === null) return false
  }
  try {
    await writeProject(path, store.doc)
    store.markSaved(path)
    store.status = `Enregistré : ${path}`
    // La copie de secours de ce montage n'a plus lieu d'être ; celles des autres onglets restent.
    await syncAutosaves(store.dirtyDocuments())
    await library.addRecentFile(path)
    return true
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${describeError(error)}`
    return false
  }
}

/**
 * Ferme un onglet. S'il a des modifications, la question est posée d'abord : Enregistrer (le
 * montage est affiché, puis enregistré ; renoncer au choix du fichier garde l'onglet), Ne pas
 * enregistrer, ou Annuler. Vrai si l'onglet est fermé.
 */
export async function closeTabAsking(
  store: SchematicStore,
  library: LibraryStore,
  id: number
): Promise<boolean> {
  const tab = store.tabs.find((candidate) => candidate.id === id)
  if (!tab) return false
  if (tab.dirty) {
    const choice = await askToSave(tab.name)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      // L'enregistrement porte sur le montage affiché : on montre d'abord celui qu'on ferme.
      store.activateTab(id)
      if (!(await saveProject(store, library))) return false
    }
  }
  store.closeTab(id)
  // La copie de secours d'un montage abandonné disparaît avec son onglet.
  await syncAutosaves(store.dirtyDocuments())
  return true
}
