import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  absolutePinPosition,
  createEmptyComponent,
  parseProject,
  serializeProject,
  type ComponentDefinition
} from '@/domain'
import { useSchematicStore } from './store'

function resistor(): ComponentDefinition {
  const def = createEmptyComponent('resistor', 'Résistance')
  def.labelPrefix = 'R'
  def.pins = [
    { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
    { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
  ]
  return def
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('montage : poser, déplacer, orienter', () => {
  it('pose des composants avec repères numérotés et une seule définition embarquée', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(2, 3)
    store.placeAt(10, 3)
    expect(store.doc.components.map((c) => c.label)).toEqual(['R1', 'R2'])
    expect(Object.keys(store.doc.embeddedDefs)).toEqual(['resistor'])
    expect(store.dirty).toBe(true)
  })

  it('déplace, tourne et retourne la sélection', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(2, 3)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    store.selection = [id]

    store.moveInstances([id], 3, -1)
    expect(store.doc.components[0]).toMatchObject({ x: 5, y: 2 })

    store.rotateSelection('cw')
    expect(store.doc.components[0]?.rotation).toBe(90)

    store.flipSelection('horizontal')
    expect(store.doc.components[0]).toMatchObject({ mirror: true, rotation: 270 })
  })

  it('duplique et colle avec de nouveaux repères', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    store.selection = id ? [id] : []
    store.duplicateSelection()
    expect(store.doc.components.map((c) => [c.label, c.x, c.y])).toEqual([
      ['R1', 0, 0],
      ['R2', 1, 1]
    ])
    expect(store.selection).toEqual(['c2'])

    store.copySelection()
    store.newProject()
    expect(store.doc.components).toHaveLength(0)
    store.pasteClipboard()
    expect(store.doc.components).toHaveLength(1)
    expect(store.doc.embeddedDefs['resistor']).toBeDefined()
  })

  it('s’annule et se refait commande par commande', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(2, 3)
    store.stopPlacing()
    store.selection = id ? [id] : []
    store.moveInstances(store.selection, 1, 1)
    store.rotateSelection('cw')
    expect(store.undoLabel).toBe('Rotation horaire')

    store.undo()
    expect(store.doc.components[0]).toMatchObject({ x: 3, y: 4, rotation: 0 })
    store.undo()
    expect(store.doc.components[0]).toMatchObject({ x: 2, y: 3 })
    store.undo()
    expect(store.doc.components).toHaveLength(0)
    expect(store.selection).toEqual([])

    store.redo()
    store.redo()
    store.redo()
    // La rotation garde le centre : la boîte 4 × 2 en (3, 4) devient 2 × 4 en (4, 3).
    expect(store.doc.components[0]).toMatchObject({ x: 4, y: 3, rotation: 90 })
  })

  it('supprime la sélection et la retrouve par annulation', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(0, 0)
    store.placeAt(8, 0)
    store.stopPlacing()
    store.selectAll()
    store.removeSelection()
    expect(store.doc.components).toHaveLength(0)
    store.undo()
    expect(store.doc.components).toHaveLength(2)
  })

  it('produit un projet qui se sauve et se rouvre à l’identique', () => {
    const store = useSchematicStore()
    store.setProjectName('Test')
    store.startPlacing(resistor())
    store.placeAt(2, 3)
    store.stopPlacing()
    store.selectAll()
    store.rotateSelection('ccw')
    store.flipSelection('vertical')

    const text = serializeProject(store.doc)
    const reopened = parseProject(text)
    expect(reopened).toEqual(store.doc)
    expect(serializeProject(reopened)).toBe(text)

    const instance = reopened.components[0]
    const def = reopened.embeddedDefs['resistor']
    if (!instance || !def) throw new Error('projet incomplet')
    const pinA = def.pins[0]
    if (!pinA) throw new Error('broche manquante')
    expect(absolutePinPosition(instance, def, pinA)).toEqual(
      absolutePinPosition(store.doc.components[0] ?? instance, def, pinA)
    )
  })

  it('zoome autour d’un point sans le faire bouger à l’écran', () => {
    const store = useSchematicStore()
    const base = store.doc.profile.cellPx
    const before = store.view
    const worldX = (300 - before.panX) / (base * before.zoom)
    store.zoomAround(2, 300, 200)
    const after = store.view
    expect(after.zoom).toBe(2)
    expect((300 - after.panX) / (base * after.zoom)).toBeCloseTo(worldX)
  })

  it('ajuste la vue au contenu', () => {
    const store = useSchematicStore()
    store.viewport = { width: 1000, height: 500 }
    store.startPlacing(resistor())
    store.placeAt(0, 0)
    store.stopPlacing()
    store.fitToContent()
    const scale = store.doc.profile.cellPx * store.view.zoom
    const centerX = store.view.panX + 2 * scale
    expect(centerX).toBeCloseTo(500)
  })
})
