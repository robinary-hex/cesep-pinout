import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

const SETTINGS_FILE = 'settings.json'
const DEFAULT_LIBRARY_FOLDER = 'library'
/** Dans OneDrive, la bibliothèque vit ici par défaut : elle suit Robin d'une machine à l'autre. */
export const ONEDRIVE_LIBRARY_SUBPATH = [
  '(Cours)',
  'Robotique',
  '(Ressources)',
  'Pinout',
  'library'
]
/** Préfixe d'un dossier enregistré relativement à OneDrive, résolu sur chaque machine. */
export const ONEDRIVE_TOKEN = '${OneDrive}'

async function settingsPath(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, SETTINGS_FILE)
}

/** Paramètres enregistrés, ou les valeurs par défaut si le fichier manque ou est illisible. */
export async function loadSettings(): Promise<{ settings: Settings; problem: string | null }> {
  const path = await settingsPath()
  if (!(await bridge().pathExists(path))) {
    return { settings: structuredClone(DEFAULT_SETTINGS), problem: null }
  }
  try {
    return { settings: parseSettings(await bridge().readTextFile(path)), problem: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      settings: structuredClone(DEFAULT_SETTINGS),
      problem: `Paramètres ignorés (${reason}) ; valeurs par défaut utilisées.`
    }
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await bridge().writeTextFile(await settingsPath(), serializeSettings(settings))
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
 * Forme à enregistrer d'un dossier choisi : relatif à OneDrive (`${OneDrive}…`) s'il y est, pour
 * que le réglage reste valable quel que soit le disque ou la machine ; tel quel sinon.
 */
export function portableLibraryDir(dir: string, oneDrive: string | null): string {
  if (!oneDrive) return dir
  const root = trimSeparators(oneDrive)
  const normalize = (path: string): string => path.replace(/[\\/]+/g, '/').toLowerCase()
  const inside =
    normalize(dir) === normalize(root) || normalize(dir).startsWith(normalize(root) + '/')
  return inside ? ONEDRIVE_TOKEN + dir.slice(root.length) : dir
}
