import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '@/domain'
import { bridge } from './bridge'
import {
  dataFolder,
  legacyFoldersOf,
  legacySettingsFile,
  resolveDataRoot,
  SETTINGS_FILE,
  type LegacyFolders
} from './dataFolder'
import { joinPath } from './paths'

const LOCAL_SETTINGS_FILE = 'settings.json'

// Paramètres en deux fichiers. Le fichier partagé porte tout ce qui doit suivre d'une machine à
// l'autre, profil de style général compris : c'est `Applications/parametres.json` du dossier de
// Pinout (`dataDir`), que OneDrive synchronise s'il y est. Le fichier local (userData) en est une
// copie complète, plus ce qui n'a de sens que sur cette machine : les fichiers récents et ce
// dossier. Tant que le dossier de Pinout n'est pas choisi, seul le fichier local existe.

async function localSettingsPath(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, LOCAL_SETTINGS_FILE)
}

/** Chemin du fichier de paramètres partagé, ou null tant que le dossier de Pinout manque. */
export async function sharedSettingsPath(dataDir: string): Promise<string | null> {
  const root = await resolveDataRoot(dataDir)
  return root === null ? null : dataFolder(root).settingsFile
}

/** Ce qui part dans le fichier partagé : tout, sauf les réglages propres à la machine. */
function sharedPart(settings: Settings): Settings {
  return { ...settings, recentFiles: [], dataDir: '' }
}

/** Réglages effectifs : ceux du fichier partagé, avec ce qui est propre à cette machine. */
export function withLocalPart(shared: Settings, local: Settings): Settings {
  return { ...shared, recentFiles: local.recentFiles, dataDir: local.dataDir }
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
  /** Fichier partagé utilisé, ou null tant que le dossier de Pinout n'est pas choisi. */
  sharedPath: string | null
  /**
   * Les deux dossiers de l'ancienne organisation, d'après le fichier local : ce qu'ils
   * contiennent est repris quand on choisit le dossier de Pinout pour la première fois.
   */
  legacy: LegacyFolders
}

export interface RelocatedSettings {
  settings: Settings
  /** Fichier partagé du nouveau dossier. */
  sharedPath: string | null
  /** Vrai quand le nouveau dossier avait déjà des paramètres : ce sont eux qui s'appliquent. */
  adopted: boolean
}

/**
 * Paramètres au lancement : ceux du fichier partagé s'il existe, complétés des réglages propres à
 * la machine ; sinon ceux du fichier local (ou les valeurs par défaut), qui initialisent alors le
 * fichier partagé. Un fichier partagé illisible est laissé tel quel : la machine garde les siens.
 * Tant que le dossier de Pinout n'est pas choisi, rien n'est écrit.
 */
export async function loadSettings(): Promise<LoadedSettings> {
  const localPath = await localSettingsPath()
  const localText = (await bridge().pathExists(localPath))
    ? await bridge()
        .readTextFile(localPath)
        .catch(() => null)
    : null
  const local = await readSettingsFile(localPath)
  const legacy = legacyFoldersOf(localText)
  const base = local.settings ?? structuredClone(DEFAULT_SETTINGS)
  const localProblem =
    local.problem === null
      ? null
      : `Paramètres ignorés (${local.problem}) ; valeurs par défaut utilisées.`
  const sharedPath = await sharedSettingsPath(base.dataDir)
  if (sharedPath === null) return { settings: base, problem: localProblem, sharedPath, legacy }

  const shared = await readSettingsFile(sharedPath)
  if (shared.settings !== null) {
    return {
      settings: withLocalPart(shared.settings, base),
      problem: localProblem,
      sharedPath,
      legacy
    }
  }
  if (shared.problem !== null) {
    return {
      settings: base,
      problem: `Paramètres partagés illisibles (${shared.problem}) ; ceux de cette machine sont utilisés.`,
      sharedPath,
      legacy
    }
  }
  try {
    await bridge().writeTextFile(sharedPath, serializeSettings(sharedPart(base)))
    return { settings: base, problem: localProblem, sharedPath, legacy }
  } catch (error) {
    return {
      settings: base,
      problem: `Paramètres partagés non créés (${describe(error)}).`,
      sharedPath,
      legacy
    }
  }
}

/** Le fichier partagé tel qu'il est maintenant, ou null (pas de dossier, absent, illisible). */
export async function readSharedSettings(dataDir: string): Promise<Settings | null> {
  const path = await sharedSettingsPath(dataDir)
  return path === null ? null : (await readSettingsFile(path)).settings
}

/** Les paramètres partagés de l'ancienne organisation, s'il y en a de lisibles. */
export async function readLegacySettings(legacy: LegacyFolders): Promise<Settings | null> {
  const file = await legacySettingsFile(legacy)
  return file === null ? null : (await readSettingsFile(file)).settings
}

/**
 * Écrit le fichier local, et le fichier partagé seulement si son contenu change : ouvrir un
 * montage ne touche que les fichiers récents, il n'y a alors rien à synchroniser.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await bridge().writeTextFile(await localSettingsPath(), serializeSettings(settings))
  const sharedPath = await sharedSettingsPath(settings.dataDir)
  if (sharedPath === null) return
  const text = serializeSettings(sharedPart(settings))
  const current = (await bridge().pathExists(sharedPath))
    ? await bridge().readTextFile(sharedPath)
    : null
  if (current !== text) await bridge().writeTextFile(sharedPath, text)
}

/**
 * Change de dossier de Pinout (`dataDir`). Si ce dossier a déjà des paramètres lisibles, ils
 * deviennent ceux de l'application : une autre machine les y a mis. Sinon ce sont `brought` (les
 * paramètres de l'ancienne organisation, au premier lancement), à défaut les réglages courants,
 * qui y sont écrits. Un fichier illisible n'est pas écrasé : l'erreur remonte et rien ne change.
 * Le fichier de l'ancien dossier reste où il était.
 */
export async function relocateSharedSettings(
  current: Settings,
  dataDir: string,
  brought: Settings | null = null
): Promise<RelocatedSettings> {
  const local: Settings = { ...current, dataDir }
  const sharedPath = await sharedSettingsPath(dataDir)
  const found =
    sharedPath === null ? { settings: null, problem: null } : await readSettingsFile(sharedPath)
  if (found.problem !== null) {
    throw new Error(`ce dossier contient un ${SETTINGS_FILE} illisible (${found.problem})`)
  }
  const source = found.settings ?? brought
  const settings = source === null ? local : withLocalPart(source, local)
  await saveSettings(settings)
  return { settings, sharedPath, adopted: found.settings !== null }
}
