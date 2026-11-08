import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '@/domain'
import { bridge } from './bridge'
import { joinPath } from './paths'

const SETTINGS_FILE = 'settings.json'
const DEFAULT_LIBRARY_FOLDER = 'library'

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

/** Dossier de bibliothèque effectif : celui des paramètres, sinon userData/library. */
export async function resolveLibraryDir(settings: Settings): Promise<string> {
  if (settings.libraryDir.length > 0) return settings.libraryDir
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, DEFAULT_LIBRARY_FOLDER)
}
