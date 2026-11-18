import { castDraft, type Draft } from 'immer'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  BASE_VARIANT,
  componentIssues,
  componentPrimitives,
  componentVariants,
  hasVariants,
  movedVariantOrder,
  nextVariantId,
  nextVariantName,
  defaultStretch,
  freeModelCount,
  modelDefinition,
  modelDrawing,
  STRETCH_MAX_COUNT,
  stretchAxis,
  stretchExtent,
  variantDefinition,
  arrangedPins,
  createEmptyComponent,
  groupIds,
  importedImageSize,
  isInsideBox,
  naturalImageSize,
  nextGroupId,
  nextPinGroupId,
  nextPinGroupName,
  normalizedStretch,
  pinsInside,
  placedPin,
  placeReadout,
  primitiveBounds,
  primitiveReadout,
  QUARTERS_PER_CELL,
  regroupedCopies,
  renumberPins,
  reorderItem,
  translatePrimitive,
  withFreeImageFiles,
  type Box,
  type ComponentBody,
  type ComponentDefinition,
  type ComponentVariant,
  type LocalPoint,
  type Pin,
  type Primitive,
  type Readout,
  type ShapeStyle,
  type Size,
  type StackMove,
  type Stretch
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { samePath } from '@/io/paths'
import { useInspectorPanel } from '@/state/inspector'
import { useDocumentTabs } from '@/state/tabs'
import { fittingCellPx } from './pinLabelLayout'
import type { ToolId } from './tools'

/** Sélection : des formes (indices, triés) et des broches (identifiants), ensemble. */
export interface Selection {
  indexes: number[]
  pinIds: string[]
}

/** Ce qu'un clic peut viser dans l'éditeur : une forme (par son rang) ou une broche. */
export type EditorElementRef = { kind: 'primitive'; index: number } | { kind: 'pin'; id: string }

/** Groupe du composant en cours : ses formes (par leur rang dans le dessin) et ses broches. */
export interface EditorGroup {
  id: string
  indexes: number[]
  pinIds: string[]
}

/** Onglet affiché dans la barre d'application. */
export interface ComponentTabInfo {
  id: number
  name: string
  folder: string | null
  dirty: boolean
}

/**
 * État d'édition qu'un onglet garde quand il n'est pas affiché : sa sélection, son zoom, la
 * variante qu'on y regardait et, pour un composant extensible, le modèle qu'on y retouchait.
 */
interface TabEditing {
  selection: Selection | null
  cellPx: number
  variant: string | null
  model: number | null
}

const MIN_CELL_PX = 8
const MAX_CELL_PX = 200
const FIT_PADDING_PX = 48
const FIT_SAFETY_PX = 2
const DEFAULT_CELL_PX = 40

function nextPinId(pins: ReadonlyArray<Pin>): string {
  const taken = new Set(pins.map((pin) => pin.id))
  for (let n = 1; ; n++) {
    const id = `p${n}`
    if (!taken.has(id)) return id
  }
}

/** Dessin vierge : aucune forme, aucune broche. */
function isBlankBody(body: ComponentBody): boolean {
  return body.visual.primitives.length === 0 && body.pins.length === 0
}

/** Composant vierge : rien de dessiné, aucune broche, pas de variante. */
function isBlank(def: ComponentDefinition): boolean {
  return isBlankBody(def) && !hasVariants(def)
}

/**
 * Des modifications à enregistrer ? Pas si le composant est intact, ni s'il n'a jamais été
 * enregistré et qu'il est encore vierge : on le ferme, et on quitte l'application, sans question.
 */
function needsSaving(
  def: ComponentDefinition,
  saved: ComponentDefinition | null,
  folder: string | null
): boolean {
  return def !== saved && !(folder === null && isBlank(def))
}

/**
 * Composants ouverts dans l'éditeur, un par onglet, et celui en cours d'édition. Le document est
 * immuable ; chaque commande passe par l'historique de son onglet (patches Immer). Les onglets
 * sont ceux de `useDocumentTabs` (`src/state/tabs.ts`) : l'onglet actif vit dans des refs, les
 * autres attendent, rangés. Le presse-papiers des formes est commun aux onglets.
 */
export const useComponentEditorStore = defineStore('componentEditor', () => {
  function blankComponent(): ComponentDefinition {
    return createEmptyComponent('nouveau-composant', 'Nouveau composant')
  }

  const library = useLibraryStore()
  const selection = ref<Selection | null>(null)
  /**
   * Variante en cours d'édition : null pour la première (celle que le composant porte lui-même),
   * sinon son identifiant. Toute l'édition porte sur elle : `shown` pour lire, `bodyOf` pour écrire.
   */
  const activeVariant = ref<string | null>(null)
  /**
   * Modèle particulier en cours d'édition, par son nombre de motifs ; null : le dessin qui
   * s'étire. Un composant extensible peut avoir, pour certains nombres, un dessin à part
   * (`stretch.models`) : on en retouche un à la fois, comme les variantes.
   */
  const activeModel = ref<number | null>(null)
  const tool = ref<ToolId>('select')
  /** Panneau de propriétés à droite (`useInspectorPanel`) : replié par défaut, touche I. */
  const inspector = useInspectorPanel({
    hasSelection: () => selection.value !== null,
    autoOpen: () => library.autoOpenInspector
  })
  const inspectorOpen = inspector.open
  const inspectorFloating = inspector.floating

  /**
   * Un clic vient de sélectionner une forme ou une broche : le panneau de propriétés se montre si
   * les paramètres le demandent, le temps de la sélection.
   */
  function revealInspector(): void {
    inspector.reveal()
  }
  /** Pixels par cellule dans l'éditeur (zoom), continu. */
  const cellPx = ref(DEFAULT_CELL_PX)
  const viewport = ref({ width: 800, height: 600 })
  const hoverPinId = ref<string | null>(null)
  const status = ref('')

  // Onglets : mécanique partagée (`useDocumentTabs`) ; ici, ce qu'un onglet garde de l'édition.
  const base = useDocumentTabs<ComponentDefinition, TabEditing>({
    blank: blankComponent,
    needsSaving,
    freshEditing: () => ({ selection: null, cellPx: DEFAULT_CELL_PX, variant: null, model: null }),
    capture: () => ({
      selection: selection.value,
      cellPx: cellPx.value,
      variant: activeVariant.value,
      model: activeModel.value
    }),
    restore: (editing) => {
      selection.value = editing.selection
      cellPx.value = editing.cellPx
      activeVariant.value = editing.variant
      activeModel.value = editing.model
      tool.value = 'select'
      hoverPinId.value = null
      status.value = ''
    },
    afterSync: pruneSelection
  })
  const { doc, activeTabId, pristine, anyDirty, undoLabel, redoLabel, apply, cycleTab, moveTab } =
    base
  /** Dossier du composant dans la bibliothèque ; null tant qu'il n'y est pas enregistré. */
  const folder = base.path
  const dirty = base.dirty
  const tabs = computed<ComponentTabInfo[]>(() =>
    base.tabs.value.map((tab) => ({
      id: tab.id,
      name: tab.name,
      folder: tab.path,
      dirty: tab.dirty
    }))
  )
  /**
   * Le composant tel que le dessine la variante affichée, modèles particuliers à part : c'est
   * elle qui dit si le composant est extensible, et comment.
   */
  const shownVariant = computed(() => variantDefinition(doc.value, activeVariant.value))
  /**
   * Ce que l'éditeur montre et modifie : la variante affichée ou, quand on retouche le modèle
   * particulier d'un nombre, le dessin de ce modèle (sans motif ni traits de coupe).
   */
  const shown = computed(() => modelDefinition(shownVariant.value, activeModel.value))
  /**
   * Modèles particuliers de la variante affichée, par nombre croissant ; `used` : ce nombre est
   * entre le minimum et le maximum, donc le modèle sert.
   */
  const models = computed(() => {
    const stretch = shownVariant.value.stretch
    return (stretch?.models ?? [])
      .map((model) => ({
        count: model.count,
        used: stretch !== undefined && model.count >= stretch.min && model.count <= stretch.max
      }))
      .sort((a, b) => a.count - b.count)
  })
  /** Nombre du modèle qu'on retouche ; null : le dessin qui s'étire. */
  const modelCount = computed(() =>
    models.value.some((model) => model.count === activeModel.value) ? activeModel.value : null
  )
  /** Variantes du composant, la première d'abord ; une seule entrée s'il n'en a pas d'autre. */
  const variants = computed(() => componentVariants(doc.value))
  /** Identifiant de la variante affichée (`BASE_VARIANT` pour la première). */
  const variantId = computed(() => activeVariant.value ?? BASE_VARIANT)

  /**
   * Dans un brouillon du composant, la variante affichée : là où vivent ses réglages
   * d'étirement et ses modèles particuliers.
   */
  function variantBodyOf(draft: Draft<ComponentDefinition>): Draft<ComponentBody> {
    const id = activeVariant.value
    const variant = id === null ? undefined : draft.variants?.find((entry) => entry.id === id)
    return variant ?? draft
  }

  /**
   * Dans un brouillon du composant, le dessin affiché : celui de la variante ou, si l'on retouche
   * un modèle particulier, celui de ce modèle. C'est là qu'on écrit formes, broches et taille.
   */
  function bodyOf(draft: Draft<ComponentDefinition>): Draft<ComponentBody> {
    const body = variantBodyOf(draft)
    const count = activeModel.value
    const model =
      count === null ? undefined : body.stretch?.models?.find((entry) => entry.count === count)
    return model ?? body
  }

  const issues = computed(() => componentIssues(doc.value))
  const hasErrors = computed(() => issues.value.some((issue) => issue.level === 'error'))
  const selectedIndexes = computed<readonly number[]>(() => selection.value?.indexes ?? [])
  const selectedPinIds = computed<readonly string[]>(() => selection.value?.pinIds ?? [])
  /** La forme sélectionnée quand la sélection se réduit à elle. */
  const selectedPrimitive = computed<Primitive | null>(() => {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (indexes.length !== 1 || index === undefined || selectedPinIds.value.length > 0) {
      return null
    }
    return shown.value.visual.primitives[index] ?? null
  })
  /**
   * Ce que la barre d'état dit de la sélection, en cellules : la place d'une forme (le coin
   * supérieur gauche de sa boîte, le centre d'un point) ou d'une broche, le départ et l'arrivée
   * d'une ligne ; à plusieurs, leur nombre.
   */
  const selectionReadout = computed<Readout | null>(() => {
    const indexes = selectedIndexes.value
    const pinIds = selectedPinIds.value
    const count = indexes.length + pinIds.length
    if (count === 0) return null
    if (count > 1) return { kind: 'many', count }
    const index = indexes[0]
    const primitive = index === undefined ? undefined : shown.value.visual.primitives[index]
    if (primitive) return primitiveReadout(primitive)
    const pin = shown.value.pins.find((entry) => entry.id === pinIds[0])
    return pin ? placeReadout(pin.x, pin.y) : null
  })
  /** La broche sélectionnée quand la sélection se réduit à elle. */
  const selectedPin = computed<Pin | null>(() => {
    const ids = selectedPinIds.value
    const id = ids[0]
    if (ids.length !== 1 || id === undefined || selectedIndexes.value.length > 0) return null
    return shown.value.pins.find((pin) => pin.id === id) ?? null
  })

  /** Après chaque changement du composant : la sélection ne garde que ce qui existe encore. */
  function pruneSelection(): void {
    // Annuler a pu retirer la variante qu'on regardait : on revient à la première.
    const variant = activeVariant.value
    if (variant !== null && !doc.value.variants?.some((entry) => entry.id === variant)) {
      activeVariant.value = null
      activeModel.value = null
      selection.value = null
    }
    // De même pour le modèle particulier qu'on retouchait.
    const model = activeModel.value
    if (
      model !== null &&
      !shownVariant.value.stretch?.models?.some((entry) => entry.count === model)
    ) {
      activeModel.value = null
      selection.value = null
    }
    const current = selection.value
    if (!current) return
    const count = shown.value.visual.primitives.length
    const indexes = current.indexes.filter((index) => index < count)
    const pinIds = current.pinIds.filter((id) => shown.value.pins.some((pin) => pin.id === id))
    if (indexes.length !== current.indexes.length || pinIds.length !== current.pinIds.length) {
      select(indexes, pinIds)
    }
  }

  function undo(): void {
    const label = base.undo()
    if (label !== null) status.value = `Annulé : ${label}`
  }

  function redo(): void {
    const label = base.redo()
    if (label !== null) status.value = `Rétabli : ${label}`
  }

  // Onglets

  function activateTab(id: number): void {
    base.activateTab(id)
  }

  /** Montre un composant dans un onglet : l'onglet actif s'il est vierge, sinon un nouveau. */
  function showInTab(
    def: ComponentDefinition,
    saved: ComponentDefinition | null,
    sourceFolder: string | null
  ): void {
    base.showInTab(def, saved, sourceFolder)
    // Un composant qui s'ouvre occupe toute la zone d'édition.
    fitToViewport()
  }

  /** Nouveau composant vierge, dans son onglet. */
  function newComponent(): void {
    const blank = blankComponent()
    showInTab(blank, blank, null)
  }

  /**
   * Ouvre un composant dans un onglet ; `sourceFolder` null = jamais enregistré (copie, import) :
   * il est alors à enregistrer. Un composant de la bibliothèque déjà ouvert n'est pas rechargé :
   * son onglet revient devant.
   */
  function open(def: ComponentDefinition, sourceFolder: string | null): void {
    if (sourceFolder !== null) {
      const already = tabs.value.find(
        (tab) => tab.folder !== null && samePath(tab.folder, sourceFolder)
      )
      if (already) {
        activateTab(already.id)
        return
      }
    }
    showInTab(def, sourceFolder === null ? null : def, sourceFolder)
    // On retrouve la variante qu'on regardait en l'enregistrant (celle de son aperçu) : un
    // simple ouvrir-enregistrer ne change donc pas l'aperçu.
    const preview = def.previewVariant
    activeVariant.value =
      preview !== undefined && def.variants?.some((entry) => entry.id === preview) ? preview : null
    activeModel.value = null
  }

  function markSaved(savedFolder: string): void {
    base.markSaved(savedFolder)
  }

  /**
   * Ferme un onglet sans rien demander ; vrai s'il existait. La question « enregistrer ? » d'un
   * composant modifié se pose avant, dans `closeComponentTabAsking`. Fermer le dernier laisse un
   * composant vierge.
   */
  function closeTab(id: number): boolean {
    return base.closeTab(id)
  }

  /** Ferme les onglets d'un composant qui vient d'être supprimé de la bibliothèque. */
  function closeFolderTabs(removedFolder: string): void {
    for (const tab of tabs.value) {
      if (tab.folder !== null && samePath(tab.folder, removedFolder)) closeTab(tab.id)
    }
  }

  function drawing(draft: Draft<ComponentDefinition>): Draft<Primitive>[] {
    return bodyOf(draft).visual.primitives
  }

  // Sélection

  /** Sélectionne des formes et des broches ; rien du tout vide la sélection. */
  function select(indexes: readonly number[], pinIds: readonly string[] = []): void {
    const uniqueIndexes = [...new Set(indexes)].sort((a, b) => a - b)
    const uniquePins = [...new Set(pinIds)]
    selection.value =
      uniqueIndexes.length > 0 || uniquePins.length > 0
        ? { indexes: uniqueIndexes, pinIds: uniquePins }
        : null
  }

  /** Sélectionne toutes les formes et toutes les broches. */
  function selectAll(): void {
    const count = shown.value.visual.primitives.length
    select(
      Array.from({ length: count }, (_, index) => index),
      shown.value.pins.map((pin) => pin.id)
    )
  }

  function selectPrimitives(indexes: readonly number[]): void {
    select(indexes, [])
  }

  function selectPin(id: string): void {
    select([], [id])
  }

  // Groupes : formes et broches qu'on sélectionne et déplace d'un bloc (voir groups.ts du domaine).

  const groups = computed<EditorGroup[]>(() => {
    const primitives = shown.value.visual.primitives
    const pins = shown.value.pins
    return groupIds([...primitives, ...pins]).map((id) => ({
      id,
      indexes: primitives.flatMap((primitive, index) => (primitive.group === id ? [index] : [])),
      pinIds: pins.filter((pin) => pin.group === id).map((pin) => pin.id)
    }))
  })
  const hasGroups = computed(() => groups.value.length > 0)
  /** Contour des groupes visible. Gardé dans les paramètres, d'un lancement à l'autre. */
  const showGroups = computed({
    get: () => library.showGroups,
    set: (value: boolean) => library.setViewOption('showGroups', value)
  })

  /** Groupe d'une forme ou d'une broche, ou null. */
  function groupOf(ref: EditorElementRef): EditorGroup | null {
    const id =
      ref.kind === 'primitive'
        ? shown.value.visual.primitives[ref.index]?.group
        : shown.value.pins.find((pin) => pin.id === ref.id)?.group
    return id === undefined ? null : (groups.value.find((group) => group.id === id) ?? null)
  }

  /** L'élément visé et, s'il est groupé, tout son groupe. */
  function withItsGroup(ref: EditorElementRef): { indexes: number[]; pinIds: string[] } {
    const group = groupOf(ref)
    if (group) return group
    return ref.kind === 'primitive'
      ? { indexes: [ref.index], pinIds: [] }
      : { indexes: [], pinIds: [ref.id] }
  }

  function isSelected(ref: EditorElementRef): boolean {
    return ref.kind === 'primitive'
      ? selectedIndexes.value.includes(ref.index)
      : selectedPinIds.value.includes(ref.id)
  }

  /** Clic sur une forme ou une broche : elle devient la sélection, avec son groupe. */
  function selectElement(ref: EditorElementRef): void {
    const target = withItsGroup(ref)
    select(target.indexes, target.pinIds)
  }

  /** Maj+clic : ajoute l'élément (et son groupe) à la sélection, ou les en retire. */
  function toggleElement(ref: EditorElementRef): void {
    const target = withItsGroup(ref)
    if (isSelected(ref)) {
      select(
        selectedIndexes.value.filter((index) => !target.indexes.includes(index)),
        selectedPinIds.value.filter((id) => !target.pinIds.includes(id))
      )
    } else {
      select(
        [...selectedIndexes.value, ...target.indexes],
        [...selectedPinIds.value, ...target.pinIds]
      )
    }
  }

  function togglePrimitive(index: number): void {
    toggleElement({ kind: 'primitive', index })
  }

  function togglePin(id: string): void {
    toggleElement({ kind: 'pin', id })
  }

  /** Groupes que la sélection touche. */
  const selectedGroups = computed(() =>
    groups.value.filter(
      (group) =>
        group.indexes.some((index) => selectedIndexes.value.includes(index)) ||
        group.pinIds.some((id) => selectedPinIds.value.includes(id))
    )
  )

  /** Après un lasso : chaque groupe touché est pris en entier. */
  function expandSelectionToGroups(): void {
    const touched = selectedGroups.value
    if (touched.length === 0) return
    select(
      [...selectedIndexes.value, ...touched.flatMap((group) => group.indexes)],
      [...selectedPinIds.value, ...touched.flatMap((group) => group.pinIds)]
    )
  }

  const canUngroup = computed(() => selectedGroups.value.length > 0)
  /** Vrai dès deux éléments sélectionnés, sauf s'ils forment déjà exactement un groupe. */
  const canGroup = computed(() => {
    if (selectedIndexes.value.length + selectedPinIds.value.length < 2) return false
    const only = selectedGroups.value.length === 1 ? selectedGroups.value[0] : undefined
    if (!only) return true
    return (
      selectedIndexes.value.some((index) => !only.indexes.includes(index)) ||
      selectedPinIds.value.some((id) => !only.pinIds.includes(id))
    )
  })

  /** Ctrl+G : la sélection devient un groupe. */
  function groupSelection(): void {
    if (!canGroup.value) return
    const id = nextGroupId([...shown.value.visual.primitives, ...shown.value.pins])
    const indexes = new Set(selectedIndexes.value)
    const pinIds = new Set(selectedPinIds.value)
    apply('Grouper', (draft) => {
      drawing(draft).forEach((primitive, index) => {
        if (indexes.has(index)) primitive.group = id
      })
      for (const pin of bodyOf(draft).pins) if (pinIds.has(pin.id)) pin.group = id
    })
    status.value = 'Éléments groupés : ils se sélectionnent d’un bloc.'
  }

  /** Ctrl+Maj+G : les groupes que touche la sélection sont défaits. */
  function ungroupSelection(): void {
    const ids = new Set(selectedGroups.value.map((group) => group.id))
    if (ids.size === 0) return
    apply('Dégrouper', (draft) => {
      for (const element of [...drawing(draft), ...bodyOf(draft).pins]) {
        if (element.group !== undefined && ids.has(element.group)) delete element.group
      }
    })
    status.value = 'Groupe défait.'
  }

  // Commandes du composant

  function setMeta(
    patch: Partial<Pick<ComponentDefinition, 'name' | 'category' | 'description'>>
  ): void {
    apply('Modifier les propriétés', (draft) => {
      Object.assign(draft, patch)
    })
  }

  function setId(id: string): void {
    apply('Identifiant', (draft) => {
      draft.id = id
    })
  }

  /** Redimensionne ; les broches qui sortent de la boîte disparaissent, les autres sont renumérotées. */
  function setSize(size: Size): void {
    const kept = pinsInside(shown.value.pins, size)
    const removed = shown.value.pins.length - kept.length
    apply('Redimensionner', (draft) => {
      const body = bodyOf(draft)
      body.size = { widthCells: size.widthCells, heightCells: size.heightCells }
      if (removed > 0) body.pins = castDraft(renumberPins(kept))
      // Le motif d'un composant extensible reste dans la boîte.
      if (body.stretch) {
        body.stretch = castDraft(normalizedStretch(body.stretch, stretchExtent(size, body.stretch)))
      }
    })
    if (removed > 0) {
      status.value = `${removed} broche(s) hors de la nouvelle boîte supprimée(s).`
    }
  }

  /**
   * Nouvelle boîte du composant, en cellules par rapport à l'origine actuelle (poignées avec Ctrl) :
   * le dessin et les broches suivent l'origine, les broches qui sortent disparaissent.
   */
  function setBox(box: Box): void {
    const before = shown.value
    const size = {
      widthCells: Math.max(1, Math.round(box.w)),
      heightCells: Math.max(1, Math.round(box.h))
    }
    const dx = -Math.round(box.x)
    const dy = -Math.round(box.y)
    if (
      dx === 0 &&
      dy === 0 &&
      size.widthCells === before.size.widthCells &&
      size.heightCells === before.size.heightCells
    ) {
      return
    }
    const moved = before.pins.map((pin) => ({ ...pin, x: pin.x + dx, y: pin.y + dy }))
    const kept = pinsInside(moved, size)
    apply('Redimensionner', (draft) => {
      bodyOf(draft).size = size
      const list = drawing(draft)
      if (dx !== 0 || dy !== 0) {
        for (let i = 0; i < list.length; i++) {
          const primitive = list[i]
          if (primitive) {
            list[i] = castDraft(
              translatePrimitive(primitive, dx * QUARTERS_PER_CELL, dy * QUARTERS_PER_CELL)
            )
          }
        }
      }
      bodyOf(draft).pins = castDraft(kept.length !== before.pins.length ? renumberPins(kept) : kept)
      // Le motif d'un composant extensible suit l'origine, et reste dans la boîte.
      const stretch = bodyOf(draft).stretch
      if (stretch) {
        const shift = (stretchAxis(stretch) === 'y' ? dy : dx) * QUARTERS_PER_CELL
        bodyOf(draft).stretch = castDraft(
          normalizedStretch(
            { ...stretch, from: stretch.from + shift, to: stretch.to + shift },
            stretchExtent(size, stretch)
          )
        )
      }
    })
    const removed = before.pins.length - kept.length
    if (removed > 0) status.value = `${removed} broche(s) hors de la nouvelle boîte supprimée(s).`
  }

  /** Les nombres d'un composant extensible : ce qu'il garde quand son motif change de sens. */
  function keptCounts(stretch: Stretch): Pick<Stretch, 'initial' | 'min' | 'max'> {
    return { initial: stretch.initial, min: stretch.min, max: stretch.max }
  }

  /**
   * Composant extensible (décision du 17 novembre 2026, voir stretch.ts du domaine) : rend
   * extensible la variante affichée, change les réglages de son motif, ou la rend à nouveau
   * ordinaire (null ; ses modèles particuliers partent avec). Les réglages sont ramenés à ce qui
   * est permis : un motif dans la boîte, large d'un nombre entier de cellules, un nombre de
   * départ entre le minimum et le maximum. Ce sont ceux de la variante, même quand on retouche
   * un de ses modèles. `axis` choisit le sens : en largeur ('x', deux traits verticaux) ou en
   * hauteur ('y', deux traits horizontaux).
   */
  function setStretch(patch: Partial<Omit<Stretch, 'models'>> | null): void {
    const current = shownVariant.value.stretch
    if (patch === null) {
      if (!current) return
      apply('Composant non extensible', (draft) => {
        delete variantBodyOf(draft).stretch
      })
      return
    }
    // Le sens demandé, sinon celui qu'il a : en largeur (traits verticaux) ou en hauteur.
    const axis = patch.axis ?? (current ? stretchAxis(current) : 'x')
    const extent = stretchExtent(shownVariant.value.size, { axis })
    // Changer de sens remet le motif sur toute l'étendue du nouveau : ses traits se lisaient
    // dans l'autre. Les nombres et les modèles restent.
    const basis =
      current && stretchAxis(current) === axis
        ? current
        : { ...current, ...defaultStretch(extent), ...(current ? keptCounts(current) : {}) }
    const next = normalizedStretch({ ...basis, ...patch }, extent)
    // En largeur, le sens ne s'écrit pas.
    if (axis === 'y') next.axis = 'y'
    else delete next.axis
    const same =
      current !== undefined &&
      stretchAxis(current) === axis &&
      (['from', 'to', 'initial', 'min', 'max'] as const).every((key) => current[key] === next[key])
    if (same) return
    apply(current ? 'Régler le motif' : 'Composant extensible', (draft) => {
      variantBodyOf(draft).stretch = castDraft(next)
    })
    if (!current) {
      status.value =
        'Composant extensible : place les deux traits autour de la partie qui se répète.'
    } else if (stretchAxis(current) !== axis) {
      status.value =
        axis === 'y'
          ? 'Le composant s’étire en hauteur : un haut, un motif, un bas.'
          : 'Le composant s’étire en largeur : un début, un motif, une fin.'
    }
  }

  /**
   * Pose une image importée comme une forme : à sa taille naturelle (80 px par cellule), par-dessus
   * le dessin, sélectionnée. Un composant vierge prend la taille de l'image ; sinon elle se centre
   * dans la boîte, sur des cellules entières, pour que ses repères tombent sur la grille.
   */
  function importImage(dataUrl: string, widthPx: number, heightPx: number): void {
    const { w, h } = importedImageSize(widthPx, heightPx)
    const blank = isBlankBody(shown.value)
    const size: Size = blank
      ? {
          widthCells: Math.ceil(w / QUARTERS_PER_CELL),
          heightCells: Math.ceil(h / QUARTERS_PER_CELL)
        }
      : shown.value.size
    const centered = (cells: number, quarters: number): number =>
      Math.max(0, Math.round((cells - quarters / QUARTERS_PER_CELL) / 2)) * QUARTERS_PER_CELL
    const [image] = withFreeImageFiles(componentPrimitives(doc.value), [
      {
        kind: 'image',
        x: centered(size.widthCells, w),
        y: centered(size.heightCells, h),
        w,
        h,
        file: 'image.png',
        dataUrl
      }
    ])
    if (!image) return
    let index = -1
    apply('Importer une image', (draft) => {
      if (blank) bodyOf(draft).size = size
      const list = drawing(draft)
      list.push(castDraft(image))
      index = list.length - 1
    })
    tool.value = 'select'
    if (index >= 0) selectPrimitives([index])
    if (blank) fitToViewport()
  }

  /** Rend à une image sa taille naturelle (80 px par cellule), son coin supérieur gauche en place. */
  function resetImageSize(index: number): void {
    const primitive = shown.value.visual.primitives[index]
    if (primitive?.kind !== 'image') return
    const natural = naturalImageSize(primitive)
    if (!natural || (natural.w === primitive.w && natural.h === primitive.h)) return
    updatePrimitive(index, 'Taille d’origine de l’image', (target) => {
      if (target.kind === 'image') Object.assign(target, natural)
    })
  }

  // Commandes des formes

  function addPrimitive(primitive: Primitive, label: string): number {
    let index = -1
    apply(label, (draft) => {
      const list = drawing(draft)
      list.push(castDraft(primitive))
      index = list.length - 1
    })
    if (index >= 0) selectPrimitives([index])
    return index
  }

  function updatePrimitive(
    index: number,
    label: string,
    mutate: (primitive: Draft<Primitive>) => void
  ): void {
    apply(label, (draft) => {
      const primitive = drawing(draft)[index]
      if (primitive) mutate(primitive)
    })
  }

  /** Remplace une forme entière (fin d'un glisser de poignée). */
  function setPrimitive(index: number, primitive: Primitive, label: string): void {
    apply(label, (draft) => {
      const list = drawing(draft)
      if (index < list.length) list[index] = castDraft(primitive)
    })
  }

  function updateStyle(index: number, patch: Partial<ShapeStyle>): void {
    updatePrimitive(index, 'Modifier le style', (primitive) => {
      if ('style' in primitive) Object.assign(primitive.style, patch)
    })
  }

  /**
   * Fait d'une forme une empreinte, ou la rend au dessin (décision du 18 novembre 2026). Une
   * empreinte ne se dessine pas sur le composant posé : elle dit la place qu'il prend de l'autre
   * côté d'une plaque à trous, et s'y dessine en pointillés quand la plaque montre ses deux faces.
   */
  function setFootprint(index: number, on: boolean): void {
    updatePrimitive(
      index,
      on ? 'Forme en empreinte' : 'Empreinte rendue au dessin',
      (primitive) => {
        if (!('style' in primitive)) return
        if (on) primitive.footprint = true
        else delete primitive.footprint
      }
    )
  }

  /**
   * Déplace des formes et des broches d'un même vecteur, en quarts de cellule, en une commande.
   * Avec des broches, le vecteur doit tomber sur des cellules entières, et une broche qui
   * sortirait du composant ou en rejoindrait une autre annule tout. Vrai si le déplacement est
   * fait.
   */
  function moveSelection(
    indexes: readonly number[],
    pinIds: readonly string[],
    dx: number,
    dy: number
  ): boolean {
    if (dx === 0 && dy === 0) return false
    if (indexes.length === 0 && pinIds.length === 0) return false
    const moving = new Set(pinIds)
    const cellsX = dx / QUARTERS_PER_CELL
    const cellsY = dy / QUARTERS_PER_CELL
    if (moving.size > 0) {
      if (!Number.isInteger(cellsX) || !Number.isInteger(cellsY)) return false
      const taken = new Set<string>()
      for (const pin of shown.value.pins) {
        const point = moving.has(pin.id) ? { x: pin.x + cellsX, y: pin.y + cellsY } : pin
        const key = `${point.x},${point.y}`
        if (!isInsideBox(point, shown.value.size) || taken.has(key)) {
          status.value =
            'Déplacement refusé : une broche sortirait du composant ou en rejoindrait une autre.'
          return false
        }
        taken.add(key)
      }
    }
    const count = indexes.length + pinIds.length
    const label =
      moving.size === 0
        ? count > 1
          ? 'Déplacer les formes'
          : 'Déplacer la forme'
        : count > 1
          ? 'Déplacer la sélection'
          : 'Déplacer la broche'
    return apply(label, (draft) => {
      const list = drawing(draft)
      for (const index of indexes) {
        const primitive = list[index]
        if (primitive) list[index] = castDraft(translatePrimitive(primitive, dx, dy))
      }
      for (const pin of bodyOf(draft).pins) {
        if (!moving.has(pin.id)) continue
        pin.x += cellsX
        pin.y += cellsY
      }
    })
  }

  /** Déplace plusieurs formes d'un même vecteur, en quarts de cellule. */
  function movePrimitives(indexes: readonly number[], dx: number, dy: number): void {
    moveSelection(indexes, [], dx, dy)
  }

  /** Ordre d'empilement de la forme sélectionnée (seule) ; la sélection la suit. */
  function reorderPrimitive(move: StackMove): void {
    const indexes = selectedIndexes.value
    const index = indexes[0]
    if (indexes.length !== 1 || index === undefined || selectedPinIds.value.length > 0) return
    const result = reorderItem(shown.value.visual.primitives, index, move)
    if (result.index === index) return
    const labels: Record<StackMove, string> = {
      up: 'Avancer la forme',
      down: 'Reculer la forme',
      top: 'Forme au premier plan',
      bottom: 'Forme à l’arrière-plan'
    }
    apply(labels[move], (draft) => {
      const target = drawing(draft)
      target.splice(0, target.length, ...castDraft(result.list))
    })
    selectPrimitives([result.index])
  }

  function removePrimitives(indexes: readonly number[]): void {
    if (indexes.length === 0) return
    apply(indexes.length > 1 ? 'Supprimer les formes' : 'Supprimer la forme', (draft) => {
      const list = drawing(draft)
      for (const index of [...indexes].sort((a, b) => b - a)) list.splice(index, 1)
    })
    selection.value = null
  }

  // Commandes des broches

  function addPin(point: LocalPoint): string {
    const id = nextPinId(shown.value.pins)
    apply('Ajouter une broche', (draft) => {
      bodyOf(draft).pins.push({
        id,
        name: String(bodyOf(draft).pins.length + 1),
        kind: 'io',
        x: point.x,
        y: point.y
      })
    })
    selectPin(id)
    return id
  }

  /**
   * Ajoute une broche à chaque point donné, en une commande : la zone tracée à l'outil Broche.
   * Les points hors de la boîte ou déjà pris sont passés. Dès deux broches, elles vont dans un
   * nouveau groupe de broches : son nom, à changer dans le panneau, les désigne toutes, et leurs
   * numéros se suivent. Retourne les identifiants des broches ajoutées.
   */
  function addPins(points: readonly LocalPoint[]): string[] {
    const current = shown.value
    const taken = new Set(current.pins.map((pin) => `${pin.x},${pin.y}`))
    const free = points.filter((point) => {
      const key = `${point.x},${point.y}`
      if (taken.has(key) || !isInsideBox(point, current.size)) return false
      taken.add(key)
      return true
    })
    const [only] = free
    if (!only) return []
    if (free.length === 1) return [addPin(only)]
    const ids: string[] = []
    const known: { id: string }[] = current.pins.map((pin) => ({ id: pin.id }))
    for (let n = 0; n < free.length; n++) {
      const id = nextPinId(known as Pin[])
      ids.push(id)
      known.push({ id })
    }
    const group = { id: nextPinGroupId(pinGroups.value), name: nextPinGroupName(pinGroups.value) }
    const groups = [...pinGroups.value, group]
    const added: Pin[] = free.map((point, index) => ({
      id: ids[index] ?? '',
      name: String(current.pins.length + index + 1),
      kind: 'io',
      x: point.x,
      y: point.y,
      pinGroup: group.id
    }))
    const pins = renumberPins(arrangedPins([...current.pins, ...added], groups))
    apply(`Ajouter ${added.length} broches`, (draft) => {
      const body = bodyOf(draft)
      body.pinGroups = castDraft(groups)
      body.pins = castDraft(pins)
    })
    select([], ids)
    status.value = `${added.length} broches ajoutées dans « ${group.name} » : ce nom se change dans le panneau.`
    return ids
  }

  function updatePin(id: string, patch: Partial<Pick<Pin, 'name' | 'kind'>>): void {
    apply('Modifier la broche', (draft) => {
      const pin = bodyOf(draft).pins.find((candidate) => candidate.id === id)
      if (pin) Object.assign(pin, patch)
    })
  }

  function movePin(id: string, point: LocalPoint): void {
    apply('Déplacer la broche', (draft) => {
      const pin = bodyOf(draft).pins.find((candidate) => candidate.id === id)
      if (pin && (pin.x !== point.x || pin.y !== point.y)) {
        pin.x = point.x
        pin.y = point.y
      }
    })
  }

  // Variantes : le même composant dessiné autrement. Chacune est un dessin complet, née d'une
  // copie de celle qu'on regardait ; on en édite une à la fois.

  /** Après une suppression : le rang de la variante d'origine ne dépasse pas la fin de la liste. */
  function keepBaseRank(draft: Draft<ComponentDefinition>): void {
    const rank = Math.min(draft.baseVariantRank ?? 0, draft.variants?.length ?? 0)
    if (rank > 0) draft.baseVariantRank = rank
    else delete draft.baseVariantRank
  }

  /** Affiche une variante : c'est elle qu'on édite ensuite. */
  function showVariant(id: string): void {
    const next = doc.value.variants?.some((entry) => entry.id === id) ? id : null
    if (next === activeVariant.value) return
    activeVariant.value = next
    activeModel.value = null
    selection.value = null
    hoverPinId.value = null
    fitToViewport()
  }

  /** Nouvelle variante : une copie de celle qu'on regarde, affichée aussitôt pour la retoucher. */
  function addVariant(): string {
    const id = nextVariantId(doc.value)
    // La variante entière, avec son étirement et ses modèles, même si l'on regardait l'un d'eux.
    const source = shownVariant.value
    const copy: ComponentVariant = structuredClone({
      id,
      name: nextVariantName(doc.value),
      size: source.size,
      visual: source.visual,
      pins: source.pins,
      ...(source.pinGroups ? { pinGroups: source.pinGroups } : {}),
      ...(source.stretch ? { stretch: source.stretch } : {})
    })
    apply('Ajouter une variante', (draft) => {
      draft.variants = [...(draft.variants ?? []), castDraft(copy)]
    })
    showVariant(id)
    status.value = `Variante « ${copy.name} » : une copie à retoucher. Ses broches gardent leurs identifiants.`
    return id
  }

  function renameVariant(id: string, name: string): void {
    const clean = name.trim()
    if (clean.length === 0) {
      status.value = 'Le nom de la variante ne peut pas être vide.'
      return
    }
    apply('Renommer la variante', (draft) => {
      if (id === BASE_VARIANT) draft.variantName = clean
      else {
        const variant = draft.variants?.find((entry) => entry.id === id)
        if (variant) variant.name = clean
      }
    })
  }

  /**
   * Range une variante devant une autre (`beforeId`), ou à la fin de la liste (null) : le
   * glisser-déposer du panneau. Seul l'ordre change ; les composants déjà posés gardent leur
   * variante.
   */
  function moveVariant(id: string, beforeId: string | null): void {
    const before = variants.value.map((variant) => variant.id)
    const order = movedVariantOrder(doc.value, id, beforeId)
    if (order.join(' ') === before.join(' ')) return
    const rank = order.indexOf(BASE_VARIANT)
    apply('Ordre des variantes', (draft) => {
      draft.variants?.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      if (rank > 0) draft.baseVariantRank = rank
      else delete draft.baseVariantRank
    })
  }

  /**
   * Supprime une variante ; la dernière ne se supprime pas. Supprimer la première fait de la
   * suivante la première : c'est elle que montrent désormais les composants posés sans variante
   * choisie, et ceux qui la désignaient.
   */
  function removeVariant(id: string): void {
    const others = doc.value.variants ?? []
    const [promoted, ...rest] = others
    if (!promoted) return
    const wasShown = id === variantId.value
    if (id === BASE_VARIANT) {
      apply('Supprimer la variante', (draft) => {
        draft.size = promoted.size
        draft.visual = castDraft(promoted.visual)
        draft.pins = castDraft(promoted.pins)
        if (promoted.pinGroups) draft.pinGroups = castDraft(promoted.pinGroups)
        else delete draft.pinGroups
        if (promoted.stretch) draft.stretch = castDraft(promoted.stretch)
        else delete draft.stretch
        if (rest.length > 0) {
          draft.variantName = promoted.name
          draft.variants = castDraft(rest)
        } else {
          delete draft.variantName
          delete draft.variants
        }
        keepBaseRank(draft)
      })
      if (activeVariant.value === promoted.id) activeVariant.value = null
    } else {
      const kept = others.filter((entry) => entry.id !== id)
      if (kept.length === others.length) return
      apply('Supprimer la variante', (draft) => {
        if (kept.length > 0) draft.variants = castDraft(kept)
        else {
          delete draft.variants
          delete draft.variantName
        }
        keepBaseRank(draft)
      })
      if (activeVariant.value === id) activeVariant.value = null
    }
    // La variante qu'on regardait n'est plus : on ne reste pas sur un de ses modèles.
    if (wasShown) activeModel.value = null
    selection.value = null
    fitToViewport()
  }

  // Modèles par nombre d'un composant extensible (décision du 17 novembre 2026) : pour certains
  // nombres de motifs, un dessin à part remplace le motif répété. Chacun est un dessin complet,
  // né d'une copie du composant étiré à ce nombre ; on en retouche un à la fois.

  /** Affiche le modèle d'un nombre pour le retoucher ; null : le dessin qui s'étire. */
  function showModel(count: number | null): void {
    const next = models.value.some((model) => model.count === count) ? count : null
    if (next === activeModel.value) return
    activeModel.value = next
    selection.value = null
    hoverPinId.value = null
    fitToViewport()
  }

  /**
   * Nouveau modèle particulier, pour le premier nombre permis qui n'a pas le sien : une copie du
   * composant étiré à ce nombre, affichée aussitôt pour la retoucher. Retourne ce nombre ; null
   * si le composant n'est pas extensible ou si chaque nombre a déjà son modèle.
   */
  function addModel(): number | null {
    const variant = shownVariant.value
    const stretch = variant.stretch
    if (!stretch) return null
    const count = freeModelCount(stretch)
    const drawn = count === null ? null : modelDrawing(variant, count)
    if (count === null || !drawn) {
      status.value = 'Chaque nombre permis a déjà son modèle.'
      return null
    }
    const model = structuredClone(drawn)
    apply('Ajouter un modèle', (draft) => {
      const target = variantBodyOf(draft).stretch
      if (!target) return
      target.models = castDraft([...(target.models ?? []), model].sort((a, b) => a.count - b.count))
    })
    showModel(count)
    status.value = `Modèle à ${count} : une copie à retoucher. À ce nombre, il remplace le motif répété.`
    return count
  }

  /** Change le nombre de motifs auquel un modèle sert ; refusé si ce nombre a déjà le sien. */
  function setModelCount(count: number, wanted: number): void {
    const next = Math.max(1, Math.min(Math.round(wanted), STRETCH_MAX_COUNT))
    if (next === count || !models.value.some((model) => model.count === count)) return
    if (models.value.some((model) => model.count === next)) {
      status.value = `Le nombre ${next} a déjà son modèle.`
      return
    }
    const shownNow = activeModel.value === count
    const kept = selection.value
    // Le modèle qu'on regarde change de nombre : on le suit, avant que l'élagage ne le perde.
    if (shownNow) activeModel.value = null
    apply('Nombre du modèle', (draft) => {
      const list = variantBodyOf(draft).stretch?.models
      const model = list?.find((entry) => entry.count === count)
      if (!list || !model) return
      model.count = next
      list.sort((a, b) => a.count - b.count)
    })
    if (shownNow) {
      activeModel.value = next
      selection.value = kept
    }
  }

  /** Supprime le modèle d'un nombre : à ce nombre, le composant reprend son motif répété. */
  function removeModel(count: number): void {
    if (!models.value.some((model) => model.count === count)) return
    const shownNow = activeModel.value === count
    if (shownNow) activeModel.value = null
    apply('Supprimer le modèle', (draft) => {
      const stretch = variantBodyOf(draft).stretch
      if (!stretch?.models) return
      const kept = stretch.models.filter((entry) => entry.count !== count)
      if (kept.length > 0) stretch.models = kept
      else delete stretch.models
    })
    if (shownNow) {
      selection.value = null
      fitToViewport()
    }
    status.value = `Modèle à ${count} supprimé : à ce nombre, le motif répété revient.`
  }

  // Groupes de broches : des sections nommées du panneau de propriétés où ranger les broches
  // (pinGroups.ts). L'ordre des broches suit toujours celui du panneau, donc leur numérotation.

  const pinGroups = computed(() => shown.value.pinGroups ?? [])

  /** Ajoute un groupe de broches, vide, après les autres ; retourne son identifiant. */
  function addPinGroup(): string {
    const id = nextPinGroupId(pinGroups.value)
    const name = nextPinGroupName(pinGroups.value)
    apply('Ajouter un groupe de broches', (draft) => {
      bodyOf(draft).pinGroups = [...(bodyOf(draft).pinGroups ?? []), { id, name }]
    })
    return id
  }

  function renamePinGroup(id: string, name: string): void {
    const clean = name.trim()
    if (clean.length === 0) {
      status.value = 'Le nom du groupe ne peut pas être vide.'
      return
    }
    apply('Renommer le groupe de broches', (draft) => {
      const group = bodyOf(draft).pinGroups?.find((candidate) => candidate.id === id)
      if (group) group.name = clean
    })
  }

  /** Défait un groupe de broches : ses broches restent, sans groupe, après les autres. */
  function removePinGroup(id: string): void {
    const groups = pinGroups.value.filter((group) => group.id !== id)
    const pins = renumberPins(arrangedPins(shown.value.pins, groups))
    apply('Défaire le groupe de broches', (draft) => {
      if (groups.length > 0) bodyOf(draft).pinGroups = castDraft(groups)
      else delete bodyOf(draft).pinGroups
      bodyOf(draft).pins = castDraft(pins)
    })
  }

  /**
   * Range une broche dans un groupe (null : aucun), devant la broche `beforeId` ou à la fin du
   * groupe : le glisser-déposer du panneau. Les noms numériques suivent le nouvel ordre.
   */
  function placePin(pinId: string, groupId: string | null, beforeId: string | null): void {
    const pins = renumberPins(
      placedPin(shown.value.pins, pinGroups.value, pinId, groupId, beforeId)
    )
    if (JSON.stringify(pins) === JSON.stringify(shown.value.pins)) return
    apply('Ranger la broche', (draft) => {
      bodyOf(draft).pins = castDraft(pins)
    })
  }

  /** Supprime une broche ; les noms numériques des autres suivent leur nouvel ordre. */
  function removePin(id: string): void {
    const remaining = shown.value.pins.filter((pin) => pin.id !== id)
    apply('Supprimer la broche', (draft) => {
      bodyOf(draft).pins = castDraft(renumberPins(remaining))
    })
    selection.value = null
  }

  /** Supprime les formes et les broches sélectionnées, en une commande. */
  function removeSelection(): void {
    const current = selection.value
    if (!current) return
    const { indexes, pinIds } = current
    const onlyPin = pinIds[0]
    if (pinIds.length === 0) {
      removePrimitives(indexes)
    } else if (indexes.length === 0 && pinIds.length === 1 && onlyPin !== undefined) {
      removePin(onlyPin)
    } else {
      const remaining = shown.value.pins.filter((pin) => !pinIds.includes(pin.id))
      apply('Supprimer la sélection', (draft) => {
        const list = drawing(draft)
        for (const index of [...indexes].sort((a, b) => b - a)) list.splice(index, 1)
        bodyOf(draft).pins = castDraft(renumberPins(remaining))
      })
      selection.value = null
    }
  }

  // Presse-papiers des formes, commun aux onglets : on copie d'un composant à l'autre.

  const clipboard = shallowRef<Primitive[]>([])
  const clipboardEmpty = computed(() => clipboard.value.length === 0)

  function primitivesAt(indexes: readonly number[]): Primitive[] {
    const list = shown.value.visual.primitives
    return indexes.flatMap((index) => {
      const primitive = list[index]
      return primitive ? [primitive] : []
    })
  }

  /**
   * Ajoute des copies translatées (quarts de cellule) et les sélectionne, en une commande. Une
   * image collée depuis un autre composant ne prend jamais le fichier d'une image d'ici.
   */
  function insertPrimitiveCopies(
    source: readonly Primitive[],
    dx: number,
    dy: number,
    label: string
  ): void {
    if (source.length === 0) return
    // Un groupe copié devient un nouveau groupe : les copies ne rejoignent pas leurs originaux.
    const copies = regroupedCopies(withFreeImageFiles(componentPrimitives(doc.value), source), [
      ...shown.value.visual.primitives,
      ...shown.value.pins
    ])
    let first = -1
    apply(label, (draft) => {
      const list = drawing(draft)
      first = list.length
      for (const primitive of copies) list.push(castDraft(translatePrimitive(primitive, dx, dy)))
    })
    if (first >= 0) selectPrimitives(source.map((_, offset) => first + offset))
  }

  function copySelection(): void {
    const selected = primitivesAt(selectedIndexes.value)
    if (selected.length === 0) return
    clipboard.value = structuredClone(selected)
    status.value = `${selected.length} forme(s) copiée(s).`
  }

  /** Colle décalé d'une cellule, pour distinguer la copie de l'original. */
  function pasteClipboard(): void {
    insertPrimitiveCopies(clipboard.value, QUARTERS_PER_CELL, QUARTERS_PER_CELL, 'Coller')
  }

  /**
   * Colle pour que le coin supérieur gauche de ce qui a été copié arrive au point donné (quarts
   * de cellule) : « Coller ici » du menu contextuel.
   */
  function pasteClipboardAt(x: number, y: number): void {
    const boxes = clipboard.value.map(primitiveBounds)
    if (boxes.length === 0) return
    const left = Math.min(...boxes.map((box) => box.x1))
    const top = Math.min(...boxes.map((box) => box.y1))
    insertPrimitiveCopies(clipboard.value, Math.round(x - left), Math.round(y - top), 'Coller')
  }

  function duplicateSelection(): void {
    insertPrimitiveCopies(
      primitivesAt(selectedIndexes.value),
      QUARTERS_PER_CELL,
      QUARTERS_PER_CELL,
      'Dupliquer'
    )
  }

  /** Alt+glisser : copie des formes déposée au décalage donné. */
  function duplicatePrimitivesAt(indexes: readonly number[], dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    insertPrimitiveCopies(primitivesAt(indexes), dx, dy, 'Dupliquer')
  }

  // Affichage

  function setCellPx(value: number): void {
    cellPx.value = Math.round(Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, value)))
  }

  function zoomBy(factor: number): void {
    setCellPx(cellPx.value * factor)
  }

  /** Zoom affiché : 100 % = la taille de cellule de départ de l'éditeur. */
  const zoomPercent = computed(() => Math.round((cellPx.value / DEFAULT_CELL_PX) * 100))

  function resetZoom(): void {
    setCellPx(DEFAULT_CELL_PX)
  }

  /**
   * Taille de cellule qui fait tenir le composant dans la zone visible, avec sa marge (une
   * cellule, ou la place des repères de broche qui dépassent) : arrondie vers le bas et avec une
   * petite réserve, pour ne jamais faire apparaître d'ascenseur.
   */
  function fitToViewport(): void {
    setCellPx(
      fittingCellPx(
        shown.value,
        viewport.value.width - FIT_PADDING_PX - FIT_SAFETY_PX,
        viewport.value.height - FIT_PADDING_PX - FIT_SAFETY_PX,
        cellPx.value
      )
    )
  }

  return {
    doc,
    folder,
    tabs,
    activeTabId,
    anyDirty,
    pristine,
    selection,
    tool,
    inspectorOpen,
    inspectorFloating,
    revealInspector,
    cellPx,
    viewport,
    hoverPinId,
    status,
    undoLabel,
    redoLabel,
    dirty,
    issues,
    hasErrors,
    shown,
    shownVariant,
    models,
    modelCount,
    showModel,
    addModel,
    setModelCount,
    removeModel,
    variants,
    variantId,
    showVariant,
    addVariant,
    renameVariant,
    moveVariant,
    removeVariant,
    selectedIndexes,
    selectedPinIds,
    selectedPrimitive,
    selectionReadout,
    selectedPin,
    undo,
    redo,
    newComponent,
    open,
    markSaved,
    activateTab,
    cycleTab,
    moveTab,
    closeTab,
    closeFolderTabs,
    select,
    selectAll,
    selectElement,
    expandSelectionToGroups,
    groups,
    hasGroups,
    showGroups,
    canGroup,
    canUngroup,
    groupSelection,
    ungroupSelection,
    selectPrimitives,
    selectPin,
    togglePrimitive,
    togglePin,
    setMeta,
    setId,
    setSize,
    setBox,
    setStretch,
    importImage,
    resetImageSize,
    addPrimitive,
    updatePrimitive,
    setPrimitive,
    updateStyle,
    setFootprint,
    moveSelection,
    movePrimitives,
    removePrimitives,
    reorderPrimitive,
    addPin,
    addPins,
    updatePin,
    addPinGroup,
    renamePinGroup,
    removePinGroup,
    placePin,
    movePin,
    removePin,
    removeSelection,
    clipboardEmpty,
    copySelection,
    pasteClipboard,
    pasteClipboardAt,
    duplicateSelection,
    duplicatePrimitivesAt,
    setCellPx,
    zoomBy,
    zoomPercent,
    resetZoom,
    fitToViewport
  }
})
