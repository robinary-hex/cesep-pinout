import type { Draft, Objectish } from 'immer'
import { computed, ref, shallowRef } from 'vue'
import { History } from './history'

// Documents ouverts d'un éditeur, un par onglet. Le document affiché vit dans des refs (ce que
// l'éditeur lit et modifie) ; les autres attendent, rangés avec leur historique et leur état
// d'édition (vue, sélection…), et `activateTab` range l'un pour charger l'autre. Les trois
// éditeurs (composants, montage, diagramme) partagent cette mécanique ; chacun y branche son
// propre état d'édition par `capture` et `restore`.

/** Onglet tel que la barre d'application le montre. */
export interface DocumentTab {
  id: number
  name: string
  /** Fichier ou dossier du document ; null tant qu'il n'a jamais été enregistré. */
  path: string | null
  dirty: boolean
}

/** Ce qu'un onglet garde quand il n'est pas affiché. */
export interface StashedTab<D extends Objectish, E> {
  id: number
  history: History<D>
  /** Dernier état enregistré (le document lui-même quand rien n'a changé) ; null = à enregistrer. */
  savedDoc: D | null
  path: string | null
  editing: E
}

/** Document modifié d'un onglet, pour la copie de secours ; `key` est l'identifiant de l'onglet. */
export interface UnsavedDocument<D> {
  key: number
  doc: D
  path: string | null
}

export interface DocumentTabsOptions<D extends Objectish, E> {
  /** Document vierge d'un nouvel onglet. */
  blank: () => D
  /** Le document a-t-il quelque chose à enregistrer ? */
  needsSaving: (doc: D, saved: D | null, path: string | null) => boolean
  /** État d'édition d'un onglet qui s'ouvre. */
  freshEditing: () => E
  /** État d'édition vivant, à ranger avec l'onglet qu'on quitte. */
  capture: () => E
  /** Rend vivant l'état d'édition de l'onglet qu'on montre (et abandonne les gestes en cours). */
  restore: (editing: E) => void
  /** Avant de quitter l'onglet affiché : terminer ce qui était en cours (un tracé, par exemple). */
  beforeLeave?: () => void
  /** Après tout changement du document affiché : commande, annulation, changement d'onglet. */
  afterSync?: () => void
}

// Le type de retour est celui de l'objet construit : l'écrire à la main le répéterait en entier.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDocumentTabs<D extends Objectish & { name: string }, E>(
  options: DocumentTabsOptions<D, E>
) {
  let nextTabId = 1

  function freshTab(doc: D, saved: D | null, path: string | null): StashedTab<D, E> {
    return {
      id: nextTabId++,
      history: new History<D>(doc),
      savedDoc: saved,
      path,
      editing: options.freshEditing()
    }
  }

  /** Onglet d'un document vierge : il n'a rien à enregistrer tant qu'on n'y touche pas. */
  function blankTab(): StashedTab<D, E> {
    const blank = options.blank()
    return freshTab(blank, blank, null)
  }

  const firstTab = blankTab()
  /** Historique de l'onglet affiché ; remplacé à chaque changement d'onglet. */
  let history = firstTab.history
  /** États rangés des onglets ; celui de l'onglet affiché n'y est à jour qu'après `stash`. */
  const stashed = shallowRef<StashedTab<D, E>[]>([firstTab])
  const activeTabId = ref(firstTab.id)

  const doc = shallowRef<D>(history.value)
  const savedDoc = shallowRef<D | null>(firstTab.savedDoc)
  const path = ref<string | null>(null)
  const undoLabel = ref<string | null>(null)
  const redoLabel = ref<string | null>(null)

  const dirty = computed(() => options.needsSaving(doc.value, savedDoc.value, path.value))
  /** Onglet vierge : jamais enregistré, jamais touché. Un document qu'on ouvre prend sa place. */
  const pristine = computed(() => path.value === null && doc.value === savedDoc.value)
  const tabs = computed<DocumentTab[]>(() =>
    stashed.value.map((tab) =>
      tab.id === activeTabId.value
        ? { id: tab.id, name: doc.value.name, path: path.value, dirty: dirty.value }
        : {
            id: tab.id,
            name: tab.history.value.name,
            path: tab.path,
            dirty: options.needsSaving(tab.history.value, tab.savedDoc, tab.path)
          }
    )
  )
  const anyDirty = computed(() => tabs.value.some((tab) => tab.dirty))

  /** Le document affiché redevient celui de l'historique ; l'éditeur ajuste ce qui en dépend. */
  function sync(): void {
    doc.value = history.value
    undoLabel.value = history.undoLabel
    redoLabel.value = history.redoLabel
    options.afterSync?.()
  }

  /** Commande nommée sur le document affiché ; faux si elle n'a rien changé. */
  function apply(label: string, recipe: (draft: Draft<D>) => void): boolean {
    const changed = history.apply(label, recipe)
    if (changed) sync()
    return changed
  }

  /** Annule la dernière commande ; retourne son libellé, ou null s'il n'y a rien à annuler. */
  function undo(): string | null {
    const label = history.undo()
    if (label !== null) sync()
    return label
  }

  function redo(): string | null {
    const label = history.redo()
    if (label !== null) sync()
    return label
  }

  /** Remplace le document affiché et vide son historique ; `saved` devient son état enregistré. */
  function reset(document: D, saved: D | null): void {
    history.reset(document)
    savedDoc.value = saved
    sync()
  }

  /** Range l'état vivant dans l'onglet affiché, avant d'en montrer un autre. */
  function stash(): void {
    const id = activeTabId.value
    const state: StashedTab<D, E> = {
      id,
      history,
      savedDoc: savedDoc.value,
      path: path.value,
      editing: options.capture()
    }
    stashed.value = stashed.value.map((tab) => (tab.id === id ? state : tab))
  }

  /** Montre un onglet : document, historique et état d'édition deviennent l'état vivant. */
  function load(tab: StashedTab<D, E>): void {
    history = tab.history
    savedDoc.value = tab.savedDoc
    path.value = tab.path
    activeTabId.value = tab.id
    options.restore(tab.editing)
    sync()
  }

  /** Affiche un autre onglet ; vrai s'il y a eu un changement. */
  function activateTab(id: number): boolean {
    if (id === activeTabId.value) return false
    const target = stashed.value.find((tab) => tab.id === id)
    if (!target) return false
    options.beforeLeave?.()
    stash()
    load(target)
    return true
  }

  /** Onglet suivant (1) ou précédent (-1), en boucle. */
  function cycleTab(step: 1 | -1): void {
    const list = stashed.value
    const index = list.findIndex((tab) => tab.id === activeTabId.value)
    const next = list[(index + step + list.length) % list.length]
    if (next) activateTab(next.id)
  }

  /** Déplace un onglet à la position donnée dans la rangée (glisser-déposer). */
  function moveTab(id: number, toIndex: number): void {
    const list = [...stashed.value]
    const from = list.findIndex((tab) => tab.id === id)
    const [tab] = from === -1 ? [] : list.splice(from, 1)
    if (!tab) return
    list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, tab)
    stashed.value = list
  }

  /** Montre un document dans un onglet : l'onglet affiché s'il est vierge, sinon un nouveau. */
  function showInTab(document: D, saved: D | null, documentPath: string | null): void {
    options.beforeLeave?.()
    const tab = freshTab(document, saved, documentPath)
    if (pristine.value) {
      const replaced = activeTabId.value
      stashed.value = stashed.value.map((other) => (other.id === replaced ? tab : other))
    } else {
      stash()
      stashed.value = [...stashed.value, tab]
    }
    load(tab)
  }

  /** Nouveau document vierge, dans son onglet. */
  function showBlank(): void {
    const blank = options.blank()
    showInTab(blank, blank, null)
  }

  /** Le document affiché vient d'être enregistré à cet endroit. */
  function markSaved(savedPath: string): void {
    savedDoc.value = doc.value
    path.value = savedPath
  }

  /**
   * Ferme un onglet sans rien demander ; vrai s'il existait. La question « enregistrer ? » d'un
   * document modifié se pose avant. Fermer le dernier onglet laisse un document vierge.
   */
  function closeTab(id: number): boolean {
    const index = stashed.value.findIndex((tab) => tab.id === id)
    if (index === -1) return false
    const remaining = stashed.value.filter((tab) => tab.id !== id)
    if (id !== activeTabId.value) {
      stashed.value = remaining
      return true
    }
    // L'onglet affiché disparaît : son voisin prend sa place, sans rien ranger.
    const next = remaining[Math.min(index, remaining.length - 1)] ?? blankTab()
    stashed.value = remaining.length > 0 ? remaining : [next]
    load(next)
    return true
  }

  /** Documents à enregistrer, un par onglet concerné : ce que la copie de secours doit contenir. */
  function unsavedDocuments(): UnsavedDocument<D>[] {
    return stashed.value.flatMap((tab) => {
      const active = tab.id === activeTabId.value
      const current = active ? doc.value : tab.history.value
      const saved = active ? savedDoc.value : tab.savedDoc
      const currentPath = active ? path.value : tab.path
      return options.needsSaving(current, saved, currentPath)
        ? [{ key: tab.id, doc: current, path: currentPath }]
        : []
    })
  }

  /**
   * Passe chaque onglet rangé (pas l'onglet affiché) à `change`, qui peut agir sur son historique
   * et retourner un onglet modifié : pour une commande qui touche tous les documents ouverts.
   */
  function updateStashedTabs(change: (tab: StashedTab<D, E>) => StashedTab<D, E>): void {
    stashed.value = stashed.value.map((tab) => (tab.id === activeTabId.value ? tab : change(tab)))
  }

  return {
    doc,
    savedDoc,
    path,
    activeTabId,
    tabs,
    dirty,
    pristine,
    anyDirty,
    undoLabel,
    redoLabel,
    sync,
    apply,
    undo,
    redo,
    reset,
    activateTab,
    cycleTab,
    moveTab,
    showInTab,
    showBlank,
    markSaved,
    closeTab,
    unsavedDocuments,
    updateStashedTabs
  }
}
