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
  it('pose des composants sans repère automatique et une seule définition embarquée', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(2, 3)
    store.placeAt(10, 3)
    expect(store.doc.components.map((c) => [c.label, c.fields])).toEqual([
      ['', {}],
      ['', {}]
    ])
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
      ['', 0, 0],
      ['', 1, 1]
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

describe('montage : fils', () => {
  it('trace un fil par étapes, le simplifie et le relie aux broches', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(0, 0) // broches en (0, 1) et (4, 1)
    store.placeAt(10, 0) // broches en (10, 1) et (14, 1)
    store.startWireTool()
    store.beginWire([4, 1])
    store.appendWirePoints([[7, 1]])
    store.appendWirePoints([[10, 1]])
    const id = store.finishWire()
    expect(id).toBe('w1')
    expect(store.doc.wires[0]).toMatchObject({
      points: [
        [4, 1],
        [10, 1]
      ],
      stack: 0,
      freeEnds: 'flat'
    })
    const nets = store.connectivity
    expect(nets.freeEnds).toEqual([])
    expect(nets.pinNet.get('c1:b')).toBe(nets.pinNet.get('c2:a'))
    expect(nets.pinNet.get('c1:a')).not.toBe(nets.pinNet.get('c2:a'))
  })

  it('refuse un fil d’un seul point et nettoie les demi-tours', () => {
    const store = useSchematicStore()
    store.startWireTool()
    store.beginWire([0, 0])
    expect(store.finishWire()).toBeNull()
    expect(
      store.addWire([
        [0, 0],
        [6, 0],
        [3, 0],
        [3, 4]
      ])
    ).toBe('w1')
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 0],
      [3, 0],
      [3, 4]
    ])
  })

  it('dérive une jonction en T et la couleur de son porteur', () => {
    const store = useSchematicStore()
    store.setCurrentColor('#d62828')
    store.addWire([
      [0, 5],
      [20, 5]
    ])
    store.setCurrentColor('#1d4ed8')
    store.addWire([
      [10, 0],
      [10, 5]
    ])
    expect(store.connectivity.junctions).toEqual([
      { point: [10, 5], carrierWireId: 'w1', branches: 3 }
    ])
    expect(store.doc.wires.map((wire) => wire.color)).toEqual(['#d62828', '#1d4ed8'])
  })

  it('recolore, réordonne, déplace et supprime les fils sélectionnés', () => {
    const store = useSchematicStore()
    store.addWire([
      [0, 0],
      [4, 0]
    ])
    store.addWire([
      [0, 2],
      [4, 2]
    ])
    store.addWire([
      [0, 4],
      [4, 4]
    ])
    store.selectedWires = ['w1']
    store.setCurrentColor('#15803d')
    expect(store.doc.wires[0]?.color).toBe('#15803d')

    store.reorderWires('top')
    expect(store.sortedWires.map((wire) => wire.id)).toEqual(['w2', 'w3', 'w1'])
    store.reorderWires('down')
    expect(store.sortedWires.map((wire) => wire.id)).toEqual(['w2', 'w1', 'w3'])

    store.moveSelection(1, 1)
    expect(store.doc.wires[0]?.points).toEqual([
      [1, 1],
      [5, 1]
    ])

    store.removeSelection()
    expect(store.doc.wires.map((wire) => wire.id)).toEqual(['w2', 'w3'])
    store.undo()
    expect(store.doc.wires).toHaveLength(3)
  })

  it('modifie la géométrie d’un fil sans accepter une forme invalide', () => {
    const store = useSchematicStore()
    store.addWire([
      [0, 0],
      [4, 0],
      [4, 6]
    ])
    store.setWirePoints('w1', [
      [0, 0],
      [0, 3],
      [4, 3],
      [4, 6]
    ])
    expect(store.doc.wires[0]?.points).toHaveLength(4)
    store.setWirePoints('w1', [
      [0, 0],
      [3, 2]
    ])
    expect(store.doc.wires[0]?.points).toHaveLength(4)
  })

  it('duplique et colle les fils avec les composants', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(0, 0)
    store.stopPlacing()
    store.addWire([
      [4, 1],
      [8, 1]
    ])
    store.selectAll()
    store.duplicateSelection()
    expect(store.doc.components).toHaveLength(2)
    expect(store.doc.wires.map((wire) => wire.points)).toEqual([
      [
        [4, 1],
        [8, 1]
      ],
      [
        [5, 2],
        [9, 2]
      ]
    ])
    expect(store.selectedWires).toEqual(['w2'])

    const text = serializeProject(store.doc)
    expect(parseProject(text)).toEqual(store.doc)
  })
})

describe('montage : élasticité des fils, valeurs, collage', () => {
  function twoResistorsWithWire(): {
    store: ReturnType<typeof useSchematicStore>
    a: string
    b: string
    wire: string
  } {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0) // broches (0,1) et (4,1)
    const b = store.placeAt(10, 0) // broches (10,1) et (14,1)
    store.stopPlacing()
    const wire = store.addWire([
      [4, 1],
      [10, 1]
    ])
    if (!a || !b || !wire) throw new Error('mise en place refusée')
    return { store, a, b, wire }
  }

  function sameNet(store: ReturnType<typeof useSchematicStore>, a: string, b: string): boolean {
    const nets = store.connectivity.pinNet
    return nets.get(`${a}:b`) !== undefined && nets.get(`${a}:b`) === nets.get(`${b}:a`)
  }

  it('les fils posés sur les broches suivent un composant déplacé', () => {
    const { store, a, b, wire } = twoResistorsWithWire()
    expect(sameNet(store, a, b)).toBe(true)
    store.selection = [b]
    store.moveSelection(0, 3)
    expect(store.doc.wires.find((candidate) => candidate.id === wire)?.points).toEqual([
      [4, 1],
      [4, 4],
      [10, 4]
    ])
    expect(sameNet(store, a, b)).toBe(true)
    store.undo()
    expect(store.doc.wires[0]?.points).toEqual([
      [4, 1],
      [10, 1]
    ])
  })

  it('un fil déplacé avec son composant reste accroché à l’autre composant', () => {
    const { store, a, b, wire } = twoResistorsWithWire()
    store.selection = [a]
    store.selectedWires = [wire]
    store.moveSelection(0, 3)
    expect(store.doc.wires[0]?.points).toEqual([
      [4, 4],
      [4, 1],
      [10, 1]
    ])
    expect(sameNet(store, a, b)).toBe(true)
  })

  it('les fils suivent aussi une rotation et un miroir', () => {
    const { store, a, b } = twoResistorsWithWire()
    store.selection = [b]
    store.rotateSelection('cw')
    expect(sameNet(store, a, b)).toBe(true)
    store.flipSelection('vertical')
    expect(sameNet(store, a, b)).toBe(true)
    expect(store.doc.wires[0]?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('donne une valeur à un texte variable et revient à la valeur par défaut', () => {
    const store = useSchematicStore()
    const def = resistor()
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'text',
          x: 8,
          y: 4,
          text: 'R',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: true,
          defaultValue: '10 kΩ',
          unit: ''
        }
      ]
    }
    store.startPlacing(def)
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    store.setInstanceField(id, 'R', ' 4,7 kΩ ')
    expect(store.doc.components[0]?.fields).toEqual({ R: '4,7 kΩ' })
    store.setInstanceField(id, 'R', '')
    expect(store.doc.components[0]?.fields).toEqual({})
    store.undo()
    expect(store.doc.components[0]?.fields).toEqual({ R: '4,7 kΩ' })
  })

  it('colle le presse-papiers à la cellule demandée', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(3, 2)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    expect(store.clipboardEmpty).toBe(true)
    store.selection = [id]
    store.copySelection()
    expect(store.clipboardEmpty).toBe(false)
    store.pasteClipboardAt(20, 10)
    expect(store.doc.components).toHaveLength(2)
    expect(store.doc.components[1]).toMatchObject({ x: 20, y: 10 })
  })
})

describe('montage : aperçu du profil', () => {
  it('affiche le profil en cours d’édition à la place de celui du projet, puis revient', () => {
    const store = useSchematicStore()
    const base = store.doc.profile.cellPx
    store.profilePreview = { ...store.doc.profile, cellPx: base * 2 }
    expect(store.profile.cellPx).toBe(base * 2)
    expect(store.cellPx).toBe(base * 2 * store.view.zoom)
    expect(store.doc.profile.cellPx).toBe(base)
    store.profilePreview = null
    expect(store.profile.cellPx).toBe(base)
  })
})

describe('montage : pose depuis la bibliothèque', () => {
  it('reposer un composant modifié met à jour la copie embarquée et fait suivre les fils', () => {
    const store = useSchematicStore()
    const v1 = resistor()
    store.startPlacing(v1)
    const first = store.placeAt(0, 0) // broche b en (4,1)
    store.stopPlacing()
    if (!first) throw new Error('pose refusée')
    store.addWire([
      [4, 1],
      [8, 1]
    ])

    const v2 = resistor()
    v2.description = 'Version revue'
    v2.pins = [
      { id: 'a', name: '1', kind: 'io', x: 0, y: 0 },
      { id: 'b', name: '2', kind: 'io', x: 4, y: 0 }
    ]
    store.startPlacing(v2)
    store.placeAt(0, 10)
    store.stopPlacing()

    expect(store.doc.embeddedDefs['resistor']?.description).toBe('Version revue')
    expect(store.doc.components).toHaveLength(2)
    // Le fil posé sur l'ancienne broche (4,1) suit la nouvelle (4,0).
    expect(store.doc.wires[0]?.points[0]).toEqual([4, 0])
    expect(store.connectivity.pinNet.get(`${first}:b`)).toBe(
      store.connectivity.wireNet.get(store.doc.wires[0]?.id ?? '')
    )
  })
})
