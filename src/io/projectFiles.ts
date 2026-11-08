import { parseProject, serializeProject, slugify, type Project } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

export const PROJECT_EXTENSION = '.pinout.json'

const PROJECT_FILTERS = [{ name: 'Projet Pinout', extensions: ['pinout.json', 'json'] }]

/** Ajoute l'extension de projet si le chemin choisi n'en a pas. */
export function ensureProjectExtension(path: string): string {
  return /\.json$/i.test(path) ? path : path + PROJECT_EXTENSION
}

export async function chooseProjectToOpen(): Promise<string | null> {
  return bridge().showOpenDialog({ title: 'Ouvrir un projet Pinout', filters: PROJECT_FILTERS })
}

export async function chooseProjectToSave(projectName: string): Promise<string | null> {
  const { documents } = await bridge().getAppPaths()
  const path = await bridge().showSaveDialog({
    title: 'Enregistrer le projet',
    defaultPath: joinPath(documents, slugify(projectName) + PROJECT_EXTENSION),
    filters: PROJECT_FILTERS
  })
  return path === null ? null : ensureProjectExtension(path)
}

export async function readProject(path: string): Promise<Project> {
  return parseProject(await bridge().readTextFile(path))
}

export async function writeProject(path: string, project: Project): Promise<void> {
  await bridge().writeTextFile(path, serializeProject(project))
}
