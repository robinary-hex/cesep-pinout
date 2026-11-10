import { z } from 'zod'
import {
  parseDiagram,
  parseProject,
  serializeDiagram,
  serializeProject,
  type Diagram,
  type Project
} from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/**
 * Copies de secours des montages et des diagrammes ouverts : pour chaque onglet qui a des
 * modifications non enregistrées, le document et un petit fichier de contexte dans
 * userData/autosave, nommés d'après la clé de l'onglet. Le dossier reflète la liste des documents
 * modifiés ; au lancement, ce qui s'y trouve vient d'un arrêt sans enregistrement. Montages et
 * diagrammes ont chacun leur famille de fichiers, tenue à jour séparément.
 */

const AUTOSAVE_DIR = 'autosave'

const metaSchema = z.object({
  name: z.string(),
  originalPath: z.string().nullable(),
  savedAt: z.string()
})
export type AutosaveMeta = z.infer<typeof metaSchema>

/** Une famille de copies : ses noms de fichiers et la façon de lire et d'écrire ses documents. */
interface Family<T> {
  /** `<préfixe>-<clé><suffixe>` pour le document, `<préfixe>-<clé>.meta.json` pour son contexte. */
  prefix: string
  suffix: string
  pattern: RegExp
  parse: (text: string) => T
  serialize: (doc: T) => string
}

/** montage-<clé>.pinout.json et .meta.json ; « montage.* » sans clé date d'avant les onglets. */
const PROJECTS: Family<Project> = {
  prefix: 'montage',
  suffix: '.pinout.json',
  pattern: /^montage(?:-(\d+))?\.(pinout|meta)\.json$/,
  parse: parseProject,
  serialize: serializeProject
}

const DIAGRAMS: Family<Diagram> = {
  prefix: 'diagramme',
  suffix: '.pinuml.json',
  pattern: /^diagramme-(\d+)\.(pinuml|meta)\.json$/,
  parse: parseDiagram,
  serialize: serializeDiagram
}

interface FamilyEntry<T> {
  key: number
  doc: T
  originalPath: string | null
}

async function autosaveDir(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, AUTOSAVE_DIR)
}

/** Écrit une copie par document et efface les autres copies de la famille. */
async function syncFamily<T extends { name: string }>(
  family: Family<T>,
  entries: readonly FamilyEntry<T>[],
  now: Date
): Promise<void> {
  const dir = await autosaveDir()
  const kept = new Set<string>()
  for (const entry of entries) {
    const docFile = `${family.prefix}-${entry.key}${family.suffix}`
    const metaFile = `${family.prefix}-${entry.key}.meta.json`
    const meta: AutosaveMeta = {
      name: entry.doc.name,
      originalPath: entry.originalPath,
      savedAt: now.toISOString()
    }
    await bridge().writeTextFile(joinPath(dir, docFile), family.serialize(entry.doc))
    await bridge().writeTextFile(joinPath(dir, metaFile), JSON.stringify(meta, null, 2) + '\n')
    kept.add(docFile)
    kept.add(metaFile)
  }
  for (const file of await bridge().readDir(dir)) {
    if (!file.isDirectory && family.pattern.test(file.name) && !kept.has(file.name)) {
      await bridge().deleteFile(joinPath(dir, file.name))
    }
  }
}

/** Les copies lisibles d'une famille, dans l'ordre de leurs clés ; une copie illisible est effacée. */
async function readFamily<T>(family: Family<T>): Promise<{ doc: T; meta: AutosaveMeta }[]> {
  const dir = await autosaveDir()
  const metas = (await bridge().readDir(dir))
    .flatMap((file) => {
      const match = file.isDirectory ? null : family.pattern.exec(file.name)
      if (!match || match[2] !== 'meta') return []
      return [{ name: file.name, key: match[1] === undefined ? -1 : Number(match[1]) }]
    })
    .sort((a, b) => a.key - b.key)
  const found: { doc: T; meta: AutosaveMeta }[] = []
  for (const { name } of metas) {
    const metaPath = joinPath(dir, name)
    const docPath = joinPath(dir, name.replace('.meta.json', family.suffix))
    try {
      const meta = metaSchema.parse(JSON.parse(await bridge().readTextFile(metaPath)))
      const doc = family.parse(await bridge().readTextFile(docPath))
      found.push({ doc, meta })
    } catch {
      await bridge().deleteFile(metaPath)
      await bridge().deleteFile(docPath)
    }
  }
  return found
}

// Montages

export interface AutosaveEntry {
  /** Identifiant du montage pendant la session (celui de son onglet) : nomme ses fichiers. */
  key: number
  project: Project
  originalPath: string | null
}

export interface RecoveredAutosave {
  project: Project
  meta: AutosaveMeta
}

/**
 * Écrit une copie par montage modifié et efface toutes les autres : après l'appel, le dossier
 * contient exactement les copies de montage de `entries`.
 */
export async function syncAutosaves(
  entries: readonly AutosaveEntry[],
  now: Date = new Date()
): Promise<void> {
  await syncFamily(
    PROJECTS,
    entries.map(({ key, project, originalPath }) => ({ key, doc: project, originalPath })),
    now
  )
}

/** Les copies de secours de montage lisibles, dans l'ordre de leurs clés. */
export async function readAutosaves(): Promise<RecoveredAutosave[]> {
  return (await readFamily(PROJECTS)).map(({ doc, meta }) => ({ project: doc, meta }))
}

// Diagrammes

export interface DiagramAutosaveEntry {
  key: number
  diagram: Diagram
  originalPath: string | null
}

export interface RecoveredDiagram {
  diagram: Diagram
  meta: AutosaveMeta
}

/** Comme `syncAutosaves`, pour les diagrammes modifiés. */
export async function syncDiagramAutosaves(
  entries: readonly DiagramAutosaveEntry[],
  now: Date = new Date()
): Promise<void> {
  await syncFamily(
    DIAGRAMS,
    entries.map(({ key, diagram, originalPath }) => ({ key, doc: diagram, originalPath })),
    now
  )
}

export async function readDiagramAutosaves(): Promise<RecoveredDiagram[]> {
  return (await readFamily(DIAGRAMS)).map(({ doc, meta }) => ({ diagram: doc, meta }))
}

/** Efface toutes les copies de secours, montages et diagrammes. */
export async function clearAutosave(): Promise<void> {
  await syncAutosaves([])
  await syncDiagramAutosaves([])
}
