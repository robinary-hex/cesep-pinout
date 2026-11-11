import {
  componentImages,
  mapComponentPrimitives,
  dataUrlToBase64,
  parseComponentDefinition,
  pngDataUrl,
  serializeComponentDefinition,
  slugify,
  uniqueSlug,
  type ComponentDefinition
} from '@/domain'
import { bridge } from './bridge'
import { dirOf, joinPath } from './paths'

export const COMPONENT_FILE = 'component.json'

/** Un dossier de la bibliothèque : sa définition, ou le problème qui empêche de la lire. */
export interface LibraryEntry {
  folder: string
  def: ComponentDefinition | null
  problem: string | null
}

/** Lit le composant d'un dossier de la bibliothèque. */
export async function loadComponent(folder: string): Promise<ComponentDefinition> {
  return loadComponentFile(joinPath(folder, COMPONENT_FILE))
}

/**
 * Lit un composant depuis son fichier, où qu'il soit ; chaque image reprend en dataUrl le PNG
 * rangé à côté, s'il est là.
 */
export async function loadComponentFile(path: string): Promise<ComponentDefinition> {
  const def = parseComponentDefinition(await bridge().readTextFile(path))
  const files = new Set(componentImages(def).map((image) => image.file))
  if (files.size === 0) return def
  const dataUrls = new Map<string, string>()
  for (const file of files) {
    const imagePath = joinPath(dirOf(path), file)
    if (!(await bridge().pathExists(imagePath))) continue
    dataUrls.set(file, pngDataUrl(await bridge().readBinaryFile(imagePath)))
  }
  // Dans toutes les variantes du composant.
  return mapComponentPrimitives(def, (primitive) => {
    const dataUrl = primitive.kind === 'image' ? dataUrls.get(primitive.file) : undefined
    return dataUrl === undefined ? primitive : { ...primitive, dataUrl }
  })
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

/** Fichiers d'image que l'application range elle-même dans le dossier d'un composant. */
const OWN_IMAGE_FILE = /^image(-\d+)?\.png$/

/**
 * Écrit un composant dans <bibliothèque>/<id>/ : component.json sans image embarquée, et un PNG
 * à côté par image du dessin. Les images que le composant n'utilise plus quittent le dossier.
 * Retourne le dossier.
 */
export async function saveComponent(libraryDir: string, def: ComponentDefinition): Promise<string> {
  const folder = joinPath(libraryDir, def.id)
  // Les images de toutes les variantes : un fichier par nom, et le JSON sans image embarquée.
  const written = new Set<string>()
  for (const image of componentImages(def)) {
    if (image.dataUrl === undefined || written.has(image.file)) continue
    await bridge().writeBinaryFile(joinPath(folder, image.file), dataUrlToBase64(image.dataUrl))
    written.add(image.file)
  }
  const bare = mapComponentPrimitives(def, (primitive) => {
    if (primitive.kind !== 'image') return primitive
    const image = { ...primitive }
    delete image.dataUrl
    return image
  })
  await bridge().writeTextFile(joinPath(folder, COMPONENT_FILE), serializeComponentDefinition(bare))
  const used = new Set(componentImages(def).map((image) => image.file))
  for (const entry of await bridge().readDir(folder)) {
    if (entry.isDirectory || used.has(entry.name) || !OWN_IMAGE_FILE.test(entry.name)) continue
    await bridge().deleteFile(joinPath(folder, entry.name))
  }
  return folder
}

export async function deleteComponent(folder: string): Promise<void> {
  await bridge().removeComponentFolder(folder)
}

/** Identifiant (et nom de dossier) d'un nouveau composant, unique dans la bibliothèque. */
export function newComponentId(name: string, existingIds: Iterable<string>): string {
  return uniqueSlug(slugify(name), new Set(existingIds))
}
