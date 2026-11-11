import {
  completeProfile,
  parseProfiles,
  serializeProfiles,
  styleProfileSchema,
  type StyleProfile
} from '@/domain'
import { bridge } from './bridge'
import { dataFolder, legacyProfilesDir, PROFILES_FILE } from './dataFolder'
import { joinPath } from './paths'

// Profils de style enregistrés : tous dans un seul fichier, `Applications/profils.json` du dossier
// de Pinout, à côté des paramètres mais à part (décision du 11 novembre 2026). Ils suivent donc
// d'une machine à l'autre avec le dossier. Avant, ils étaient un par fichier dans userData :
// `importLegacyProfiles` les reprend au premier lancement.

export interface SavedProfile {
  profile: StyleProfile
}

/** Le fichier des profils : celui du dossier de Pinout, sinon un fichier de userData. */
export async function profilesFilePath(root: string | null): Promise<string> {
  if (root !== null) return dataFolder(root).profilesFile
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, PROFILES_FILE)
}

async function readProfiles(path: string): Promise<StyleProfile[]> {
  if (!(await bridge().pathExists(path))) return []
  return parseProfiles(await bridge().readTextFile(path))
}

function byName(a: StyleProfile, b: StyleProfile): number {
  return a.name.localeCompare(b.name, 'fr')
}

export async function listProfiles(root: string | null): Promise<SavedProfile[]> {
  const profiles = await readProfiles(await profilesFilePath(root))
  return profiles.sort(byName).map((profile) => ({ profile }))
}

/** Enregistre le profil, à la place de celui du même nom s'il y en a un ; retourne le fichier. */
export async function saveProfile(root: string | null, profile: StyleProfile): Promise<string> {
  const path = await profilesFilePath(root)
  const others = (await readProfiles(path)).filter((saved) => saved.name !== profile.name)
  await bridge().writeTextFile(path, serializeProfiles([...others, profile]))
  return path
}

export async function deleteProfile(root: string | null, name: string): Promise<void> {
  const path = await profilesFilePath(root)
  const profiles = await readProfiles(path)
  const kept = profiles.filter((saved) => saved.name !== name)
  if (kept.length !== profiles.length) await bridge().writeTextFile(path, serializeProfiles(kept))
}

/**
 * Ajoute au fichier des profils ceux de `profiles` dont le nom n'y est pas encore ; retourne leur
 * nombre. Un profil du même nom déjà enregistré n'est pas remplacé.
 */
export async function addMissingProfiles(
  root: string | null,
  profiles: readonly StyleProfile[]
): Promise<number> {
  const path = await profilesFilePath(root)
  const saved = await readProfiles(path)
  const names = new Set(saved.map((profile) => profile.name))
  const added = profiles.filter((profile) => !names.has(profile.name))
  if (added.length > 0) await bridge().writeTextFile(path, serializeProfiles([...saved, ...added]))
  return added.length
}

/** Les profils de l'ancienne organisation : un fichier JSON par profil dans userData/profiles. */
export async function readLegacyProfiles(): Promise<StyleProfile[]> {
  const dir = await legacyProfilesDir()
  const result: StyleProfile[] = []
  for (const entry of await bridge().readDir(dir)) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.json')) continue
    try {
      const raw: unknown = JSON.parse(await bridge().readTextFile(joinPath(dir, entry.name)))
      const parsed = styleProfileSchema.safeParse(completeProfile(raw))
      if (parsed.success) result.push(parsed.data)
    } catch {
      // Un fichier illisible n'empêche pas de reprendre les autres.
    }
  }
  return result.sort(byName)
}
