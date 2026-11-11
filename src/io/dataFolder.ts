import { bridge } from './bridge'
import { COMPONENT_FILE } from './library'
import { joinPath } from './paths'

// Le dossier de Pinout (décision du 11 novembre 2026) : un seul dossier, choisi une fois par
// machine, où tout est rangé. Les paramètres de l'application ne pointent que lui.
//
//   Composants/     la bibliothèque : un dossier par composant
//   Montages/       là où s'enregistrent les montages, sauf à choisir un autre endroit
//   Diagrammes/     de même pour les diagrammes
//   Applications/   parametres.json (les réglages) et profils.json (les profils enregistrés)
//
// Mis dans OneDrive, il suit d'une machine à l'autre. Ce qui n'a de sens que sur une machine
// (fichiers récents, copies de secours, ce dossier lui-même) reste dans userData.

export const COMPONENTS_FOLDER = 'Composants'
export const MONTAGES_FOLDER = 'Montages'
export const DIAGRAMS_FOLDER = 'Diagrammes'
export const APPLICATION_FOLDER = 'Applications'
export const SETTINGS_FILE = 'parametres.json'
export const PROFILES_FILE = 'profils.json'

/** Préfixe d'un dossier enregistré relativement à OneDrive, résolu sur chaque machine. */
export const ONEDRIVE_TOKEN = '${OneDrive}'

/** Les emplacements d'un dossier de Pinout. */
export interface DataFolder {
  root: string
  components: string
  montages: string
  diagrams: string
  application: string
  settingsFile: string
  profilesFile: string
}

export function dataFolder(root: string): DataFolder {
  const application = joinPath(root, APPLICATION_FOLDER)
  return {
    root,
    components: joinPath(root, COMPONENTS_FOLDER),
    montages: joinPath(root, MONTAGES_FOLDER),
    diagrams: joinPath(root, DIAGRAMS_FOLDER),
    application,
    settingsFile: joinPath(application, SETTINGS_FILE),
    profilesFile: joinPath(application, PROFILES_FILE)
  }
}

/**
 * Le dossier de Pinout de cette machine, d'après le réglage `dataDir` (un préfixe `${OneDrive}`
 * est remplacé par sa racine OneDrive) ; null tant qu'il n'est pas choisi, ou s'il est dans un
 * OneDrive que la machine n'a pas. Un dossier imposé par PINOUT_DATA_DIR passe avant tout.
 */
export async function resolveDataRoot(dataDir: string): Promise<string | null> {
  const { oneDrive, presetDataDir } = await bridge().getAppPaths()
  if (presetDataDir) return presetDataDir
  if (dataDir.length === 0) return null
  if (!dataDir.startsWith(ONEDRIVE_TOKEN)) return dataDir
  return oneDrive ? joinPath(oneDrive, dataDir.slice(ONEDRIVE_TOKEN.length)) : null
}

function trimSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

function normalized(path: string): string {
  return trimSeparators(path)
    .replace(/[\\/]+/g, '/')
    .toLowerCase()
}

/**
 * Forme à enregistrer d'un dossier choisi : relatif à OneDrive (`${OneDrive}…`) s'il y est, pour
 * que le réglage reste valable quel que soit le disque ; tel quel sinon.
 */
export function portableDir(dir: string, oneDrive: string | null): string {
  if (!oneDrive) return dir
  const root = trimSeparators(oneDrive)
  const inside =
    normalized(dir) === normalized(root) || normalized(dir).startsWith(normalized(root) + '/')
  return inside ? ONEDRIVE_TOKEN + dir.slice(root.length) : dir
}

/** Crée le dossier et ses quatre sous-dossiers ; sans effet sur ce qui existe. */
export async function prepareDataFolder(root: string): Promise<void> {
  const folder = dataFolder(root)
  for (const dir of [folder.components, folder.montages, folder.diagrams, folder.application]) {
    await bridge().ensureDir(dir)
  }
}

/** Dossiers de composants (ceux qui ont leur component.json) d'une bibliothèque. */
async function componentFolders(libraryDir: string): Promise<string[]> {
  const names: string[] = []
  for (const entry of await bridge().readDir(libraryDir)) {
    if (!entry.isDirectory) continue
    if (await bridge().pathExists(joinPath(libraryDir, entry.name, COMPONENT_FILE))) {
      names.push(entry.name)
    }
  }
  return names
}

/**
 * Copie les composants d'une bibliothèque dans une autre, encore vide ; retourne leur nombre. Une
 * bibliothèque qui a déjà des composants n'est pas touchée : ce sont les siens qui comptent (une
 * autre machine les y a mis, ou on en a déjà retiré). Rien n'est supprimé à l'origine.
 */
export async function copyComponents(from: string, to: string): Promise<number> {
  if (normalized(from) === normalized(to)) return 0
  if ((await componentFolders(to)).length > 0) return 0
  const names = await componentFolders(from)
  for (const name of names) {
    for (const file of await bridge().readDir(joinPath(from, name))) {
      if (file.isDirectory) continue
      const source = joinPath(from, name, file.name)
      const target = joinPath(to, name, file.name)
      if (file.name.toLowerCase().endsWith('.json')) {
        await bridge().writeTextFile(target, await bridge().readTextFile(source))
      } else {
        await bridge().writeBinaryFile(target, await bridge().readBinaryFile(source))
      }
    }
  }
  return names.length
}

// Reprise de l'ancienne organisation (jusqu'à la 1.5) : deux dossiers au choix, l'un pour le fichier
// de paramètres partagé (settings.json), l'autre pour la bibliothèque, et les profils enregistrés
// un par fichier dans userData. Au premier lancement, ce qu'ils contiennent est copié dans le
// dossier de Pinout ; rien n'y est supprimé, une version antérieure continue de s'en servir.

const LEGACY_SETTINGS_FILE = 'settings.json'
const LEGACY_LIBRARY_FOLDER = 'library'
const LEGACY_PROFILES_FOLDER = 'profiles'
/** Dossier par défaut d'avant, dans OneDrive : celui du cours de robotique. */
const LEGACY_ONEDRIVE_SUBPATH = ['(Cours)', 'Robotique', '(Ressources)', 'Pinout']
/** Dernière version des paramètres à deux dossiers. */
const LAST_LEGACY_VERSION = 14

/** Les deux anciens réglages de dossier ; vide = le dossier par défaut d'alors. */
export interface LegacyFolders {
  settingsDir: string
  libraryDir: string
}

/**
 * Anciens dossiers d'un fichier de paramètres local, lu tel quel avant toute migration. Sans
 * fichier (première installation) ou déjà à la nouvelle organisation, ce sont les dossiers par
 * défaut d'alors : sur une machine qui partage le OneDrive d'une autre, ils existent peut-être.
 */
export function legacyFoldersOf(localSettingsText: string | null): LegacyFolders {
  const defaults: LegacyFolders = { settingsDir: '', libraryDir: '' }
  if (localSettingsText === null) return defaults
  try {
    const raw: unknown = JSON.parse(localSettingsText)
    if (typeof raw !== 'object' || raw === null) return defaults
    const record = raw as Record<string, unknown>
    const version = record['schemaVersion']
    if (typeof version !== 'number' || version > LAST_LEGACY_VERSION) return defaults
    const text = (value: unknown): string => (typeof value === 'string' ? value : '')
    return { settingsDir: text(record['settingsDir']), libraryDir: text(record['libraryDir']) }
  } catch {
    return defaults
  }
}

function fromOneDrive(dir: string, oneDrive: string | null): string | null {
  if (!dir.startsWith(ONEDRIVE_TOKEN)) return dir
  return oneDrive ? joinPath(oneDrive, dir.slice(ONEDRIVE_TOKEN.length)) : null
}

/** Dossier de l'ancien fichier de paramètres partagé ; null s'il n'y en avait pas sur cette machine. */
async function legacySettingsDir(legacy: LegacyFolders): Promise<string | null> {
  const { oneDrive } = await bridge().getAppPaths()
  if (legacy.settingsDir.length > 0) return fromOneDrive(legacy.settingsDir, oneDrive)
  return oneDrive ? joinPath(oneDrive, ...LEGACY_ONEDRIVE_SUBPATH) : null
}

/** L'ancien fichier de paramètres partagé, s'il existe. */
export async function legacySettingsFile(legacy: LegacyFolders): Promise<string | null> {
  const dir = await legacySettingsDir(legacy)
  if (dir === null) return null
  const file = joinPath(dir, LEGACY_SETTINGS_FILE)
  return (await bridge().pathExists(file)) ? file : null
}

/** L'ancienne bibliothèque de composants. */
export async function legacyLibraryDir(legacy: LegacyFolders): Promise<string> {
  const { userData, oneDrive } = await bridge().getAppPaths()
  if (legacy.libraryDir.length > 0) {
    const dir = fromOneDrive(legacy.libraryDir, oneDrive)
    if (dir !== null) return dir
  }
  return oneDrive
    ? joinPath(oneDrive, ...LEGACY_ONEDRIVE_SUBPATH, LEGACY_LIBRARY_FOLDER)
    : joinPath(userData, LEGACY_LIBRARY_FOLDER)
}

/** L'ancien dossier des profils enregistrés, un fichier par profil. */
export async function legacyProfilesDir(): Promise<string> {
  const { userData } = await bridge().getAppPaths()
  return joinPath(userData, LEGACY_PROFILES_FOLDER)
}

/**
 * Dossier proposé au premier lancement. Celui qui tenait déjà les paramètres partagés, s'il y en
 * avait un (les nouvelles données s'y rangent à côté des anciennes) ; sinon un dossier Pinout dans
 * OneDrive, pour qu'il suive d'une machine à l'autre ; sinon dans Documents.
 */
export async function proposedDataDir(legacy: LegacyFolders): Promise<string> {
  const { documents, oneDrive } = await bridge().getAppPaths()
  const dir = await legacySettingsDir(legacy)
  const chosen = legacy.settingsDir.length > 0
  if (dir !== null && (chosen || (await bridge().pathExists(dir)))) return dir
  return joinPath(oneDrive ?? documents, 'Pinout')
}
