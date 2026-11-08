import { z } from 'zod'
import { parseProject, serializeProject, type Project } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/**
 * Copie de secours du montage en cours : un fichier projet et un petit fichier de contexte
 * dans userData/autosave. Elle n'existe que tant qu'il y a des modifications non enregistrées ;
 * au lancement, si elle est là, c'est que l'application s'est arrêtée sans enregistrer.
 */

const AUTOSAVE_DIR = 'autosave'
const PROJECT_FILE = 'montage.pinout.json'
const META_FILE = 'montage.meta.json'

const metaSchema = z.object({
  name: z.string(),
  originalPath: z.string().nullable(),
  savedAt: z.string()
})
export type AutosaveMeta = z.infer<typeof metaSchema>

async function paths(): Promise<{ project: string; meta: string }> {
  const { userData } = await bridge().getAppPaths()
  const dir = joinPath(userData, AUTOSAVE_DIR)
  return { project: joinPath(dir, PROJECT_FILE), meta: joinPath(dir, META_FILE) }
}

export async function writeAutosave(
  project: Project,
  originalPath: string | null,
  now: Date = new Date()
): Promise<void> {
  const target = await paths()
  const meta: AutosaveMeta = { name: project.name, originalPath, savedAt: now.toISOString() }
  await bridge().writeTextFile(target.project, serializeProject(project))
  await bridge().writeTextFile(target.meta, JSON.stringify(meta, null, 2) + '\n')
}

export async function clearAutosave(): Promise<void> {
  const target = await paths()
  await bridge().deleteFile(target.meta)
  await bridge().deleteFile(target.project)
}

/** La copie de secours si elle existe et se lit ; une copie illisible est effacée. */
export async function readAutosave(): Promise<{ project: Project; meta: AutosaveMeta } | null> {
  const target = await paths()
  if (!(await bridge().pathExists(target.meta))) return null
  try {
    const meta = metaSchema.parse(JSON.parse(await bridge().readTextFile(target.meta)))
    const project = parseProject(await bridge().readTextFile(target.project))
    return { project, meta }
  } catch {
    await clearAutosave()
    return null
  }
}
