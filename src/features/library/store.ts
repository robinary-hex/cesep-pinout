import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  DEFAULT_AUTOSAVE_SECONDS,
  DEFAULT_DIAGRAM_DEFAULTS,
  DEFAULT_DIAGRAM_PALETTE,
  DEFAULT_EXPORT,
  DEFAULT_PALETTE,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  type DiagramDefaults,
  type ExportSettings,
  type PaletteColor,
  type Settings,
  type LibraryView,
  type ViewOption,
  type Theme,
  type StyleProfile
} from '@/domain'
import { bridge } from '@/io/bridge'
import { listComponents, type LibraryEntry } from '@/io/library'
import {
  copyComponents,
  dataFolder,
  legacyLibraryDir,
  portableDir,
  prepareDataFolder,
  proposedDataDir,
  resolveDataRoot,
  type LegacyFolders
} from '@/io/dataFolder'
import { isDiagramPath } from '@/io/diagramFiles'
import { baseName, dirOf } from '@/io/paths'
import { addMissingProfiles, listProfiles, readLegacyProfiles } from '@/io/profiles'
import {
  loadSettings,
  readLegacySettings,
  readSharedSettings,
  relocateSharedSettings,
  saveSettings,
  withLocalPart
} from '@/io/settings'

export interface LibraryGroup {
  name: string
  entries: LibraryEntry[]
}

const UNREADABLE_GROUP = 'Illisibles'
const MAX_RECENT_FILES = 10

/** Les documents qui s'enregistrent dans un fichier qu'on choisit. */
export type DocumentKind = 'montage' | 'diagram'

/** Premier lancement : le dossier de Pinout reste à choisir. */
export interface FirstRun {
  /** Dossier proposé. */
  proposal: string
}

/** Bibliothèque de composants sur disque et paramètres de l'application. */
export const useLibraryStore = defineStore('library', () => {
  const settings = shallowRef<Settings | null>(null)
  /** Fichier de paramètres partagé, ou null tant que le dossier de Pinout n'est pas choisi. */
  const sharedSettingsPath = ref<string | null>(null)
  /**
   * Le dossier de Pinout de cette machine : tout y est rangé (voir `src/io/dataFolder.ts`). Null
   * tant qu'il n'est pas choisi.
   */
  const dataRoot = ref<string | null>(null)
  /** La bibliothèque de composants : le dossier Composants du dossier de Pinout. */
  const libraryDir = computed(() =>
    dataRoot.value === null ? '' : dataFolder(dataRoot.value).components
  )
  /** Non nul au premier lancement : l'application demande où mettre le dossier de Pinout. */
  const firstRun = ref<FirstRun | null>(null)
  /** Les deux dossiers de l'ancienne organisation, repris au premier choix du dossier. */
  let legacy: LegacyFolders = { settingsDir: '', libraryDir: '' }
  const entries = shallowRef<LibraryEntry[]>([])
  const loading = ref(false)
  const problem = ref('')
  const search = ref('')

  const ids = computed(() => entries.value.flatMap((entry) => (entry.def ? [entry.def.id] : [])))

  /** Profil de style des nouveaux projets. */
  const defaultProfile = computed<StyleProfile>(
    () => settings.value?.defaultProfile ?? DEFAULT_PROFILE
  )
  /** Style général des diagrammes : celui des nouveaux diagrammes et de leurs nouveaux éléments. */
  const diagramDefaults = computed<DiagramDefaults>(
    () => settings.value?.diagramDefaults ?? DEFAULT_DIAGRAM_DEFAULTS
  )
  /** Palette des fils. */
  const palette = computed<readonly PaletteColor[]>(
    () => settings.value?.palette ?? DEFAULT_PALETTE
  )
  /** Palette des diagrammes : une autre que celle des fils, pastel au départ. */
  const diagramPalette = computed<readonly PaletteColor[]>(
    () => settings.value?.diagramPalette ?? DEFAULT_DIAGRAM_PALETTE
  )
  const defaultWireColor = computed(
    () => settings.value?.defaultWireColor ?? DEFAULT_SETTINGS.defaultWireColor
  )
  const recentFiles = computed<readonly string[]>(() => settings.value?.recentFiles ?? [])
  const exportDefaults = computed<ExportSettings>(() => settings.value?.export ?? DEFAULT_EXPORT)
  const autosaveSeconds = computed(
    () => settings.value?.autosaveSeconds ?? DEFAULT_AUTOSAVE_SECONDS
  )

  const theme = computed<Theme>(() => settings.value?.theme ?? 'light')
  const autoOpenInspector = computed(() => settings.value?.autoOpenInspector ?? true)
  const libraryView = computed<LibraryView>(() => settings.value?.libraryView ?? 'list')
  // Cases d'affichage des barres d'outils, gardées d'un lancement à l'autre.
  const showPins = computed(() => settings.value?.showPins ?? true)
  const showUnconnected = computed(() => settings.value?.showUnconnected ?? true)
  const showGroups = computed(() => settings.value?.showGroups ?? true)

  const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase()
    if (needle.length === 0) return entries.value
    return entries.value.filter((entry) => {
      const def = entry.def
      const haystack = def
        ? `${def.name} ${def.category} ${def.description} ${def.id}`
        : baseName(entry.folder)
      return haystack.toLowerCase().includes(needle)
    })
  })

  const groups = computed<LibraryGroup[]>(() => {
    const byName = new Map<string, LibraryEntry[]>()
    for (const entry of filtered.value) {
      const name = entry.def ? entry.def.category || 'Divers' : UNREADABLE_GROUP
      const list = byName.get(name) ?? []
      list.push(entry)
      byName.set(name, list)
    }
    return [...byName]
      .map(([name, list]) => ({ name, entries: list }))
      .sort((a, b) => {
        if (a.name === UNREADABLE_GROUP) return 1
        if (b.name === UNREADABLE_GROUP) return -1
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      })
  })

  function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  async function refresh(): Promise<void> {
    if (libraryDir.value.length === 0) return
    loading.value = true
    try {
      entries.value = await listComponents(libraryDir.value)
    } catch (error) {
      problem.value = `Lecture de la bibliothèque impossible : ${describe(error)}`
    } finally {
      loading.value = false
    }
  }

  async function init(): Promise<void> {
    try {
      const loaded = await loadSettings()
      settings.value = loaded.settings
      sharedSettingsPath.value = loaded.sharedPath
      problem.value = loaded.problem ?? ''
      legacy = loaded.legacy
      dataRoot.value = await resolveDataRoot(loaded.settings.dataDir)
      if (dataRoot.value === null) {
        // Pas encore de dossier de Pinout : rien n'est lu ni écrit, la coque le demande.
        firstRun.value = { proposal: await proposedDataDir(legacy) }
        return
      }
      await prepare(dataRoot.value)
      await refresh()
    } catch (error) {
      problem.value = `Démarrage incomplet : ${describe(error)}`
    }
  }

  /** Crée les sous-dossiers du dossier de Pinout ; un dossier hors d'atteinte se dit, sans plus. */
  async function prepare(root: string): Promise<void> {
    try {
      await prepareDataFolder(root)
    } catch (error) {
      problem.value = `Dossier de Pinout hors d’atteinte (${root}) : ${describe(error)}`
    }
  }

  async function persist(next: Settings): Promise<void> {
    try {
      await saveSettings(next)
      settings.value = next
    } catch (error) {
      problem.value = `Paramètres non enregistrés : ${describe(error)}`
    }
  }

  /**
   * Reprend le fichier partagé s'il a changé depuis une autre machine ; vrai si les réglages ont
   * changé. Ce qui est propre à cette machine (fichiers récents) reste.
   */
  async function reloadSharedSettings(): Promise<boolean> {
    const current = settings.value
    if (!current) return false
    try {
      const shared = await readSharedSettings(current.dataDir)
      if (!shared) return false
      const next = withLocalPart(shared, current)
      if (JSON.stringify(next) === JSON.stringify(current)) return false
      settings.value = next
      // La copie locale suit ; le fichier partagé, identique, n'est pas réécrit.
      await saveSettings(next)
      return true
    } catch {
      return false
    }
  }

  /**
   * Enregistre un sous-ensemble de paramètres. On part des réglages partagés les plus frais : ce
   * qu'une autre machine a changé entre-temps n'est écrasé que pour les réglages de `patch`.
   */
  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    await reloadSharedSettings()
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    await persist({ ...current, ...patch })
  }

  /**
   * Coche ou décoche une case d'affichage : tout de suite à l'écran, puis dans les paramètres en
   * arrière-plan (les autres réglages du fichier partagé, changés ailleurs entre-temps, sont
   * repris au passage sans toucher à ces cases).
   */
  function setViewOption(key: ViewOption, value: boolean): void {
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    if (current[key] === value) return
    settings.value = { ...current, [key]: value }
    void saveViewOptions()
  }

  async function saveViewOptions(): Promise<void> {
    const view = (from: Settings): Pick<Settings, ViewOption> => ({
      showPins: from.showPins,
      showUnconnected: from.showUnconnected,
      showGroups: from.showGroups
    })
    try {
      const mine = settings.value
      if (!mine) return
      const shared = await readSharedSettings(mine.dataDir)
      const latest = settings.value ?? mine
      const next = { ...(shared ? withLocalPart(shared, latest) : latest), ...view(latest) }
      await saveSettings(next)
      // D'autres cases ont pu changer pendant l'écriture : elles gardent leur dernier état.
      settings.value = { ...next, ...view(settings.value ?? next) }
    } catch (error) {
      problem.value = `Paramètres non enregistrés : ${describe(error)}`
    }
  }

  /**
   * Met le dossier de Pinout à cet endroit, réglage propre à cette machine. Un dossier qui a déjà
   * ses données les apporte : ses paramètres deviennent ceux de l'application (`adopted`), ses
   * composants et ses profils aussi. Un dossier neuf reçoit ce que l'application avait (`moved`) :
   * réglages, profils enregistrés et composants y sont copiés, de l'ancienne organisation au
   * premier lancement, du dossier précédent ensuite. Rien n'est supprimé là d'où l'on vient. Un
   * échec (`failed`) ne change rien et s'explique dans `problem`.
   */
  async function setDataDir(dir: string): Promise<'adopted' | 'moved' | 'failed'> {
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    const first = firstRun.value !== null
    const previousRoot = dataRoot.value
    try {
      const { oneDrive } = await bridge().getAppPaths()
      const stored = portableDir(dir, oneDrive)
      const root = (await resolveDataRoot(stored)) ?? dir
      await prepareDataFolder(root)
      // Les profils qu'on avait, relevés avant de changer de dossier.
      const profiles = first
        ? await readLegacyProfiles()
        : (await listProfiles(previousRoot)).map((saved) => saved.profile)
      const moved = await relocateSharedSettings(
        current,
        stored,
        first ? await readLegacySettings(legacy) : null
      )
      const library = first
        ? await legacyLibraryDir(legacy)
        : previousRoot === null
          ? null
          : dataFolder(previousRoot).components
      if (library !== null) await copyComponents(library, dataFolder(root).components)
      await addMissingProfiles(root, profiles)
      settings.value = moved.settings
      sharedSettingsPath.value = moved.sharedPath
      dataRoot.value = root
      firstRun.value = null
      problem.value = ''
      await refresh()
      return moved.adopted ? 'adopted' : 'moved'
    } catch (error) {
      problem.value = `Dossier de Pinout inchangé : ${describe(error)}`
      return 'failed'
    }
  }

  /** Dialogue de choix du dossier de Pinout ; null si l'utilisateur annule. */
  async function chooseDataDir(): Promise<'adopted' | 'moved' | 'failed' | null> {
    const from = dataRoot.value ?? firstRun.value?.proposal
    const dir = await bridge().showOpenDialog({
      title: 'Dossier de Pinout',
      directory: true,
      ...(from && (await bridge().pathExists(from)) ? { defaultPath: from } : {})
    })
    return dir === null ? null : setDataDir(dir)
  }

  /**
   * Dossier où s'ouvrent « Enregistrer sous » et « Ouvrir » pour ce genre de document : le dernier
   * qui a servi (celui du plus récent des fichiers récents de ce genre), s'il existe encore ;
   * sinon, et au moindre souci, son dossier dans le dossier de Pinout. Null sans dossier de Pinout.
   */
  async function documentDir(kind: DocumentKind): Promise<string | null> {
    const ofKind = (file: string): boolean => isDiagramPath(file) === (kind === 'diagram')
    const last = recentFiles.value.find(ofKind)
    try {
      if (last && (await bridge().pathExists(dirOf(last)))) return dirOf(last)
    } catch {
      // Dossier illisible : on retombe sur celui de Pinout.
    }
    const root = dataRoot.value
    if (root === null) return null
    const dir = kind === 'diagram' ? dataFolder(root).diagrams : dataFolder(root).montages
    await bridge()
      .ensureDir(dir)
      .catch(() => undefined)
    return dir
  }

  async function addRecentFile(path: string): Promise<void> {
    const others = recentFiles.value.filter((candidate) => candidate !== path)
    await updateSettings({ recentFiles: [path, ...others].slice(0, MAX_RECENT_FILES) })
  }

  async function removeRecentFile(path: string): Promise<void> {
    await updateSettings({
      recentFiles: recentFiles.value.filter((candidate) => candidate !== path)
    })
  }

  return {
    settings,
    sharedSettingsPath,
    dataRoot,
    firstRun,
    libraryDir,
    entries,
    filtered,
    groups,
    ids,
    defaultProfile,
    diagramDefaults,
    palette,
    diagramPalette,
    defaultWireColor,
    recentFiles,
    exportDefaults,
    autosaveSeconds,
    theme,
    autoOpenInspector,
    libraryView,
    showPins,
    showUnconnected,
    showGroups,
    setViewOption,
    loading,
    problem,
    search,
    init,
    refresh,
    updateSettings,
    reloadSharedSettings,
    setDataDir,
    chooseDataDir,
    documentDir,
    addRecentFile,
    removeRecentFile
  }
})
