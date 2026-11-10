import type { useLibraryStore } from '@/features/library/store'
import { describeError } from '@/features/schematic-editor/projectActions'
import { syncDiagramAutosaves } from '@/io/autosave'
import { chooseDiagramToSave, isDiagramPath, writeDiagram } from '@/io/diagramFiles'
import { dirOf } from '@/io/paths'
import { askToSave } from '@/ui/dialogs'
import type { useDiagramStore } from './store'

// Enregistrement d'un diagramme, partagé par l'éditeur (Ctrl+S, menu Fichier), la fermeture d'un
// onglet et la garde à la fermeture de l'application.

type DiagramStore = ReturnType<typeof useDiagramStore>
type LibraryStore = ReturnType<typeof useLibraryStore>

/** Dossier proposé pour un diagramme : celui du dernier diagramme enregistré ou ouvert. */
export function lastDiagramDir(library: LibraryStore): string | null {
  const last = library.recentFiles.find(isDiagramPath)
  return last ? dirOf(last) : library.lastProjectDir
}

/**
 * Enregistre le diagramme ; demande un chemin s'il n'en a pas (ou si `as`). Vrai si le fichier
 * est écrit, faux si l'utilisateur renonce ou si l'écriture échoue (le statut l'explique).
 */
export async function saveDiagram(
  store: DiagramStore,
  library: LibraryStore,
  as = false
): Promise<boolean> {
  let path = store.filePath
  if (as || path === null) {
    path = await chooseDiagramToSave(store.doc.name, path ? dirOf(path) : lastDiagramDir(library))
    if (path === null) return false
  }
  try {
    await writeDiagram(path, store.doc)
    store.markSaved(path)
    store.status = `Enregistré : ${path}`
    // La copie de secours de ce diagramme n'a plus lieu d'être ; celles des autres restent.
    await syncDiagramAutosaves(store.dirtyDocuments())
    await library.addRecentFile(path)
    return true
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${describeError(error)}`
    return false
  }
}

/**
 * Ferme un onglet. S'il a des modifications, la question est posée d'abord : Enregistrer (le
 * diagramme est affiché, puis enregistré ; renoncer au choix du fichier garde l'onglet), Ne pas
 * enregistrer, ou Annuler. Vrai si l'onglet est fermé.
 */
export async function closeDiagramTabAsking(
  store: DiagramStore,
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
      if (!(await saveDiagram(store, library))) return false
    }
  }
  store.closeTab(id)
  await syncDiagramAutosaves(store.dirtyDocuments())
  return true
}
