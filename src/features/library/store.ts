import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  DEFAULT_PALETTE,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  type PaletteColor,
  type Settings,
  type StyleProfile
} from '@/domain'
import { bridge } from '@/io/bridge'
import { listComponents, type LibraryEntry } from '@/io/library'
import { baseName } from '@/io/paths'
import { loadSettings, resolveLibraryDir, saveSettings } from '@/io/settings'

export interface LibraryGroup {
  name: string
  entries: LibraryEntry[]
}

const UNREADABLE_GROUP = 'Illisibles'
const MAX_CUSTOM_COLORS = 8

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

  async function chooseDir(): Promise<void> {
    const current = settings.value
    if (!current) return
    const dir = await bridge().showOpenDialog({
      title: 'Dossier de la bibliothèque de composants',
      directory: true,
      defaultPath: libraryDir.value
    })
    if (dir === null) return
    await persist({ ...current, libraryDir: dir })
    libraryDir.value = dir
    problem.value = ''
    await refresh()
  }

  /** Garde une couleur personnalisée en tête de liste (les huit dernières). */
  async function rememberCustomColor(hex: string): Promise<void> {
    const current = settings.value
    if (!current) return
    if (current.palette.some((color) => color.hex.toLowerCase() === hex.toLowerCase())) return
    const others = current.customColors.filter((color) => color.toLowerCase() !== hex.toLowerCase())
    await persist({ ...current, customColors: [hex, ...others].slice(0, MAX_CUSTOM_COLORS) })
  }

  return {
    libraryDir,
    entries,
    filtered,
    groups,
    ids,
    defaultProfile,
    palette,
    customColors,
    defaultWireColor,
    loading,
    problem,
    search,
    init,
    refresh,
    chooseDir,
    rememberCustomColor
  }
})
