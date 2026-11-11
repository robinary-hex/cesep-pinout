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
import { baseName, dirOf } from '@/io/paths'
import {
  loadSettings,
  portableDir,
  readSharedSettings,
  relocateSharedSettings,
  resolveLibraryDir,
  saveSettings,
  withLocalPart
} from '@/io/settings'

export interface LibraryGroup {
  name: string
  entries: LibraryEntry[]
}

const UNREADABLE_GROUP = 'Illisibles'
const MAX_RECENT_FILES = 10

/** Bibliothèque de composants sur disque et paramètres de l'application. */
export const useLibraryStore = defineStore('library', () => {
  const settings = shallowRef<Settings | null>(null)
  /** Fichier de paramètres partagé, ou null s'ils restent sur cette machine. */
  const sharedSettingsPath = ref<string | null>(null)
  /** Dossier choisi pour ce fichier sur cette machine ; vide = le dossier par défaut. */
  const settingsDir = computed(() => settings.value?.settingsDir ?? '')
  const libraryDir = ref('')
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
  /** Dossier du dernier projet enregistré ou ouvert : là où Enregistrer et Ouvrir s'ouvrent. */
  const lastProjectDir = computed<string | null>(() => {
    const last = recentFiles.value[0]
    return last ? dirOf(last) : null
  })
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
      libraryDir.value = await resolveLibraryDir(loaded.settings)
      await refresh()
    } catch (error) {
      problem.value = `Démarrage incomplet : ${describe(error)}`
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
      const shared = await readSharedSettings(current.settingsDir)
      if (!shared) return false
      const next = withLocalPart(shared, current)
      if (JSON.stringify(next) === JSON.stringify(current)) return false
      settings.value = next
      // La copie locale suit ; le fichier partagé, identique, n'est pas réécrit.
      await saveSettings(next)
      if (next.libraryDir !== current.libraryDir) {
        libraryDir.value = await resolveLibraryDir(next)
        await refresh()
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Enregistre un sous-ensemble de paramètres ; un nouveau dossier de bibliothèque est relu. On
   * part des réglages partagés les plus frais : ce qu'une autre machine a changé entre-temps
   * n'est écrasé que pour les réglages de `patch`.
   */
  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    await reloadSharedSettings()
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    const next: Settings = { ...current, ...patch }
    await persist(next)
    if (patch.libraryDir !== undefined) {
      libraryDir.value = await resolveLibraryDir(next)
      await refresh()
    }
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
      const shared = await readSharedSettings(mine.settingsDir)
      const latest = settings.value ?? mine
      const next = { ...(shared ? withLocalPart(shared, latest) : latest), ...view(latest) }
      await saveSettings(next)
      // D'autres cases ont pu changer pendant l'écriture : elles gardent leur dernier état.
      settings.value = { ...next, ...view(settings.value ?? next) }
    } catch (error) {
      problem.value = `Paramètres non enregistrés : ${describe(error)}`
    }
  }

  async function chooseDir(): Promise<void> {
    const dir = await bridge().showOpenDialog({
      title: 'Dossier de la bibliothèque de composants',
      directory: true,
      defaultPath: libraryDir.value
    })
    if (dir === null) return
    problem.value = ''
    const { oneDrive } = await bridge().getAppPaths()
    await updateSettings({ libraryDir: portableDir(dir, oneDrive) })
  }

  /**
   * Met le fichier de paramètres partagé dans un autre dossier (vide = le dossier par défaut),
   * réglage propre à cette machine. Un dossier qui a déjà des paramètres les donne à
   * l'application (`adopted`) ; sinon les réglages courants y sont écrits (`moved`). Un échec
   * (`failed`) ne change rien et s'explique dans `problem`.
   */
  async function setSettingsDir(dir: string): Promise<'adopted' | 'moved' | 'failed'> {
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    try {
      const moved = await relocateSharedSettings(current, dir)
      settings.value = moved.settings
      sharedSettingsPath.value = moved.sharedPath
      problem.value = ''
      if (moved.settings.libraryDir !== current.libraryDir) {
        libraryDir.value = await resolveLibraryDir(moved.settings)
        await refresh()
      }
      return moved.adopted ? 'adopted' : 'moved'
    } catch (error) {
      problem.value = `Emplacement des paramètres inchangé : ${describe(error)}`
      return 'failed'
    }
  }

  /** Dialogue de choix du dossier des paramètres ; null si l'utilisateur annule. */
  async function chooseSettingsDir(): Promise<'adopted' | 'moved' | 'failed' | null> {
    const dir = await bridge().showOpenDialog({
      title: 'Dossier des paramètres de l’application',
      directory: true,
      ...(sharedSettingsPath.value ? { defaultPath: dirOf(sharedSettingsPath.value) } : {})
    })
    if (dir === null) return null
    const { oneDrive } = await bridge().getAppPaths()
    return setSettingsDir(portableDir(dir, oneDrive))
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
    settingsDir,
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
    lastProjectDir,
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
    chooseDir,
    setSettingsDir,
    chooseSettingsDir,
    addRecentFile,
    removeRecentFile
  }
})
