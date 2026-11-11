import { z } from 'zod'
import type { useComponentEditorStore } from '@/features/component-editor/store'
import type { useDiagramStore } from '@/features/diagram-editor/store'
import type { useLibraryStore } from '@/features/library/store'
import type { useSchematicStore } from '@/features/schematic-editor/store'
import { bridge } from '@/io/bridge'
import { recall, remember } from '@/io/localMemory'
import { samePath } from '@/io/paths'

// Session (décision du 11 novembre 2026) : ce qui était ouvert quand on a quitté revient au
// lancement suivant. Seuls comptent les documents qui ont un fichier : un montage jamais
// enregistré n'est pas retenu, donc pas rouvert. La liste est tenue à jour à chaque changement
// d'onglet, pas seulement en quittant : elle survit aussi à un arrêt brutal. Elle vit dans la
// mémoire de l'interface (propre à la machine), pas dans les paramètres.

const SESSION_KEY = 'session'

/** Documents ouverts d'un éditeur : leurs fichiers, dans l'ordre des onglets, et celui affiché. */
const openDocumentsSchema = z.object({
  paths: z.array(z.string()),
  active: z.string().nullable()
})

const sessionSchema = z.object({
  mode: z.enum(['components', 'schematic', 'diagram']),
  schematic: openDocumentsSchema,
  diagram: openDocumentsSchema,
  /** Composants de la bibliothèque ouverts : leurs dossiers. */
  components: openDocumentsSchema
})
export type Session = z.infer<typeof sessionSchema>

interface Stores {
  schematic: ReturnType<typeof useSchematicStore>
  diagram: ReturnType<typeof useDiagramStore>
  editor: ReturnType<typeof useComponentEditorStore>
  library: ReturnType<typeof useLibraryStore>
}

function openDocuments(
  tabs: readonly { id: number; path: string | null }[],
  activeId: number
): Session['schematic'] {
  return {
    paths: tabs.flatMap((tab) => (tab.path === null ? [] : [tab.path])),
    active: tabs.find((tab) => tab.id === activeId)?.path ?? null
  }
}

/** Ce qui est ouvert en ce moment et a un fichier, et le mode qu'on regarde. */
export function currentSession(
  mode: Session['mode'],
  { schematic, diagram, editor }: Omit<Stores, 'library'>
): Session {
  return {
    mode,
    schematic: openDocuments(
      schematic.tabs.map((tab) => ({ id: tab.id, path: tab.filePath })),
      schematic.activeTabId
    ),
    diagram: openDocuments(
      diagram.tabs.map((tab) => ({ id: tab.id, path: tab.filePath })),
      diagram.activeTabId
    ),
    components: openDocuments(
      editor.tabs.map((tab) => ({ id: tab.id, path: tab.folder })),
      editor.activeTabId
    )
  }
}

export function saveSession(session: Session): void {
  remember(SESSION_KEY, JSON.stringify(session))
}

/** Session gardée au dernier lancement, ou null s'il n'y en a pas (ou qu'elle est illisible). */
export function savedSession(): Session | null {
  const text = recall(SESSION_KEY)
  if (text === null) return null
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Rouvre les documents d'une session, chacun dans un onglet de son éditeur. Un fichier qui n'est
 * plus là est passé sans rien dire. `activate` remet aussi devant l'onglet qu'on regardait dans
 * chaque éditeur. Retourne le mode à afficher, ou null si rien n'a été rouvert.
 */
export async function restoreSession(
  session: Session,
  { schematic, diagram, editor, library }: Stores,
  activate = true
): Promise<Session['mode'] | null> {
  let opened = 0
  for (const path of session.schematic.paths) {
    if ((await bridge().pathExists(path)) && (await schematic.openPath(path))) opened++
  }
  for (const path of session.diagram.paths) {
    if ((await bridge().pathExists(path)) && (await diagram.openPath(path))) opened++
  }
  for (const folder of session.components.paths) {
    const entry = library.entries.find((candidate) => samePath(candidate.folder, folder))
    if (!entry?.def) continue
    editor.open(entry.def, entry.folder)
    opened++
  }
  if (activate) {
    const front = <T extends { id: number }>(
      tabs: readonly T[],
      pathOf: (tab: T) => string | null,
      wanted: string | null
    ): number | null => {
      if (wanted === null) return null
      const tab = tabs.find((candidate) => {
        const path = pathOf(candidate)
        return path !== null && samePath(path, wanted)
      })
      return tab ? tab.id : null
    }
    const montage = front(schematic.tabs, (tab) => tab.filePath, session.schematic.active)
    if (montage !== null) schematic.activateTab(montage)
    const chart = front(diagram.tabs, (tab) => tab.filePath, session.diagram.active)
    if (chart !== null) diagram.activateTab(chart)
    const component = front(editor.tabs, (tab) => tab.folder, session.components.active)
    if (component !== null) editor.activateTab(component)
  }
  return opened > 0 ? session.mode : null
}
