import { computed, type ComputedRef, type Ref } from 'vue'
import { groupIds, nextGroupId, type Groupable } from '@/domain'

// Groupes d'un document dont les éléments ont un identifiant (montage, diagramme) : ce qu'il faut
// pour les sélectionner d'un bloc, les former et les défaire. L'appartenance est sur chaque élément
// (`group`, voir src/domain/groups.ts) ; ici, la vue par groupe et les commandes.

export interface GroupedElement extends Groupable {
  id: string
}

/** Un groupe et ses membres, par sorte d'élément. */
export interface DocumentGroup<K extends string> {
  id: string
  members: Record<K, string[]>
}

/** Une sorte d'élément : ceux du document affiché, et ceux qui sont sélectionnés. */
export interface GroupedKind {
  elements: () => readonly GroupedElement[]
  selected: Ref<string[]>
}

export interface DocumentGroups<K extends string> {
  groups: ComputedRef<DocumentGroup<K>[]>
  hasGroups: ComputedRef<boolean>
  /** Vrai dès deux éléments sélectionnés, sauf s'ils forment déjà exactement un groupe. */
  canGroup: ComputedRef<boolean>
  /** Vrai quand la sélection touche un groupe. */
  canUngroup: ComputedRef<boolean>
  /** Après un clic qui a sélectionné ou désélectionné un élément : tout son groupe le suit. */
  syncGroupSelection: (kind: K, id: string) => void
  /** Après un lasso : chaque groupe touché est pris en entier. */
  expandSelectionToGroups: () => void
  /** Fait un groupe de la sélection ; faux s'il n'y a rien à grouper. */
  groupSelection: () => boolean
  /** Défait les groupes que la sélection touche ; faux s'il n'y en a pas. */
  ungroupSelection: () => boolean
  /** Tous les éléments groupables du document. */
  elements: () => GroupedElement[]
}

export function useGroups<K extends string>(options: {
  kinds: Record<K, GroupedKind>
  /**
   * Applique une commande nommée qui change le groupe d'éléments : pour chacun, `change` rend son
   * nouveau groupe, `undefined` pour le lui retirer, ou `null` pour ne pas y toucher.
   */
  write: (
    label: string,
    change: (kind: K, element: GroupedElement) => string | undefined | null
  ) => void
}): DocumentGroups<K> {
  const kinds = Object.keys(options.kinds) as K[]
  const selectedOf = (kind: K): Ref<string[]> => options.kinds[kind].selected
  const elements = (): GroupedElement[] =>
    kinds.flatMap((kind) => [...options.kinds[kind].elements()])

  const groups = computed<DocumentGroup<K>[]>(() =>
    groupIds(elements()).map((id) => ({
      id,
      members: Object.fromEntries(
        kinds.map((kind) => [
          kind,
          options.kinds[kind]
            .elements()
            .filter((element) => element.group === id)
            .map((element) => element.id)
        ])
      ) as Record<K, string[]>
    }))
  )
  const hasGroups = computed(() => groups.value.length > 0)

  const touches = (group: DocumentGroup<K>): boolean =>
    kinds.some((kind) => group.members[kind].some((id) => selectedOf(kind).value.includes(id)))
  const selectedGroups = computed(() => groups.value.filter(touches))
  const selectedCount = computed(() =>
    kinds.reduce((sum, kind) => sum + selectedOf(kind).value.length, 0)
  )
  const canUngroup = computed(() => selectedGroups.value.length > 0)
  const canGroup = computed(() => {
    if (selectedCount.value < 2) return false
    const only = selectedGroups.value.length === 1 ? selectedGroups.value[0] : undefined
    if (!only) return true
    return kinds.some((kind) =>
      selectedOf(kind).value.some((id) => !only.members[kind].includes(id))
    )
  })

  function add(group: DocumentGroup<K>): void {
    for (const kind of kinds) {
      const current = selectedOf(kind).value
      const missing = group.members[kind].filter((id) => !current.includes(id))
      if (missing.length > 0) selectedOf(kind).value = [...current, ...missing]
    }
  }

  function remove(group: DocumentGroup<K>): void {
    for (const kind of kinds) {
      const current = selectedOf(kind).value
      const kept = current.filter((id) => !group.members[kind].includes(id))
      if (kept.length !== current.length) selectedOf(kind).value = kept
    }
  }

  function syncGroupSelection(kind: K, id: string): void {
    const element = options.kinds[kind].elements().find((candidate) => candidate.id === id)
    const group =
      element?.group === undefined
        ? undefined
        : groups.value.find((candidate) => candidate.id === element.group)
    if (!group) return
    if (selectedOf(kind).value.includes(id)) add(group)
    else remove(group)
  }

  function expandSelectionToGroups(): void {
    for (const group of groups.value) if (touches(group)) add(group)
  }

  function groupSelection(): boolean {
    if (!canGroup.value) return false
    const id = nextGroupId(elements())
    const chosen = Object.fromEntries(
      kinds.map((kind) => [kind, new Set(selectedOf(kind).value)])
    ) as Record<K, Set<string>>
    options.write('Grouper', (kind, element) => (chosen[kind].has(element.id) ? id : null))
    return true
  }

  function ungroupSelection(): boolean {
    const ids = new Set(selectedGroups.value.map((group) => group.id))
    if (ids.size === 0) return false
    options.write('Dégrouper', (_kind, element) =>
      element.group !== undefined && ids.has(element.group) ? undefined : null
    )
    return true
  }

  return {
    groups,
    hasGroups,
    canGroup,
    canUngroup,
    syncGroupSelection,
    expandSelectionToGroups,
    groupSelection,
    ungroupSelection,
    elements
  }
}
