import { parseDiagram, serializeDiagram, slugify, type Diagram } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/**
 * Extension des diagrammes : du JSON sous une extension propre, distincte de celle des montages
 * pour les reconnaître dans l'Explorateur, et que l'installeur associe aussi à l'application.
 */
export const DIAGRAM_EXTENSION = '.pinuml'

const FILTERS = [{ name: 'Diagramme Pinout', extensions: ['pinuml'] }]

/** Ajoute l'extension de diagramme si le chemin choisi ne l'a pas. */
export function ensureDiagramExtension(path: string): string {
  return /\.pinuml$/i.test(path) ? path : path + DIAGRAM_EXTENSION
}

export function isDiagramPath(path: string): boolean {
  return /\.pinuml$/i.test(path)
}

/** Dialogue d'ouverture, dans `defaultDir` s'il est donné (dossier du dernier fichier). */
export async function chooseDiagramToOpen(defaultDir?: string | null): Promise<string | null> {
  return bridge().showOpenDialog({
    title: 'Ouvrir un diagramme Pinout',
    defaultPath: defaultDir ?? undefined,
    filters: FILTERS
  })
}

/** Dialogue d'enregistrement, dans `defaultDir` s'il est donné, sinon dans Documents. */
export async function chooseDiagramToSave(
  diagramName: string,
  defaultDir?: string | null
): Promise<string | null> {
  const dir = defaultDir ?? (await bridge().getAppPaths()).documents
  const path = await bridge().showSaveDialog({
    title: 'Enregistrer le diagramme',
    defaultPath: joinPath(dir, slugify(diagramName) + DIAGRAM_EXTENSION),
    filters: FILTERS
  })
  return path === null ? null : ensureDiagramExtension(path)
}

export async function readDiagram(path: string): Promise<Diagram> {
  return parseDiagram(await bridge().readTextFile(path))
}

export async function writeDiagram(path: string, diagram: Diagram): Promise<void> {
  await bridge().writeTextFile(path, serializeDiagram(diagram))
}
