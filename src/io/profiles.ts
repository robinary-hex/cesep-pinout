import { completeProfile, slugify, styleProfileSchema, type StyleProfile } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

/** Profils de style nommés : un fichier JSON par profil dans userData/profiles. */

const PROFILES_DIR = 'profiles'

export interface SavedProfile {
  path: string
  profile: StyleProfile
}

async function profilesDir(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, PROFILES_DIR)
}

export async function listProfiles(): Promise<SavedProfile[]> {
  const dir = await profilesDir()
  const entries = await bridge().readDir(dir)
  const result: SavedProfile[] = []
  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.json')) continue
    const path = joinPath(dir, entry.name)
    try {
      const raw: unknown = JSON.parse(await bridge().readTextFile(path))
      // Les profils enregistrés avant un champ récent reçoivent sa valeur par défaut.
      const parsed = styleProfileSchema.safeParse(completeProfile(raw))
      if (parsed.success) result.push({ path, profile: parsed.data })
    } catch {
      // Un fichier illisible n'empêche pas de lister les autres.
    }
  }
  return result.sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'fr'))
}

/** Écrit le profil sous <slug du nom>.json ; retourne le chemin. */
export async function saveProfile(profile: StyleProfile): Promise<string> {
  const path = joinPath(await profilesDir(), `${slugify(profile.name)}.json`)
  await bridge().writeTextFile(path, JSON.stringify(profile, null, 2) + '\n')
  return path
}

export async function deleteProfile(path: string): Promise<void> {
  await bridge().deleteFile(path)
}
