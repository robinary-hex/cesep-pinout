import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

const SETTINGS_FILE = 'settings.json'
const DEFAULT_LIBRARY_FOLDER = 'library'
/** Dans OneDrive, les données de Pinout vivent ici : elles suivent Robin d'une machine à l'autre. */
const ONEDRIVE_PINOUT_SUBPATH = ['(Cours)', 'Robotique', '(Ressources)', 'Pinout']
/** La bibliothèque de composants par défaut, dans ce dossier. */
export const ONEDRIVE_LIBRARY_SUBPATH = [...ONEDRIVE_PINOUT_SUBPATH, DEFAULT_LIBRARY_FOLDER]
/** Préfixe d'un dossier enregistré relativement à OneDrive, résolu sur chaque machine. */
export const ONEDRIVE_TOKEN = '${OneDrive}'

// Paramètres en deux fichiers. Le fichier partagé porte tout ce qui doit suivre Robin d'une machine
// à l'autre, profil de style général compris ; il vit dans le dossier que la machine a choisi
// (`settingsDir`), par défaut le dossier Pinout de OneDrive, qui le synchronise. Le fichier local
// (userData) en est une copie complète, plus ce qui n'a de sens que sur cette machine : les
// fichiers récents et ce dossier. Sans dossier choisi ni OneDrive, seul le fichier local existe.

async function localSettingsPath(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, SETTINGS_FILE)
}

/**
 * Dossier du fichier de paramètres partagé : celui que la machine a choisi (un préfixe
 * `${OneDrive}` est remplacé par sa racine OneDrive), sinon le dossier Pinout de OneDrive ; null
 * sans l'un ni l'autre, les paramètres restent alors sur la machine.
 */
export async function resolveSettingsDir(settingsDir: string): Promise<string | null> {
  if (settingsDir.length > 0 && !settingsDir.startsWith(ONEDRIVE_TOKEN)) return settingsDir
  const { oneDrive } = await bridge().getAppPaths()
  if (!oneDrive) return null
  return settingsDir.length > 0
    ? joinPath(oneDrive, settingsDir.slice(ONEDRIVE_TOKEN.length))
    : joinPath(oneDrive, ...ONEDRIVE_PINOUT_SUBPATH)
}

/** Chemin du fichier de paramètres partagé, ou null quand ils restent sur la machine. */
export async function sharedSettingsPath(settingsDir: string): Promise<string | null> {
  const dir = await resolveSettingsDir(settingsDir)
  return dir === null ? null : joinPath(dir, SETTINGS_FILE)
}

/** Ce qui part dans le fichier partagé : tout, sauf les réglages propres à la machine. */
function sharedPart(settings: Settings): Settings {
  return { ...settings, recentFiles: [], settingsDir: '' }
}

/** Réglages effectifs : ceux du fichier partagé, avec ce qui est propre à cette machine. */
export function withLocalPart(shared: Settings, local: Settings): Settings {
  return { ...shared, recentFiles: local.recentFiles, settingsDir: local.settingsDir }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Lit un fichier de paramètres : null sans fichier ; `problem` s'il est illisible. */
async function readSettingsFile(
  path: string
): Promise<{ settings: Settings | null; problem: string | null }> {
  if (!(await bridge().pathExists(path))) return { settings: null, problem: null }
  try {
    return { settings: parseSettings(await bridge().readTextFile(path)), problem: null }
  } catch (error) {
    return { settings: null, problem: describe(error) }
  }
}

export interface LoadedSettings {
  settings: Settings
  problem: string | null
  /** Fichier partagé utilisé, ou null quand les paramètres restent sur cette machine. */
  sharedPath: string | null
}

export interface RelocatedSettings extends LoadedSettings {
  /** Vrai quand le nouveau dossier avait déjà des paramètres : ce sont eux qui s'appliquent. */
  adopted: boolean
}

/**
 * Paramètres au lancement : ceux du fichier partagé s'il existe, complétés des réglages propres à
 * la machine ; sinon ceux du fichier local (ou les valeurs par défaut), qui initialisent alors le
 * fichier partagé. Un fichier partagé illisible est laissé tel quel : la machine garde les siens.
 */
export async function loadSettings(): Promise<LoadedSettings> {
  const local = await readSettingsFile(await localSettingsPath())
  const base = local.settings ?? structuredClone(DEFAULT_SETTINGS)
  const localProblem =
    local.problem === null
      ? null
      : `Paramètres ignorés (${local.problem}) ; valeurs par défaut utilisées.`
  const sharedPath = await sharedSettingsPath(base.settingsDir)
  if (sharedPath === null) return { settings: base, problem: localProblem, sharedPath }

  const shared = await readSettingsFile(sharedPath)
  if (shared.settings !== null) {
    return { settings: withLocalPart(shared.settings, base), problem: localProblem, sharedPath }
  }
  if (shared.problem !== null) {
    return {
      settings: base,
      problem: `Paramètres partagés illisibles (${shared.problem}) ; ceux de cette machine sont utilisés.`,
      sharedPath
    }
  }
  try {
    await bridge().writeTextFile(sharedPath, serializeSettings(sharedPart(base)))
    return { settings: base, problem: localProblem, sharedPath }
  } catch (error) {
    return {
      settings: base,
      problem: `Paramètres partagés non créés (${describe(error)}).`,
      sharedPath
    }
  }
}

/** Le fichier partagé tel qu'il est maintenant, ou null (pas de dossier, absent, illisible). */
export async function readSharedSettings(settingsDir: string): Promise<Settings | null> {
  const path = await sharedSettingsPath(settingsDir)
  return path === null ? null : (await readSettingsFile(path)).settings
}

/**
 * Écrit le fichier local, et le fichier partagé seulement si son contenu change : ouvrir un
 * montage ne touche que les fichiers récents, il n'y a alors rien à synchroniser.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await bridge().writeTextFile(await localSettingsPath(), serializeSettings(settings))
  const sharedPath = await sharedSettingsPath(settings.settingsDir)
  if (sharedPath === null) return
  const text = serializeSettings(sharedPart(settings))
  const current = (await bridge().pathExists(sharedPath))
    ? await bridge().readTextFile(sharedPath)
    : null
  if (current !== text) await bridge().writeTextFile(sharedPath, text)
}

/**
 * Met le fichier partagé dans un autre dossier (`settingsDir` ; vide = le dossier par défaut). Si
 * ce dossier a déjà des paramètres lisibles, ils deviennent ceux de l'application : c'est une
 * autre machine qui les y a mis. Sinon les réglages courants y sont écrits. Un fichier illisible
 * n'est pas écrasé : l'erreur remonte et rien ne change. L'ancien fichier reste où il était.
 */
export async function relocateSharedSettings(
  current: Settings,
  settingsDir: string
): Promise<RelocatedSettings> {
  const local: Settings = { ...current, settingsDir }
  const sharedPath = await sharedSettingsPath(settingsDir)
  const found =
    sharedPath === null ? { settings: null, problem: null } : await readSettingsFile(sharedPath)
  if (found.problem !== null) {
    throw new Error(`ce dossier contient un ${SETTINGS_FILE} illisible (${found.problem})`)
  }
  const settings = found.settings === null ? local : withLocalPart(found.settings, local)
  await saveSettings(settings)
  return { settings, problem: null, sharedPath, adopted: found.settings !== null }
}

function trimSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

/**
 * Dossier de bibliothèque effectif : celui des paramètres (un préfixe `${OneDrive}` est remplacé
 * par la racine OneDrive de la machine), sinon le dossier OneDrive par défaut quand OneDrive est
 * là, sinon userData/library.
 */
export async function resolveLibraryDir(settings: Settings): Promise<string> {
  const { userData, oneDrive } = await bridge().getAppPaths()
  const configured = settings.libraryDir
  if (configured.length > 0 && !configured.startsWith(ONEDRIVE_TOKEN)) return configured
  if (oneDrive) {
    return configured.length > 0
      ? joinPath(oneDrive, configured.slice(ONEDRIVE_TOKEN.length))
      : joinPath(oneDrive, ...ONEDRIVE_LIBRARY_SUBPATH)
  }
  return joinPath(userData, DEFAULT_LIBRARY_FOLDER)
}

/**
 * Forme à enregistrer d'un dossier choisi (bibliothèque, paramètres) : relatif à OneDrive
 * (`${OneDrive}…`) s'il y est, pour que le réglage reste valable quel que soit le disque ou la
 * machine ; tel quel sinon.
 */
export function portableDir(dir: string, oneDrive: string | null): string {
  if (!oneDrive) return dir
  const root = trimSeparators(oneDrive)
  const normalize = (path: string): string => path.replace(/[\\/]+/g, '/').toLowerCase()
  const inside =
    normalize(dir) === normalize(root) || normalize(dir).startsWith(normalize(root) + '/')
  return inside ? ONEDRIVE_TOKEN + dir.slice(root.length) : dir
}
