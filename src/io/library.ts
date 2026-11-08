import {
  dataUrlToBase64,
  parseComponentDefinition,
  pngDataUrl,
  serializeComponentDefinition,
  slugify,
  uniqueSlug,
  type ComponentDefinition
} from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

export const COMPONENT_FILE = 'component.json'

/** Un dossier de la bibliothèque : sa définition, ou le problème qui empêche de la lire. */
export interface LibraryEntry {
  folder: string
  def: ComponentDefinition | null
  problem: string | null
}

/** Lit un composant ; pour un PNG, rattache l'image en dataUrl si elle est présente. */
export async function loadComponent(folder: string): Promise<ComponentDefinition> {
  const def = parseComponentDefinition(
    await bridge().readTextFile(joinPath(folder, COMPONENT_FILE))
  )
  if (def.visual.kind !== 'png') return def
  const imagePath = joinPath(folder, def.visual.file)
  if (!(await bridge().pathExists(imagePath))) return def
  const base64 = await bridge().readBinaryFile(imagePath)
  return { ...def, visual: { ...def.visual, dataUrl: pngDataUrl(base64) } }
}

/** Tous les sous-dossiers de la bibliothèque, triés par nom ; les illisibles restent listés. */
export async function listComponents(libraryDir: string): Promise<LibraryEntry[]> {
  const entries = await bridge().readDir(libraryDir)
  const result: LibraryEntry[] = []
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const folder = joinPath(libraryDir, entry.name)
    try {
      result.push({ folder, def: await loadComponent(folder), problem: null })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      result.push({ folder, def: null, problem: reason })
    }
  }
  return result.sort((a, b) =>
    (a.def?.name ?? a.folder).localeCompare(b.def?.name ?? b.folder, 'fr', { sensitivity: 'base' })
  )
}

/**
 * Écrit un composant dans <bibliothèque>/<id>/ : component.json sans image embarquée,
 * et image.png à côté pour un visuel PNG. Retourne le dossier.
 */
export async function saveComponent(libraryDir: string, def: ComponentDefinition): Promise<string> {
  const folder = joinPath(libraryDir, def.id)
  let toWrite = def
  if (def.visual.kind === 'png') {
    const { dataUrl, ...visual } = def.visual
    if (dataUrl !== undefined) {
      await bridge().writeBinaryFile(joinPath(folder, visual.file), dataUrlToBase64(dataUrl))
    }
    toWrite = { ...def, visual }
  }
  await bridge().writeTextFile(
    joinPath(folder, COMPONENT_FILE),
    serializeComponentDefinition(toWrite)
  )
  return folder
}

export async function deleteComponent(folder: string): Promise<void> {
  await bridge().removeComponentFolder(folder)
}

/** Identifiant (et nom de dossier) d'un nouveau composant, unique dans la bibliothèque. */
export function newComponentId(name: string, existingIds: Iterable<string>): string {
  return uniqueSlug(slugify(name), new Set(existingIds))
}
