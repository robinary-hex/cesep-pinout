import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SHAPE_STYLE, NO_ARROWS, type Primitive } from '@/domain'
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

  it('borne le zoom et ajuste au cadre', () => {
    const store = useComponentEditorStore()
    store.zoomBy(100)
    expect(store.cellPx).toBe(200)
    store.zoomBy(0.001)
    expect(store.cellPx).toBe(8)
    store.viewport = { width: 648, height: 448 }
    store.fitToViewport()
    // 4 × 2 cellules plus une cellule de marge de chaque côté : 6 × 4 dans 600 × 400.
    expect(store.cellPx).toBe(100)
  })
})

describe('éditeur de composants : sélection multiple', () => {
  it('sélectionne plusieurs formes, les déplace ensemble et les supprime', () => {
    const store = useComponentEditorStore()
    const style = { stroke: '#000000', weight: 1, fill: 'none' }
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
    const style = { stroke: '#000000', weight: 1, fill: 'none' }
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
