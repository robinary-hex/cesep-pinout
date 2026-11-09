import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  DEFAULT_AUTOSAVE_SECONDS,
  DEFAULT_EXPORT,
  DEFAULT_PALETTE,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  type ExportSettings,
  type PaletteColor,
  type Settings,
  type LibraryView,
  type Theme,
  type StyleProfile
} from '@/domain'
import { bridge } from '@/io/bridge'
import { listComponents, type LibraryEntry } from '@/io/library'
import { baseName, dirOf } from '@/io/paths'
import { loadSettings, portableLibraryDir, resolveLibraryDir, saveSettings } from '@/io/settings'

export interface LibraryGroup {
  name: string
  entries: LibraryEntry[]
}

const UNREADABLE_GROUP = 'Illisibles'
const MAX_CUSTOM_COLORS = 8
const MAX_RECENT_FILES = 10

/** Bibliothèque de composants sur disque et paramètres de l'application. */
export const useLibraryStore = defineStore('library', () => {
  const settings = shallowRef<Settings | null>(null)
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
  const palette = computed<readonly PaletteColor[]>(
    () => settings.value?.palette ?? DEFAULT_PALETTE
  )
  const customColors = computed<readonly string[]>(() => settings.value?.customColors ?? [])
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

  /** Enregistre un sous-ensemble de paramètres ; un nouveau dossier de bibliothèque est relu. */
  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    const current = settings.value ?? structuredClone(DEFAULT_SETTINGS)
    const next: Settings = { ...current, ...patch }
    await persist(next)
    if (patch.libraryDir !== undefined) {
      libraryDir.value = await resolveLibraryDir(next)
      await refresh()
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
    await updateSettings({ libraryDir: portableLibraryDir(dir, oneDrive) })
  }

  /** Garde une couleur personnalisée en tête de liste (les huit dernières). */
  async function rememberCustomColor(hex: string): Promise<void> {
    const current = settings.value
    if (!current) return
    if (current.palette.some((color) => color.hex.toLowerCase() === hex.toLowerCase())) return
    const others = current.customColors.filter((color) => color.toLowerCase() !== hex.toLowerCase())
    await updateSettings({ customColors: [hex, ...others].slice(0, MAX_CUSTOM_COLORS) })
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
    libraryDir,
    entries,
    filtered,
    groups,
    ids,
    defaultProfile,
    palette,
    customColors,
    defaultWireColor,
    recentFiles,
    lastProjectDir,
    exportDefaults,
    autosaveSeconds,
    theme,
    autoOpenInspector,
    libraryView,
    loading,
    problem,
    search,
    init,
    refresh,
    updateSettings,
    chooseDir,
    rememberCustomColor,
    addRecentFile,
    removeRecentFile
  }
})
