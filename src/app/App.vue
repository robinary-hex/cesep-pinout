<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import {
  closeComponentTabAsking,
  saveComponentDoc
} from '@/features/component-editor/componentActions'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { closeDiagramTabAsking, saveDiagram } from '@/features/diagram-editor/diagramActions'
import DiagramEditor from '@/features/diagram-editor/DiagramEditor.vue'
import DiagramLibrary from '@/features/diagram-editor/DiagramLibrary.vue'
import { useDiagramStore } from '@/features/diagram-editor/store'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import { closeTabAsking, saveProject } from '@/features/schematic-editor/projectActions'
import SchematicEditor from '@/features/schematic-editor/SchematicEditor.vue'
import { useSchematicStore } from '@/features/schematic-editor/store'
import ProfileDialog from '@/features/settings/ProfileDialog.vue'
import SettingsDialog from '@/features/settings/SettingsDialog.vue'
import {
  clearAutosave,
  readAutosaves,
  readDiagramAutosaves,
  syncAutosaves,
  syncDiagramAutosaves
} from '@/io/autosave'
import { bridge } from '@/io/bridge'
import { isDiagramPath } from '@/io/diagramFiles'
import { baseName } from '@/io/paths'
import ContextMenu from '@/ui/ContextMenu.vue'
import DialogHost from '@/ui/DialogHost.vue'
import { ask, askToSaveBeforeQuit, confirmAction } from '@/ui/dialogs'
import { heading, item, SEPARATOR, type MenuItem } from '@/ui/contextMenu'
import Icon from '@/ui/Icon.vue'
import type { IconName } from '@/ui/icons'
import { openModals } from '@/ui/modalState'
import { applyTheme } from '@/ui/theme'
import type { UpdateStatus } from '../../electron/api'
import { openExternalFile } from './externalFiles'
import ShortcutsHelp from './ShortcutsHelp.vue'
import { updateButtonLabel, updateButtonTitle } from './update'

// Coque applicative : menu Fichier, bascule entre les modes (un pictogramme chacun), onglets des
// documents ouverts du mode affiché, thème, paramètres, aide, copies de secours et garde à la
// fermeture. Un seul éditeur est monté à la fois, donc un seul jeu de raccourcis ; le menu Fichier
// appelle les actions exposées par l'éditeur visible. Ce que la coque demande à chaque mode
// (onglets, enregistrement, statut) passe par son `ModeAdapter`.

type Mode = 'components' | 'schematic' | 'diagram'

const library = useLibraryStore()
const schematic = useSchematicStore()
const editor = useComponentEditorStore()
const diagram = useDiagramStore()
// Au lancement, le montage ; l'onglet Composants est pourtant le premier de la barre.
const mode = ref<Mode>('schematic')
const showSettings = ref(false)
const showProfile = ref(false)
const showHelp = ref(false)

const schematicEditor = useTemplateRef<InstanceType<typeof SchematicEditor>>('schematicEditor')
const componentEditor = useTemplateRef<InstanceType<typeof ComponentEditor>>('componentEditor')
const diagramEditor = useTemplateRef<InstanceType<typeof DiagramEditor>>('diagramEditor')
const fileButton = ref<HTMLButtonElement | null>(null)
const fileMenu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)

const MAX_RECENT_IN_MENU = 8

// Mise à jour automatique : le principal vérifie GitHub au lancement et tient cet état à jour ;
// le bouton en haut à droite n'apparaît que s'il y a quelque chose à faire.
const update = ref<UpdateStatus | null>(null)
let unsubscribeUpdate: (() => void) | null = null

async function onUpdateClick(): Promise<void> {
  const current = update.value
  if (!current) return
  if (current.state === 'available' || current.state === 'error') {
    update.value = { state: 'downloading', percent: 0 }
    await bridge().downloadUpdate()
  } else if (current.state === 'downloaded') {
    if (
      anyDirty.value &&
      !(await confirmAction({
        title: 'Installer la mise à jour ?',
        message:
          'Des modifications ne sont pas enregistrées : elles seront perdues au redémarrage.',
        confirm: 'Installer et relancer',
        danger: true
      }))
    ) {
      return
    }
    await bridge().installUpdate()
  } else if (current.state === 'manual') {
    window.open(current.url)
  }
}

const anyDirty = computed(() => schematic.anyDirty || editor.anyDirty || diagram.anyDirty)

watch(
  anyDirty,
  (value) => {
    void bridge().setDirty(value)
  },
  { immediate: true }
)

watch(() => library.theme, applyTheme, { immediate: true })

// Onglets, à droite des boutons de mode : ceux des composants ouverts en mode Composants, ceux
// des montages ouverts en mode Montage. Les deux éditeurs offrent la même chose : activer,
// fermer (avec la question à trois boutons si l'onglet est modifié), créer, réordonner.

interface StripTab {
  id: number
  name: string
  /** Infobulle : le fichier ou le dossier, sinon « pas encore enregistré ». */
  title: string
  dirty: boolean
}

/** Ce que la coque demande à un mode, quel que soit son éditeur. */
interface ModeAdapter {
  /** Nom du mode : infobulle de son bouton. */
  label: string
  icon: IconName
  /** Nom d'un document de ce mode, dans les infobulles (« Nouveau montage »). */
  kind: string
  /** Infobulle du point « modifié » sur le bouton du mode quand on en regarde un autre. */
  dirtyTitle: string
  /** Section de l'aide (F1) montrée d'abord dans ce mode. */
  helpSection: string
  tabs: () => StripTab[]
  activeId: () => number
  anyDirty: () => boolean
  activate: (id: number) => void
  create: () => void
  /** Ferme un onglet ; s'il est modifié, la question vient d'abord. */
  close: (id: number) => Promise<unknown>
  move: (id: number, toIndex: number) => void
  cycle: (step: 1 | -1) => void
  /** Enregistre le document affiché ; faux si Robin renonce ou si l'écriture échoue. */
  saveActive: () => Promise<boolean>
  setStatus: (message: string) => void
}

const NOT_SAVED = 'Pas encore enregistré'

const modes: Record<Mode, ModeAdapter> = {
  components: {
    label: 'Composants',
    icon: 'chip',
    kind: 'composant',
    dirtyTitle: "Un composant ouvert n'est pas enregistré",
    helpSection: 'Éditeur de composants',
    tabs: () =>
      editor.tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        title: tab.folder ?? NOT_SAVED,
        dirty: tab.dirty
      })),
    activeId: () => editor.activeTabId,
    anyDirty: () => editor.anyDirty,
    activate: (id) => editor.activateTab(id),
    create: () => editor.newComponent(),
    close: (id) => closeComponentTabAsking(editor, library, id),
    move: (id, toIndex) => editor.moveTab(id, toIndex),
    cycle: (step) => editor.cycleTab(step),
    saveActive: () => saveComponentDoc(editor, library),
    setStatus: (message) => {
      editor.status = message
    }
  },
  schematic: {
    label: 'Montage',
    icon: 'schematic',
    kind: 'montage',
    dirtyTitle: "Un montage ouvert n'est pas enregistré",
    helpSection: 'Montage',
    tabs: () =>
      schematic.tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        title: tab.filePath ?? NOT_SAVED,
        dirty: tab.dirty
      })),
    activeId: () => schematic.activeTabId,
    anyDirty: () => schematic.anyDirty,
    activate: (id) => schematic.activateTab(id),
    create: () => schematic.newProject(),
    close: (id) => closeTabAsking(schematic, library, id),
    move: (id, toIndex) => schematic.moveTab(id, toIndex),
    cycle: (step) => schematic.cycleTab(step),
    saveActive: () => saveProject(schematic, library),
    setStatus: (message) => {
      schematic.status = message
    }
  },
  diagram: {
    label: 'Diagramme',
    icon: 'diagram',
    kind: 'diagramme',
    dirtyTitle: "Un diagramme ouvert n'est pas enregistré",
    helpSection: 'Diagramme',
    tabs: () =>
      diagram.tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        title: tab.filePath ?? NOT_SAVED,
        dirty: tab.dirty
      })),
    activeId: () => diagram.activeTabId,
    anyDirty: () => diagram.anyDirty,
    activate: (id) => diagram.activateTab(id),
    create: () => diagram.newDiagram(),
    close: (id) => closeDiagramTabAsking(diagram, library, id),
    move: (id, toIndex) => diagram.moveTab(id, toIndex),
    cycle: (step) => diagram.cycleTab(step),
    saveActive: () => saveDiagram(diagram, library),
    setStatus: (message) => {
      diagram.status = message
    }
  }
}
/** Ordre des boutons de mode dans la barre. */
const MODE_ORDER: Mode[] = ['components', 'schematic', 'diagram']
/** Ordre des enregistrements avant de quitter : les montages d'abord. */
const SAVE_ORDER: Mode[] = ['schematic', 'diagram', 'components']

const current = computed(() => modes[mode.value])
const strip = computed<{ tabs: StripTab[]; activeId: number; kind: string }>(() => ({
  tabs: current.value.tabs(),
  activeId: current.value.activeId(),
  kind: current.value.kind
}))

function showTab(id: number): void {
  current.value.activate(id)
}

function newTab(): void {
  current.value.create()
}

/** Ferme un onglet ; s'il est modifié, la question vient d'abord : enregistrer, ne pas enregistrer, annuler. */
async function closeTab(id: number): Promise<void> {
  await current.value.close(id)
}

function closeTabOnMiddle(id: number, event: MouseEvent): void {
  if (event.button === 1) void closeTab(id)
}

// Glisser un onglet le réordonne : il prend la place de celui qu'il survole dès que le curseur
// en dépasse le milieu (sans ce seuil, deux onglets de largeurs différentes s'échangeraient en
// boucle).
const draggedTabId = ref<number | null>(null)

function onTabDragStart(id: number, event: DragEvent): void {
  draggedTabId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(id))
  }
}

function onTabDragOver(id: number, event: DragEvent): void {
  const dragged = draggedTabId.value
  if (dragged === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const target = event.currentTarget
  if (dragged === id || !(target instanceof HTMLElement)) return
  const ids = strip.value.tabs.map((tab) => tab.id)
  const from = ids.indexOf(dragged)
  const to = ids.indexOf(id)
  if (from === -1 || to === -1) return
  const rect = target.getBoundingClientRect()
  const pastMiddle = event.clientX > rect.left + rect.width / 2
  if (from < to ? !pastMiddle : pastMiddle) return
  current.value.move(dragged, to)
}

/** La molette fait défiler la rangée d'onglets quand elle déborde. */
function onTabsWheel(event: WheelEvent): void {
  const strip = event.currentTarget
  if (strip instanceof HTMLElement) strip.scrollLeft += event.deltaY
}

// Menu Fichier

function fileMenuItems(): MenuItem[] {
  const common: MenuItem[] = [
    SEPARATOR,
    item(
      'Paramètres…',
      () => {
        showSettings.value = true
      },
      { icon: 'settings' }
    ),
    item(
      'Profil de style général…',
      () => {
        showProfile.value = true
      },
      { icon: 'brush' }
    ),
    item(
      'Raccourcis clavier',
      () => {
        showHelp.value = true
      },
      { hint: 'F1', icon: 'help' }
    ),
    SEPARATOR,
    item('Quitter', () => window.close(), { icon: 'power' })
  ]
  if (mode.value === 'components') {
    return [
      item('Nouveau composant', () => componentEditor.value?.createNew(), {
        hint: 'Ctrl+N',
        icon: 'file-plus'
      }),
      item('Enregistrer le composant', () => void componentEditor.value?.save(), {
        hint: 'Ctrl+S',
        icon: 'save',
        disabled: editor.hasErrors
      }),
      ...common
    ]
  }
  if (mode.value === 'diagram') {
    const recentDiagrams = library.recentFiles.filter(isDiagramPath).slice(0, MAX_RECENT_IN_MENU)
    return [
      item('Nouveau diagramme', () => diagramEditor.value?.createNew(), {
        hint: 'Ctrl+N',
        icon: 'file-plus'
      }),
      item('Ouvrir…', () => void diagramEditor.value?.open(), {
        hint: 'Ctrl+O',
        icon: 'folder-open'
      }),
      heading('Récents'),
      ...(recentDiagrams.length === 0
        ? [item('Aucun diagramme récent', () => undefined, { disabled: true })]
        : recentDiagrams.map((path) =>
            item(baseName(path), () => void diagramEditor.value?.openRecent(path), {
              icon: 'clock'
            })
          )),
      SEPARATOR,
      item('Enregistrer', () => void diagramEditor.value?.save(false), {
        hint: 'Ctrl+S',
        icon: 'save'
      }),
      item('Enregistrer sous…', () => void diagramEditor.value?.save(true), {
        hint: 'Ctrl+Maj+S',
        icon: 'save-as'
      }),
      item('Exporter en PNG ou SVG…', () => diagramEditor.value?.openExport(), {
        hint: 'Ctrl+E',
        icon: 'export'
      }),
      ...common
    ]
  }
  // Les fichiers récents mêlent montages et diagrammes : chaque mode ne montre que les siens.
  const recents = library.recentFiles
    .filter((path) => !isDiagramPath(path))
    .slice(0, MAX_RECENT_IN_MENU)
  return [
    item('Nouveau montage', () => schematicEditor.value?.createNew(), {
      hint: 'Ctrl+N',
      icon: 'file-plus'
    }),
    item('Ouvrir…', () => void schematicEditor.value?.open(), {
      hint: 'Ctrl+O',
      icon: 'folder-open'
    }),
    heading('Récents'),
    ...(recents.length === 0
      ? [item('Aucun projet récent', () => undefined, { disabled: true })]
      : recents.map((path) =>
          item(baseName(path), () => void schematicEditor.value?.openRecent(path), {
            icon: 'clock'
          })
        )),
    SEPARATOR,
    item('Enregistrer', () => void schematicEditor.value?.save(false), {
      hint: 'Ctrl+S',
      icon: 'save'
    }),
    item('Enregistrer sous…', () => void schematicEditor.value?.save(true), {
      hint: 'Ctrl+Maj+S',
      icon: 'save-as'
    }),
    item('Exporter en PNG ou SVG…', () => schematicEditor.value?.openExport(), {
      hint: 'Ctrl+E',
      icon: 'export'
    }),
    ...common
  ]
}

function openFileMenu(): void {
  const rect = fileButton.value?.getBoundingClientRect()
  fileMenu.value = {
    x: rect ? rect.left : 8,
    y: rect ? rect.bottom + 4 : 40,
    items: fileMenuItems()
  }
}

// Copies de secours, à intervalle régulier : une par montage modifié, les autres sont effacées.
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let autosaveBusy = false

async function autosaveTick(): Promise<void> {
  if (autosaveBusy) return
  autosaveBusy = true
  try {
    await syncAutosaves(schematic.dirtyDocuments())
    await syncDiagramAutosaves(diagram.dirtyDocuments())
  } catch (error) {
    current.value.setStatus(
      `Copie de secours impossible : ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    autosaveBusy = false
  }
}

function scheduleAutosave(seconds: number): void {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = setInterval(() => void autosaveTick(), Math.max(10, seconds) * 1000)
}

watch(() => library.autosaveSeconds, scheduleAutosave, { immediate: true })

/** Au lancement : chaque copie de secours trouvée retrouve son onglet, si Robin le veut. */
async function proposeRecovery(): Promise<void> {
  const projects = await readAutosaves()
  const diagrams = await readDiagramAutosaves()
  const count = projects.length + diagrams.length
  if (count === 0) return
  const describe = (meta: { name: string; savedAt: string; originalPath: string | null }): string =>
    `« ${meta.name} » (${new Date(meta.savedAt).toLocaleString('fr-BE')}, ${meta.originalPath ?? 'jamais enregistré'})`
  const lines = [
    ...projects.map(({ meta }) => `Montage ${describe(meta)}`),
    ...diagrams.map(({ meta }) => `Diagramme ${describe(meta)}`)
  ]
  // Fermer la boîte sans choisir récupère : rien n'est perdu, les onglets se referment au besoin.
  const recover = await ask({
    title: count === 1 ? 'Récupérer la copie de secours ?' : 'Récupérer les copies de secours ?',
    message:
      count === 1
        ? 'Pinout s’est arrêté sans que ce document soit enregistré :'
        : `Pinout s’est arrêté sans que ces ${count} documents soient enregistrés :`,
    detail: lines.join('\n'),
    buttons: [
      { label: 'Ne pas récupérer', value: false },
      { label: 'Récupérer', value: true, kind: 'primary' }
    ],
    cancel: true
  })
  if (recover) {
    for (const { project, meta } of projects) schematic.restoreProject(project, meta.originalPath)
    for (const entry of diagrams) diagram.restoreDiagram(entry.diagram, entry.meta.originalPath)
    mode.value = projects.length > 0 ? 'schematic' : 'diagram'
  } else {
    await clearAutosave()
  }
}

// Fichiers venus de l'extérieur : passés au lancement, double-cliqués pendant que l'application
// tourne, ou déposés dans la fenêtre. Un montage prend un onglet, un composant l'éditeur.
async function openExternal(path: string): Promise<void> {
  const result = await openExternalFile(path, { schematic, editor, diagram, library })
  if (result.kind !== null) {
    mode.value =
      result.kind === 'project' ? 'schematic' : result.kind === 'diagram' ? 'diagram' : 'components'
  } else if (result.message.length > 0) {
    // Le refus s'affiche dans la barre d'état de l'éditeur visible.
    current.value.setStatus(result.message)
  }
}

/**
 * La fenêtre reprend la main : si une autre machine a changé les paramètres partagés (OneDrive),
 * ils sont repris, et les montages qui suivaient l'ancien profil général prennent le nouveau.
 */
async function onWindowFocus(): Promise<void> {
  if (openModals.value > 0) return
  const previous = library.defaultProfile
  const previousStyle = library.diagramDefaults.style
  if (await library.reloadSharedSettings()) {
    schematic.followGeneralProfile(previous, library.defaultProfile)
    diagram.followGeneralStyle(previousStyle, library.diagramDefaults.style)
  }
}

function onWindowDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = openModals.value === 0 ? 'copy' : 'none'
}

function onWindowDrop(event: DragEvent): void {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  // Sans ceci, la fenêtre afficherait le fichier à la place de l'application.
  event.preventDefault()
  if (openModals.value > 0) return
  const paths = Array.from(files)
    .map((file) => bridge().pathForFile(file))
    .filter((path) => path.length > 0)
  void (async () => {
    for (const path of paths) await openExternal(path)
  })()
}

/** Enregistre tous les documents modifiés, mode par mode ; faux dès qu'un enregistrement échoue. */
async function saveEverything(): Promise<boolean> {
  for (const key of SAVE_ORDER) {
    const adapter = modes[key]
    for (const tab of adapter.tabs().filter((candidate) => candidate.dirty)) {
      mode.value = key
      adapter.activate(tab.id)
      if (!(await adapter.saveActive())) return false
    }
  }
  return true
}

/**
 * « Enregistrer » avant de quitter : chaque document modifié de chaque mode, affiché à son tour ;
 * un refus garde la fenêtre.
 */
async function saveThenQuit(): Promise<void> {
  if (await saveEverything()) await bridge().confirmQuit()
  else await bridge().cancelQuit()
}

/** « Ne pas enregistrer » : les copies de secours disparaissent, le prochain lancement part à vide. */
async function discardThenQuit(): Promise<void> {
  try {
    await clearAutosave()
  } finally {
    await bridge().confirmQuit()
  }
}

/** Vrai tant que la question « enregistrer avant de quitter ? » est à l'écran. */
let askingToQuit = false

/**
 * La fenêtre se ferme avec des modifications : le principal le signale, le rendu accuse réception
 * (sans quoi le dialogue de Windows prendrait le relais) et pose la question dans sa propre boîte.
 */
async function askThenQuit(): Promise<void> {
  await bridge().quitAsked()
  if (askingToQuit) return
  askingToQuit = true
  try {
    const choice = await askToSaveBeforeQuit()
    if (choice === 'save') await saveThenQuit()
    else if (choice === 'discard') await discardThenQuit()
  } finally {
    askingToQuit = false
  }
}

let unsubscribe: (() => void) | null = null
let unsubscribeOpenFile: (() => void) | null = null

onMounted(async () => {
  unsubscribe = bridge().onAppRequest((request) => {
    void (async () => {
      if (request === 'ask-then-quit') await askThenQuit()
      else if (request === 'save-then-quit') await saveThenQuit()
      else await discardThenQuit()
    })()
  })
  unsubscribeUpdate = bridge().onUpdateStatus((status) => {
    update.value = status
  })
  unsubscribeOpenFile = bridge().onOpenFile((path) => void openExternal(path))
  await library.init()
  // Les paramètres sont lus : le montage vierge du lancement repart du profil et de la couleur
  // par défaut.
  if (schematic.pristine) schematic.newProject()
  schematic.syncCurrentColor()
  if (diagram.pristine) diagram.newDiagram()
  diagram.syncDefaults()
  await proposeRecovery()
  const launch = await bridge().getLaunchFile()
  if (launch) await openExternal(launch)
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribeUpdate?.()
  unsubscribeOpenFile?.()
  if (autosaveTimer) clearInterval(autosaveTimer)
})

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'F1') {
    event.preventDefault()
    if (openModals.value === 0) showHelp.value = true
  } else if (event.key === 'Tab' && event.ctrlKey && openModals.value === 0) {
    // Ctrl+Tab / Ctrl+Maj+Tab : onglet suivant / précédent, dans l'éditeur visible.
    event.preventDefault()
    current.value.cycle(event.shiftKey ? -1 : 1)
  }
}

/**
 * Alt seule ne doit rien activer dans la fenêtre (menu du système ou du navigateur) : c'est une
 * touche de dessin, pour copier en glissant ou tracer un fil à 45°. AltGr n'est pas concernée.
 */
function swallowAlt(event: KeyboardEvent): void {
  if (event.key === 'Alt') event.preventDefault()
}

/**
 * Un clic hors du champ en cours de saisie le valide d'abord : `blur()` déclenche son `change`
 * tout de suite, avant que le clic n'atteigne le canevas et que la sélection, en changeant, ne
 * retire le champ du panneau avec ce qu'on venait d'y taper.
 */
function commitFocusedField(event: PointerEvent): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
  if (event.target instanceof Node && active.contains(event.target)) return
  active.blur()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keydown', swallowAlt)
  window.addEventListener('keyup', swallowAlt)
  window.addEventListener('pointerdown', commitFocusedField, true)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keydown', swallowAlt)
  window.removeEventListener('keyup', swallowAlt)
  window.removeEventListener('pointerdown', commitFocusedField, true)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <button
        ref="fileButton"
        type="button"
        class="ghost with-icon"
        :class="{ open: fileMenu !== null }"
        title="Nouveau, ouvrir, enregistrer, exporter, paramètres, quitter"
        @click="openFileMenu"
      >
        Fichier <Icon name="chevron-down" :size="14" />
      </button>
      <nav class="modes">
        <button
          v-for="key in MODE_ORDER"
          :key="key"
          type="button"
          :class="{ active: mode === key }"
          :title="modes[key].label"
          :aria-label="modes[key].label"
          @click="mode = key"
        >
          <Icon :name="modes[key].icon" :size="20" />
          <span
            v-if="mode !== key && modes[key].anyDirty()"
            class="doc-tab-dot"
            :title="modes[key].dirtyTitle"
          />
        </button>
      </nav>
      <div class="doc-tabs" @wheel.prevent="onTabsWheel">
        <div
          v-for="tab in strip.tabs"
          :key="`${strip.kind}-${tab.id}`"
          class="doc-tab"
          :class="{ active: tab.id === strip.activeId, dragging: tab.id === draggedTabId }"
          role="tab"
          tabindex="0"
          draggable="true"
          :title="tab.title"
          @dragstart="onTabDragStart(tab.id, $event)"
          @dragover="onTabDragOver(tab.id, $event)"
          @drop.prevent
          @dragend="draggedTabId = null"
          @click="showTab(tab.id)"
          @keydown.enter="showTab(tab.id)"
          @mousedown.middle.prevent
          @auxclick.prevent="closeTabOnMiddle(tab.id, $event)"
        >
          <span class="doc-tab-label">
            <span class="doc-tab-name">{{ tab.name }}</span>
            <span v-if="tab.dirty" class="doc-tab-dot" title="Modifications non enregistrées" />
          </span>
          <button
            type="button"
            class="doc-tab-close"
            :title="`Fermer ce ${strip.kind} (ou clic du milieu sur l’onglet)`"
            @click.stop="closeTab(tab.id)"
          >
            ✕
          </button>
        </div>
        <button
          type="button"
          class="ghost icon-only"
          :title="`Nouveau ${strip.kind} (Ctrl+N)`"
          @click="newTab"
        >
          <Icon name="plus" :size="16" />
        </button>
      </div>
      <div class="spacer" />
      <button
        v-if="update"
        type="button"
        class="with-icon update"
        :class="update.state"
        :disabled="update.state === 'downloading'"
        :title="updateButtonTitle(update)"
        @click="onUpdateClick"
      >
        <Icon name="export" :size="15" /> {{ updateButtonLabel(update) }}
      </button>
      <div class="group">
        <button
          type="button"
          class="ghost icon-only"
          title="Raccourcis clavier (F1)"
          @click="showHelp = true"
        >
          <Icon name="help" :size="18" />
        </button>
        <button
          type="button"
          class="ghost icon-only"
          title="Profil de style général"
          @click="showProfile = true"
        >
          <Icon name="brush" :size="18" />
        </button>
        <button
          type="button"
          class="ghost icon-only"
          title="Paramètres"
          @click="showSettings = true"
        >
          <Icon name="settings" :size="18" />
        </button>
      </div>
    </header>
    <main class="workspace">
      <DiagramLibrary v-if="mode === 'diagram'" />
      <LibraryPanel v-else :mode="mode === 'components' ? 'edit' : 'place'" />
      <ComponentEditor v-if="mode === 'components'" ref="componentEditor" />
      <DiagramEditor v-else-if="mode === 'diagram'" ref="diagramEditor" />
      <SchematicEditor v-else ref="schematicEditor" />
    </main>
    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
    <ProfileDialog
      v-if="showProfile"
      target="general"
      :initial-tab="mode === 'diagram' ? 'diagram' : 'montage'"
      @close="showProfile = false"
    />
    <ShortcutsHelp v-if="showHelp" :initial="current.helpSection" @close="showHelp = false" />
    <ContextMenu
      v-if="fileMenu"
      :x="fileMenu.x"
      :y="fileMenu.y"
      :items="fileMenu.items"
      @close="fileMenu = null"
    />
    <DialogHost />
  </div>
</template>
