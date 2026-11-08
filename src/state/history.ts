import {
  applyPatches,
  enablePatches,
  produceWithPatches,
  type Draft,
  type Objectish,
  type Patch
} from 'immer'

enablePatches()

export interface HistoryEntry {
  label: string
  patches: Patch[]
  inversePatches: Patch[]
}

/**
 * Historique d'un document immuable : chaque commande nommée produit des patches Immer,
 * leurs inverses servent à annuler. Le document courant est toujours un nouvel objet gelé,
 * ce qui convient à un shallowRef Vue.
 */
export class History<T extends Objectish> {
  private present: T
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  constructor(
    initial: T,
    private readonly limit = 200
  ) {
    this.present = initial
  }

  get value(): T {
    return this.present
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  /** Applique une commande ; retourne faux si elle n'a rien changé (rien n'est empilé). */
  apply(label: string, recipe: (draft: Draft<T>) => void): boolean {
    const [next, patches, inversePatches] = produceWithPatches(this.present, recipe)
    if (patches.length === 0) return false
    this.present = next
    this.undoStack.push({ label, patches, inversePatches })
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
    return true
  }

  /** Annule la dernière commande ; retourne son libellé, ou null s'il n'y a rien à annuler. */
  undo(): string | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.present = applyPatches(this.present, entry.inversePatches)
    this.redoStack.push(entry)
    return entry.label
  }

  redo(): string | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.present = applyPatches(this.present, entry.patches)
    this.undoStack.push(entry)
    return entry.label
  }

  /** Remplace le document et vide l'historique (ouverture d'un fichier). */
  reset(document: T): void {
    this.present = document
    this.undoStack = []
    this.redoStack = []
  }
}
