import { parseProject, serializeProject, slugify, type Project } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/**
 * Extension des montages : du JSON sous une extension propre, que l'installeur associe à
 * l'application (double-clic). Les anciens fichiers .pinout.json et .json s'ouvrent toujours.
 */
export const PROJECT_EXTENSION = '.pinout'

const OPEN_FILTERS = [{ name: 'Montage Pinout', extensions: ['pinout', 'json'] }]
const SAVE_FILTERS = [{ name: 'Montage Pinout', extensions: ['pinout'] }]

/** Ajoute l'extension de montage si le chemin choisi n'en a pas (ni .pinout, ni .json). */
export function ensureProjectExtension(path: string): string {
  return /\.(pinout|json)$/i.test(path) ? path : path + PROJECT_EXTENSION
}

/** Dialogue d'ouverture, dans `defaultDir` s'il est donné (dossier du dernier projet). */
export async function chooseProjectToOpen(defaultDir?: string | null): Promise<string | null> {
  return bridge().showOpenDialog({
    title: 'Ouvrir un projet Pinout',
    defaultPath: defaultDir ?? undefined,
    filters: OPEN_FILTERS
  })
}

/** Dialogue d'enregistrement, dans `defaultDir` s'il est donné, sinon dans Documents. */
export async function chooseProjectToSave(
  projectName: string,
  defaultDir?: string | null
): Promise<string | null> {
  const dir = defaultDir ?? (await bridge().getAppPaths()).documents
  const path = await bridge().showSaveDialog({
    title: 'Enregistrer le projet',
    defaultPath: joinPath(dir, slugify(projectName) + PROJECT_EXTENSION),
    filters: SAVE_FILTERS
  })
  return path === null ? null : ensureProjectExtension(path)
}

export async function readProject(path: string): Promise<Project> {
  return parseProject(await bridge().readTextFile(path))
}

export async function writeProject(path: string, project: Project): Promise<void> {
  await bridge().writeTextFile(path, serializeProject(project))
}
