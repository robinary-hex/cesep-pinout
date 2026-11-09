import { z } from 'zod'
import { parseProject, serializeProject, type Project } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/**
 * Copies de secours des montages ouverts : pour chaque onglet qui a des modifications non
 * enregistrées, un fichier projet et un petit fichier de contexte dans userData/autosave, nommés
 * d'après la clé de l'onglet. Le dossier reflète la liste des montages modifiés ; au lancement,
 * ce qui s'y trouve vient d'un arrêt sans enregistrement.
 */

const AUTOSAVE_DIR = 'autosave'
/** montage-<clé>.pinout.json et .meta.json ; « montage.* » sans clé date d'avant les onglets. */
const FILE_PATTERN = /^montage(?:-(\d+))?\.(pinout|meta)\.json$/

const metaSchema = z.object({
  name: z.string(),
  originalPath: z.string().nullable(),
  savedAt: z.string()
})
export type AutosaveMeta = z.infer<typeof metaSchema>

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

async function autosaveDir(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, AUTOSAVE_DIR)
}

/**
 * Écrit une copie par montage modifié et efface toutes les autres : après l'appel, le dossier
 * contient exactement les copies de `entries`.
 */
export async function syncAutosaves(
  entries: readonly AutosaveEntry[],
  now: Date = new Date()
): Promise<void> {
  const dir = await autosaveDir()
  const kept = new Set<string>()
  for (const entry of entries) {
    const projectFile = `montage-${entry.key}.pinout.json`
    const metaFile = `montage-${entry.key}.meta.json`
    const meta: AutosaveMeta = {
      name: entry.project.name,
      originalPath: entry.originalPath,
      savedAt: now.toISOString()
    }
    await bridge().writeTextFile(joinPath(dir, projectFile), serializeProject(entry.project))
    await bridge().writeTextFile(joinPath(dir, metaFile), JSON.stringify(meta, null, 2) + '\n')
    kept.add(projectFile)
    kept.add(metaFile)
  }
  for (const file of await bridge().readDir(dir)) {
    if (!file.isDirectory && FILE_PATTERN.test(file.name) && !kept.has(file.name)) {
      await bridge().deleteFile(joinPath(dir, file.name))
    }
  }
}

export async function clearAutosave(): Promise<void> {
  await syncAutosaves([])
}

/** Les copies de secours lisibles, dans l'ordre de leurs clés ; une copie illisible est effacée. */
export async function readAutosaves(): Promise<RecoveredAutosave[]> {
  const dir = await autosaveDir()
  const metas = (await bridge().readDir(dir))
    .flatMap((file) => {
      const match = file.isDirectory ? null : FILE_PATTERN.exec(file.name)
      if (!match || match[2] !== 'meta') return []
      return [{ name: file.name, key: match[1] === undefined ? -1 : Number(match[1]) }]
    })
    .sort((a, b) => a.key - b.key)
  const found: RecoveredAutosave[] = []
  for (const { name } of metas) {
    const metaPath = joinPath(dir, name)
    const projectPath = joinPath(dir, name.replace('.meta.json', '.pinout.json'))
    try {
      const meta = metaSchema.parse(JSON.parse(await bridge().readTextFile(metaPath)))
      const project = parseProject(await bridge().readTextFile(projectPath))
      found.push({ project, meta })
    } catch {
      await bridge().deleteFile(metaPath)
      await bridge().deleteFile(projectPath)
    }
  }
  return found
}
