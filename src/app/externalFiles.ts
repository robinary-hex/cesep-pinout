import type { useComponentEditorStore } from '@/features/component-editor/store'
import type { useDiagramStore } from '@/features/diagram-editor/store'
import type { useLibraryStore } from '@/features/library/store'
import type { useSchematicStore } from '@/features/schematic-editor/store'
import { bridge } from '@/io/bridge'
import { COMPONENT_FILE, loadComponentFile } from '@/io/library'
import { baseName, dirOf, samePath } from '@/io/paths'

// Fichiers venus de l'extérieur : double-clic dans l'explorateur, « Ouvrir avec », fichier déposé
// dans la fenêtre. Leur nature se lit dans leur contenu, pas dans leur nom : un montage s'ouvre
// dans un onglet, un diagramme dans le sien, un composant dans l'éditeur de composants.

export type ExternalFileKind = 'project' | 'component' | 'diagram'

export type ExternalFileResult = { kind: ExternalFileKind } | { kind: null; message: string }

interface Stores {
  schematic: ReturnType<typeof useSchematicStore>
  editor: ReturnType<typeof useComponentEditorStore>
  diagram: ReturnType<typeof useDiagramStore>
  library: ReturnType<typeof useLibraryStore>
}

/**
 * Nature d'un fichier Pinout d'après son JSON : un montage a des fils, un diagramme des nœuds et
 * des liens, un composant des broches.
 */
export function externalFileKind(text: string): ExternalFileKind | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (Array.isArray(record['wires']) && Array.isArray(record['components'])) return 'project'
  if (Array.isArray(record['nodes']) && Array.isArray(record['links'])) return 'diagram'
  if (Array.isArray(record['pins']) && typeof record['visual'] === 'object') return 'component'
  return null
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Ouvre un fichier par son chemin. Un montage prend un onglet (ou ramène le sien s'il est déjà
 * ouvert). Un composant de la bibliothèque s'ouvre tel quel ; un composant venu d'ailleurs s'ouvre
 * comme un nouveau composant, qu'Enregistrer ajoutera à la bibliothèque.
 */
export async function openExternalFile(
  path: string,
  { schematic, editor, diagram, library }: Stores
): Promise<ExternalFileResult> {
  let text: string
  try {
    text = await bridge().readTextFile(path)
  } catch (error) {
    return { kind: null, message: `Ouverture impossible : ${describe(error)}` }
  }
  const kind = externalFileKind(text)
  if (kind === 'project') {
    return (await schematic.openPath(path)) ? { kind } : { kind: null, message: schematic.status }
  }
  if (kind === 'diagram') {
    return (await diagram.openPath(path)) ? { kind } : { kind: null, message: diagram.status }
  }
  if (kind === 'component') {
    try {
      const folder = dirOf(path)
      const entry = samePath(baseName(path), COMPONENT_FILE)
        ? library.entries.find((candidate) => samePath(candidate.folder, folder))
        : undefined
      if (entry?.def) {
        editor.open(entry.def, entry.folder)
      } else {
        editor.open(await loadComponentFile(path), null)
        editor.status = 'Composant importé : Enregistrer l’ajoute à la bibliothèque.'
      }
      return { kind }
    } catch (error) {
      return { kind: null, message: `Ouverture impossible : ${describe(error)}` }
    }
  }
  return {
    kind: null,
    message: `Ce fichier n’est ni un montage, ni un diagramme, ni un composant Pinout : ${baseName(path)}`
  }
}
