import { FileFormatError } from '@/domain'
import type { useLibraryStore } from '@/features/library/store'
import { clearAutosave } from '@/io/autosave'
import { dirOf } from '@/io/paths'
import { chooseProjectToSave, writeProject } from '@/io/projectFiles'
import type { useSchematicStore } from './store'

// Enregistrement du montage, partagé par l'éditeur (Ctrl+S, menu Fichier, panneau) et par la
// garde à la fermeture (« Enregistrer » avant de quitter).

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
    await clearAutosave()
    await library.addRecentFile(path)
    return true
  } catch (error) {
    store.status = `Échec de l’enregistrement : ${describeError(error)}`
    return false
  }
}
