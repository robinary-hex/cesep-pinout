import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SHAPE_STYLE, NO_ARROWS, type Primitive } from '@/domain'
import { pngHeaderDataUrl } from '@/domain/testing/pngHeader'
import { useComponentEditorStore } from './store'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('éditeur de composants : broches', () => {
  it('numérote les broches à la création et renumérote les noms numériques après suppression', () => {
    const store = useComponentEditorStore()
    const first = store.addPin({ x: 0, y: 1 })
    store.addPin({ x: 4, y: 1 })
    const third = store.addPin({ x: 2, y: 0 })
    store.updatePin(third, { name: 'GND' })
    expect(store.doc.pins.map((pin) => pin.name)).toEqual(['1', '2', 'GND'])

    store.removePin(first)
    expect(store.doc.pins.map((pin) => pin.name)).toEqual(['1', 'GND'])
    store.undo()
    expect(store.doc.pins.map((pin) => pin.name)).toEqual(['1', '2', 'GND'])
  })

  it('supprime les broches sorties du bord quand la taille change, en une commande', () => {
    const store = useComponentEditorStore()
    store.addPin({ x: 4, y: 1 })
    store.addPin({ x: 0, y: 1 })
    store.addPin({ x: 2, y: 2 })
    store.setSize({ widthCells: 3, heightCells: 2 })
    expect(store.doc.size.widthCells).toBe(3)
    expect(store.doc.pins.map((pin) => [pin.name, pin.x, pin.y])).toEqual([
      ['1', 0, 1],
      ['2', 2, 2]
    ])
    expect(store.status).toMatch(/1 broche/)
    store.undo()
    expect(store.doc.pins).toHaveLength(3)
    expect(store.doc.size.widthCells).toBe(4)
  })
})

describe('éditeur de composants : formes et zoom', () => {
  it('remplace une forme entière et garde l’annulation', () => {
    const store = useComponentEditorStore()
    const line: Primitive = {
      kind: 'line',
      x1: 0,
      y1: 4,
      x2: 8,
      y2: 4,
      arrows: NO_ARROWS,
      style: DEFAULT_SHAPE_STYLE
    }
    const index = store.addPrimitive(line, 'Ajouter une ligne')
    store.setPrimitive(
      index,
      { ...line, x2: 12, arrows: { start: false, middle: false, end: true } },
      'Modifier'
    )
    expect(store.selectedPrimitive).toMatchObject({ x2: 12, arrows: { end: true } })
    store.undo()
    expect(store.selectedPrimitive).toMatchObject({ x2: 8 })
  })

  it('un composant neuf et vierge n’est pas « modifié » ; le premier trait le rend modifié', () => {
    const store = useComponentEditorStore()
    expect(store.dirty).toBe(false)
    store.setMeta({ name: 'Renommé' })
    expect(store.dirty).toBe(false)
    store.addPrimitive({ kind: 'dot', x: 4, y: 4, scale: 1, color: '#000000' }, 'Ajouter un point')
    expect(store.dirty).toBe(true)
    // Enregistré puis vidé : cette fois il y a bien une modification à enregistrer.
    store.markSaved('C:/lib/renomme')
    expect(store.dirty).toBe(false)
    store.selectPrimitives([0])
    store.removeSelection()
    expect(store.dirty).toBe(true)
  })

  it('borne le zoom et ajuste au cadre', () => {
    const store = useComponentEditorStore()
    store.zoomBy(100)
    expect(store.cellPx).toBe(200)
    store.zoomBy(0.001)
    expect(store.cellPx).toBe(8)
    store.viewport = { width: 648, height: 448 }
    store.fitToViewport()
    // 4 × 2 cellules plus une cellule de marge de chaque côté : 6 × 4 dans 600 × 400, moins la
    // réserve de 2 px qui évite l'ascenseur, arrondi vers le bas.
    expect(store.cellPx).toBe(99)
  })
})

describe('éditeur de composants : sélection multiple', () => {
  it('sélectionne plusieurs formes, les déplace ensemble et les supprime', () => {
    const store = useComponentEditorStore()
    const style = { stroke: '#000000', weight: 1, fill: 'none', fillOpacity: 1 }
    store.addPrimitive({ kind: 'rect', x: 0, y: 0, w: 4, h: 4, rx: 0, style }, 'r')
    store.addPrimitive({ kind: 'rect', x: 8, y: 0, w: 4, h: 4, rx: 0, style }, 'r')
    store.addPrimitive({ kind: 'rect', x: 0, y: 8, w: 4, h: 4, rx: 0, style }, 'r')
    expect(store.selectedIndexes).toEqual([2])

    store.selectPrimitives([2, 0])
    expect(store.selectedIndexes).toEqual([0, 2])
    expect(store.selectedPrimitive).toBeNull()
    store.togglePrimitive(1)
    expect(store.selectedIndexes).toEqual([0, 1, 2])
    store.togglePrimitive(1)
    expect(store.selectedIndexes).toEqual([0, 2])

    store.movePrimitives(store.selectedIndexes, 1, 2)
    if (store.doc.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(store.doc.visual.primitives.map((p) => (p.kind === 'rect' ? [p.x, p.y] : null))).toEqual(
      [
        [1, 2],
        [8, 0],
        [1, 10]
      ]
    )

    store.removeSelection()
    expect(store.doc.visual.primitives).toHaveLength(1)
    expect(store.selection).toBeNull()
    store.undo()
    expect(store.doc.visual.primitives).toHaveLength(3)
  })
})

describe('éditeur de composants : copier, coller, dupliquer', () => {
  it('colle des copies décalées d’une cellule et dépose une copie à un décalage donné', () => {
    const store = useComponentEditorStore()
    const style = { stroke: '#000000', weight: 1, fill: 'none', fillOpacity: 1 }
    store.addPrimitive({ kind: 'rect', x: 0, y: 0, w: 4, h: 4, rx: 0, style }, 'r')
    expect(store.clipboardEmpty).toBe(true)
    store.copySelection()
    expect(store.clipboardEmpty).toBe(false)
    store.pasteClipboard()
    if (store.doc.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(store.doc.visual.primitives).toHaveLength(2)
    expect(store.doc.visual.primitives[1]).toMatchObject({ x: 4, y: 4 })
    expect(store.selectedIndexes).toEqual([1])

    store.duplicatePrimitivesAt([0, 1], 8, 0)
    expect(store.doc.visual.primitives).toHaveLength(4)
    expect(store.doc.visual.primitives.slice(2).map((p) => (p.kind === 'rect' ? p.x : -1))).toEqual(
      [8, 12]
    )
    expect(store.selectedIndexes).toEqual([2, 3])
    store.duplicatePrimitivesAt([0], 0, 0)
    expect(store.doc.visual.primitives).toHaveLength(4)
    store.undo()
    expect(store.doc.visual.primitives).toHaveLength(2)
  })
})

describe('éditeur de composants : onglets', () => {
  const dot: Primitive = { kind: 'dot', x: 4, y: 4, scale: 1, color: '#000000' }

  it('ouvre chaque composant dans son onglet ; un onglet vierge cède sa place', () => {
    const store = useComponentEditorStore()
    expect(store.tabs).toHaveLength(1)
    expect(store.pristine).toBe(true)
    store.newComponent()
    expect(store.tabs).toHaveLength(1)
    store.addPrimitive(dot, 'Ajouter un point')
    store.setMeta({ name: 'LED' })
    store.newComponent()
    expect(store.tabs.map((tab) => [tab.name, tab.dirty])).toEqual([
      ['LED', true],
      ['Nouveau composant', false]
    ])
    expect(store.anyDirty).toBe(true)
  })

  it('garde un historique et une sélection par onglet, et copie des formes de l’un à l’autre', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(dot, 'Ajouter un point')
    store.copySelection()
    const first = store.activeTabId

    store.newComponent()
    expect(store.undoLabel).toBeNull()
    store.pasteClipboard()
    expect(store.doc.visual.kind === 'drawing' && store.doc.visual.primitives).toHaveLength(1)
    expect(store.undoLabel).toBe('Coller')

    store.activateTab(first)
    expect(store.undoLabel).toBe('Ajouter un point')
    expect(store.selectedIndexes).toEqual([0])
    store.cycleTab(1)
    expect(store.undoLabel).toBe('Coller')
  })

  it('ramène l’onglet d’un composant de la bibliothèque déjà ouvert', () => {
    const store = useComponentEditorStore()
    const led = { ...store.doc, id: 'led', name: 'LED' }
    store.open(led, 'C:/lib/led')
    expect(store.tabs).toHaveLength(1)
    expect(store.dirty).toBe(false)
    store.newComponent()
    store.open(led, 'c:\\LIB\\led')
    expect(store.tabs).toHaveLength(2)
    expect(store.folder).toBe('C:/lib/led')
    // Une copie (sans dossier) est un composant à enregistrer, dans un nouvel onglet.
    store.open(
      { ...led, name: 'LED (copie)', visual: { kind: 'drawing', primitives: [dot] } },
      null
    )
    expect(store.tabs).toHaveLength(3)
    expect(store.dirty).toBe(true)
  })

  it('ferme un onglet, ceux d’un composant supprimé, et laisse un composant vierge à la fin', () => {
    const store = useComponentEditorStore()
    const led = { ...store.doc, id: 'led', name: 'LED' }
    store.open(led, 'C:/lib/led')
    store.newComponent()
    const blank = store.activeTabId
    store.moveTab(blank, 0)
    expect(store.tabs.map((tab) => tab.name)).toEqual(['Nouveau composant', 'LED'])
    store.closeFolderTabs('C:/lib/led')
    expect(store.tabs.map((tab) => tab.name)).toEqual(['Nouveau composant'])
    expect(store.closeTab(blank)).toBe(true)
    expect(store.tabs).toHaveLength(1)
    expect(store.activeTabId).not.toBe(blank)
    expect(store.pristine).toBe(true)
  })
})

describe('éditeur de composants : formes et broches sélectionnées ensemble', () => {
  const rect: Primitive = {
    kind: 'rect',
    x: 0,
    y: 0,
    w: 8,
    h: 4,
    rx: 0,
    style: { ...DEFAULT_SHAPE_STYLE }
  }

  it('déplace ensemble formes et broches, par cellules entières et en une commande', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    const pin = store.addPin({ x: 0, y: 1 })
    const other = store.addPin({ x: 2, y: 1 })
    store.select([0], [pin])
    expect(store.selectedPrimitive).toBeNull()
    expect(store.selectedPin).toBeNull()

    expect(store.moveSelection([0], [pin], 4, 0)).toBe(true)
    expect(store.doc.visual.kind === 'drawing' && store.doc.visual.primitives[0]).toMatchObject({
      x: 4
    })
    expect(store.doc.pins.find((candidate) => candidate.id === pin)).toMatchObject({ x: 1, y: 1 })
    expect(store.undoLabel).toBe('Déplacer la sélection')

    // Une demi-cellule ne convient pas à une broche ; rejoindre une autre broche non plus.
    expect(store.moveSelection([0], [pin], 2, 0)).toBe(false)
    expect(store.moveSelection([0], [pin], 4, 0)).toBe(false)
    expect(store.status).toContain('refusé')
    // Sortir de la boîte du composant est refusé aussi.
    expect(store.moveSelection([], [other], 40, 0)).toBe(false)

    store.undo()
    expect(store.doc.pins.find((candidate) => candidate.id === pin)).toMatchObject({ x: 0, y: 1 })
  })

  it('ajoute et retire une broche de la sélection, et supprime le tout en une commande', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    const first = store.addPin({ x: 0, y: 1 })
    const second = store.addPin({ x: 4, y: 1 })
    store.selectPrimitives([0])
    store.togglePin(first)
    store.togglePin(second)
    store.togglePin(first)
    expect(store.selection).toEqual({ indexes: [0], pinIds: [second] })

    store.removeSelection()
    expect(store.selection).toBeNull()
    expect(store.doc.visual.kind === 'drawing' && store.doc.visual.primitives).toHaveLength(0)
    expect(store.doc.pins.map((candidate) => candidate.id)).toEqual([first])
    store.undo()
    expect(store.doc.pins).toHaveLength(2)
  })
})

describe('éditeur de composants : gestes communs aux éditeurs', () => {
  const rect: Primitive = {
    kind: 'rect',
    x: 0,
    y: 0,
    w: 8,
    h: 4,
    rx: 0,
    style: DEFAULT_SHAPE_STYLE
  }

  it('Ctrl+A sélectionne toutes les formes et toutes les broches', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    store.addPrimitive({ ...rect, x: 8 }, 'Ajouter un rectangle')
    const pin = store.addPin({ x: 0, y: 1 })
    store.selection = null
    store.selectAll()
    expect(store.selection).toEqual({ indexes: [0, 1], pinIds: [pin] })
  })

  it('les flèches déplacent d’un quart de cellule, d’une cellule avec une broche', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    const pin = store.addPin({ x: 1, y: 1 })
    // Une forme seule : un quart de cellule, le pas de sa grille.
    expect(store.moveSelection([0], [], 1, 0)).toBe(true)
    expect(store.doc.visual.kind === 'drawing' && store.doc.visual.primitives[0]).toMatchObject({
      x: 1
    })
    // Avec une broche : un quart est refusé, une cellule entière passe.
    expect(store.moveSelection([0], [pin], 1, 0)).toBe(false)
    expect(store.moveSelection([0], [pin], 4, 0)).toBe(true)
    expect(store.doc.pins[0]).toMatchObject({ x: 2, y: 1 })
  })
})

describe('éditeur de composants : images', () => {
  /** LED de 160 × 240 px : 2 × 3 cellules à 80 px par cellule. */
  const led = pngHeaderDataUrl(160, 240)
  const square = pngHeaderDataUrl(80, 80)

  it('pose une image importée comme une forme ; un composant vierge prend sa taille', () => {
    const store = useComponentEditorStore()
    store.tool = 'rect'
    store.importImage(led, 160, 240)
    expect(store.doc.size).toEqual({ widthCells: 2, heightCells: 3 })
    expect(store.doc.visual.primitives).toEqual([
      { kind: 'image', x: 0, y: 0, w: 8, h: 12, file: 'image.png', dataUrl: led }
    ])
    expect(store.selectedIndexes).toEqual([0])
    expect(store.tool).toBe('select')
    expect(store.undoLabel).toBe('Importer une image')
    // Une broche se pose sur l'image, sur la grille ; tout s'annule pas à pas.
    store.addPin({ x: 1, y: 0 })
    store.undo()
    store.undo()
    expect(store.doc.size).toEqual({ widthCells: 4, heightCells: 2 })
    expect(store.doc.visual.primitives).toHaveLength(0)
  })

  it('centre l’image sur des cellules entières dans un composant déjà dessiné, par-dessus', () => {
    const store = useComponentEditorStore()
    store.setSize({ widthCells: 6, heightCells: 6 })
    store.addPrimitive({ kind: 'dot', x: 4, y: 4, scale: 1, color: '#000000' }, 'Ajouter un point')
    store.importImage(led, 160, 240)
    expect(store.doc.size).toEqual({ widthCells: 6, heightCells: 6 })
    // (6 − 2) / 2 = 2 cellules ; (6 − 3) / 2 = 1,5, arrondi à 2 cellules.
    expect(store.doc.visual.primitives[1]).toMatchObject({ kind: 'image', x: 8, y: 8, w: 8, h: 12 })
    // Une seconde image, différente, ne prend pas le fichier de la première.
    store.importImage(square, 80, 80)
    expect(store.doc.visual.primitives[2]).toMatchObject({ file: 'image-2.png', w: 4, h: 4 })
    expect(store.selectedIndexes).toEqual([2])
  })

  it('rend à une image redimensionnée sa taille d’origine', () => {
    const store = useComponentEditorStore()
    store.importImage(led, 160, 240)
    const image = store.doc.visual.primitives[0]
    if (image?.kind !== 'image') throw new Error('image attendue')
    store.setPrimitive(0, { ...image, w: 4, h: 6 }, 'Modifier')
    store.resetImageSize(0)
    expect(store.doc.visual.primitives[0]).toMatchObject({ x: 0, y: 0, w: 8, h: 12 })
    expect(store.undoLabel).toBe('Taille d’origine de l’image')
    // Déjà à sa taille : rien à faire, rien à annuler de plus.
    store.resetImageSize(0)
    store.undo()
    expect(store.doc.visual.primitives[0]).toMatchObject({ w: 4, h: 6 })
  })

  it('colle une image d’un autre composant sans lui donner le fichier d’une image d’ici', () => {
    const store = useComponentEditorStore()
    store.importImage(led, 160, 240)
    store.copySelection()
    store.newComponent()
    store.importImage(square, 80, 80)
    store.pasteClipboard()
    const files = (): (string | null)[] =>
      store.doc.visual.primitives.map((primitive) =>
        primitive.kind === 'image' ? primitive.file : null
      )
    expect(files()).toEqual(['image.png', 'image-2.png'])
    // Dupliquer l'image collée : la même image, le même fichier.
    store.duplicateSelection()
    expect(files()).toEqual(['image.png', 'image-2.png', 'image-2.png'])
  })
})

describe('éditeur de composants : coller à un endroit', () => {
  it('amène le coin supérieur gauche de la copie au point demandé', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(
      { kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE },
      'Ajouter un rectangle'
    )
    store.addPrimitive({ kind: 'dot', x: 14, y: 8, scale: 1, color: '#000000' }, 'Ajouter un point')
    store.selectAll()
    store.copySelection()
    store.pasteClipboardAt(20, 10)
    // Le rectangle donne le coin de l'ensemble ; le point garde son écart.
    expect(store.doc.visual.primitives.slice(2)).toMatchObject([
      { kind: 'rect', x: 20, y: 10 },
      { kind: 'dot', x: 30, y: 16 }
    ])
    expect(store.selectedIndexes).toEqual([2, 3])
    expect(store.undoLabel).toBe('Coller')
  })
})

describe('éditeur de composants : groupes', () => {
  const rect: Primitive = {
    kind: 'rect',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    rx: 0,
    style: DEFAULT_SHAPE_STYLE
  }

  it('groupe formes et broche ; un clic emmène le groupe, Maj+clic l’ajoute ou le retire', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    store.addPrimitive({ ...rect, x: 8 }, 'Ajouter un rectangle')
    store.addPrimitive({ ...rect, x: 12, y: 4 }, 'Ajouter un rectangle')
    const pin = store.addPin({ x: 0, y: 1 })
    expect(store.hasGroups).toBe(false)
    store.select([0, 1], [pin])
    expect(store.canGroup).toBe(true)
    store.groupSelection()
    expect(store.undoLabel).toBe('Grouper')
    expect(store.groups).toEqual([{ id: 'g1', indexes: [0, 1], pinIds: [pin] }])
    expect([store.canGroup, store.canUngroup]).toEqual([false, true])

    // Clic sur une forme du groupe : tout le groupe ; sur la forme libre : elle seule.
    store.selectElement({ kind: 'primitive', index: 1 })
    expect([store.selectedIndexes, store.selectedPinIds]).toEqual([[0, 1], [pin]])
    store.selectElement({ kind: 'primitive', index: 2 })
    expect([store.selectedIndexes, store.selectedPinIds]).toEqual([[2], []])
    // Maj+clic sur la broche : son groupe s'ajoute ; sur une de ses formes : il se retire en entier.
    store.togglePin(pin)
    expect([store.selectedIndexes, store.selectedPinIds]).toEqual([[0, 1, 2], [pin]])
    store.togglePrimitive(0)
    expect([store.selectedIndexes, store.selectedPinIds]).toEqual([[2], []])
    // Un lasso qui touche la broche prend son groupe.
    store.select([2], [pin])
    store.expandSelectionToGroups()
    expect(store.selectedIndexes).toEqual([0, 1, 2])

    // L'appartenance suit la forme quand son rang change.
    store.selectPrimitives([0])
    store.reorderPrimitive('top')
    expect(store.groups).toEqual([{ id: 'g1', indexes: [0, 2], pinIds: [pin] }])

    store.selectElement({ kind: 'pin', id: pin })
    store.ungroupSelection()
    expect(store.hasGroups).toBe(false)
    store.undo()
    expect(store.groups).toHaveLength(1)
  })

  it('dupliquer un groupe en forme un nouveau ; une forme copiée seule n’en a pas', () => {
    const store = useComponentEditorStore()
    store.addPrimitive(rect, 'Ajouter un rectangle')
    store.addPrimitive({ ...rect, x: 8 }, 'Ajouter un rectangle')
    store.select([0, 1])
    store.groupSelection()
    store.duplicateSelection()
    expect(store.groups).toEqual([
      { id: 'g1', indexes: [0, 1], pinIds: [] },
      { id: 'g2', indexes: [2, 3], pinIds: [] }
    ])
    expect(store.selectedIndexes).toEqual([2, 3])
    store.selectPrimitives([0])
    store.duplicateSelection()
    expect(store.doc.visual.primitives.at(-1)?.group).toBeUndefined()
  })
})

describe('éditeur de composants : groupes de broches', () => {
  it('crée, renomme et défait des groupes ; ranger une broche change son ordre et son numéro', () => {
    const store = useComponentEditorStore()
    const a = store.addPin({ x: 0, y: 0 })
    const b = store.addPin({ x: 0, y: 1 })
    const c = store.addPin({ x: 0, y: 2 })
    const power = store.addPinGroup()
    const signals = store.addPinGroup()
    expect(store.doc.pinGroups).toEqual([
      { id: 'pg1', name: 'Groupe 1' },
      { id: 'pg2', name: 'Groupe 2' }
    ])
    store.renamePinGroup(power, '  Alimentation ')
    expect(store.doc.pinGroups?.[0]?.name).toBe('Alimentation')
    store.renamePinGroup(power, '   ')
    expect(store.doc.pinGroups?.[0]?.name).toBe('Alimentation')

    const state = (): [string, string, string | undefined][] =>
      store.doc.pins.map((pin) => [pin.id, pin.name, pin.pinGroup])
    // La dernière broche dans le premier groupe : elle passe en tête et devient la 1.
    store.placePin(c, power, null)
    expect(store.undoLabel).toBe('Ranger la broche')
    expect(state()).toEqual([
      [c, '1', power],
      [a, '2', undefined],
      [b, '3', undefined]
    ])
    // Devant elle, dans le même groupe ; puis une autre dans le second groupe.
    store.placePin(b, power, c)
    store.placePin(a, signals, null)
    expect(state()).toEqual([
      [b, '1', power],
      [c, '2', power],
      [a, '3', signals]
    ])
    // Reposée là où elle est : rien à annuler de plus.
    store.placePin(a, signals, null)
    expect(store.undoLabel).toBe('Ranger la broche')
    store.undo()
    expect(state()[2]).toEqual([a, '3', undefined])
    store.redo()

    // Défaire le premier groupe : ses broches restent, sans groupe, après les autres.
    store.removePinGroup(power)
    expect(store.doc.pinGroups).toEqual([{ id: 'pg2', name: 'Groupe 2' }])
    expect(state()).toEqual([
      [a, '1', signals],
      [b, '2', undefined],
      [c, '3', undefined]
    ])
    store.removePinGroup(signals)
    expect(store.doc.pinGroups).toBeUndefined()
    // Une nouvelle broche arrive toujours à la fin, sans groupe.
    store.undo()
    const d = store.addPin({ x: 1, y: 0 })
    expect(state().at(-1)).toEqual([d, '4', undefined])
  })
})
