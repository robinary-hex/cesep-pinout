import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  absolutePinPosition,
  componentFields,
  createEmptyComponent,
  createEmptyProject,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_SHAPE_STYLE,
  parseProject,
  serializeProject,
  withPreviewVariant,
  type ComponentDefinition
} from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { setBridge } from '@/io/bridge'
import { saveComponent } from '@/io/library'
import { FakeFs } from '@/io/testing/fakeFs'
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
      freeEnds: 'flat',
      endLabels: { start: '', end: '' }
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

  it('une jonction suit le fil qui la porte, dans la même commande', () => {
    const store = useSchematicStore()
    store.addWire([
      [0, 0],
      [10, 0],
      [10, 5]
    ])
    store.addWire([
      [5, 0],
      [5, 6]
    ])
    // Le premier segment de w1 monte de trois cellules : l'extrémité de w2 posée dessus suit.
    store.setWirePoints('w1', [
      [0, 0],
      [0, -3],
      [10, -3],
      [10, 5]
    ])
    expect(store.doc.wires[1]?.points).toEqual([
      [5, -3],
      [5, 6]
    ])
    expect(store.connectivity.junctions.map((junction) => junction.point)).toEqual([[5, -3]])
    store.undo()
    expect(store.doc.wires.map((wire) => wire.points.length)).toEqual([3, 2])
    expect(store.doc.wires[1]?.points[0]).toEqual([5, 0])
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
          w: 8,
          h: 2,
          x: 8,
          y: 4,
          text: 'R',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: true,
          defaultValue: '10 kΩ',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false,
          vertical: false
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

describe('montage : styles des étiquettes texte', () => {
  it('crée une étiquette noire, sans style, horizontale', () => {
    const store = useSchematicStore()
    store.addLabel(2, 0)
    expect(store.doc.labels[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 4,
      h: 1,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      vertical: false,
      color: '#000000'
    })
  })

  it('change styles et couleur, chacun annulable', () => {
    const store = useSchematicStore()
    const id = store.addLabel(2, 0)
    store.setLabelStyle(id, 'Italique activé', { italic: true })
    store.setLabelStyle(id, 'Couleur de l’étiquette', { color: '#d62828' })
    expect(store.doc.labels[0]).toMatchObject({ italic: true, color: '#d62828', bold: false })
    expect(store.undoLabel).toBe('Couleur de l’étiquette')
    store.undo()
    expect(store.doc.labels[0]).toMatchObject({ italic: true, color: '#000000' })
    store.undo()
    expect(store.doc.labels[0]?.italic).toBe(false)
  })

  it('met une étiquette à la verticale en tournant sa boîte, et revient au même endroit', () => {
    const store = useSchematicStore()
    const id = store.addLabel(2, 0)
    store.setLabelVertical(id, true)
    expect(store.doc.labels[0]).toMatchObject({ x: 1, y: -1, w: 1, h: 4, vertical: true })
    store.setLabelVertical(id, false)
    expect(store.doc.labels[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 1, vertical: false })
    // Une boîte déjà debout garde sa place.
    store.setLabelBox(id, { x: 5, y: 5, w: 1, h: 3 })
    store.setLabelVertical(id, true)
    expect(store.doc.labels[0]).toMatchObject({ x: 5, y: 5, w: 1, h: 3, vertical: true })
  })

  it('enregistre et relit les styles d’une étiquette', () => {
    const store = useSchematicStore()
    const id = store.addLabel(2, 0)
    store.setLabelStyle(id, 'Souligné activé', { underline: true, strike: true })
    store.setLabelVertical(id, true)
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.labels[0]).toMatchObject({ underline: true, strike: true, vertical: true })
  })
})

describe('montage : étiquettes d’extrémité et copie au glisser', () => {
  it('pose et retire une étiquette sur chaque extrémité d’un fil', () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [0, 0],
      [4, 0]
    ])
    if (!id) throw new Error('fil refusé')
    store.setWireEndLabel(id, 0, ' VCC ')
    store.setWireEndLabel(id, 1, 'vers J3')
    expect(store.doc.wires[0]?.endLabels).toEqual({ start: 'VCC', end: 'vers J3' })
    store.setWireEndLabel(id, 1, '')
    expect(store.doc.wires[0]?.endLabels).toEqual({ start: 'VCC', end: '' })
    store.undo()
    expect(store.doc.wires[0]?.endLabels.end).toBe('vers J3')
  })

  it('dépose une copie de la sélection au décalage donné, en une commande', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    store.selection = [id]
    store.duplicateSelectionAt(6, 2)
    expect(store.doc.components).toHaveLength(2)
    expect(store.doc.components[0]).toMatchObject({ x: 0, y: 0 })
    expect(store.doc.components[1]).toMatchObject({ x: 6, y: 2 })
    expect(store.selection).toEqual([store.doc.components[1]?.id])
    store.duplicateSelectionAt(0, 0)
    expect(store.doc.components).toHaveLength(2)
    store.undo()
    expect(store.doc.components).toHaveLength(1)
  })
})

describe('montage : fin d’un tracé de fil', () => {
  it('garde le fil commencé quand on change d’outil ou qu’on arrête, dès deux sommets', () => {
    const store = useSchematicStore()
    store.startWireTool()
    store.beginWire([0, 0])
    store.appendWirePoints([[4, 0]])
    store.selectTool()
    expect(store.doc.wires).toHaveLength(1)
    expect(store.drawing).toBeNull()

    store.startWireTool()
    store.beginWire([0, 4])
    expect(store.stopWireDrawing()).toBe(true)
    expect(store.doc.wires).toHaveLength(1)
    expect(store.stopWireDrawing()).toBe(false)

    store.startWireTool()
    store.beginWire([0, 6])
    store.appendWirePoints([[6, 6]])
    store.startTextTool()
    expect(store.doc.wires).toHaveLength(2)
  })
})

describe('onglets de montage', () => {
  it('un montage vierge n’est pas modifié, et un nouveau montage prend sa place', () => {
    const store = useSchematicStore()
    expect(store.dirty).toBe(false)
    expect(store.pristine).toBe(true)
    store.newProject()
    expect(store.tabs).toHaveLength(1)
    store.setProjectName('Alim')
    store.addLabel(0, 0)
    expect(store.pristine).toBe(false)
    store.newProject()
    expect(store.tabs.map((tab) => [tab.name, tab.dirty])).toEqual([
      ['Alim', true],
      ['Nouveau montage', false]
    ])
  })

  it('un montage sans fichier et sans contenu n’a rien à enregistrer, même après des essais', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    expect(store.dirty).toBe(true)
    store.selection = id ? [id] : []
    store.removeSelection()
    store.setProjectName('Essai')
    // Vide de nouveau : rien à enregistrer, mais ce n'est plus un onglet vierge (historique).
    expect(store.dirty).toBe(false)
    expect(store.anyDirty).toBe(false)
    expect(store.dirtyDocuments()).toEqual([])
    expect(store.pristine).toBe(false)
    // Le même montage vidé, s'il a un fichier, doit être enregistré.
    store.markSaved('D:/Docs/essai.pinout')
    store.setProjectName('Essai 2')
    expect(store.dirty).toBe(true)
  })

  it('garde un document, un historique et une sélection par onglet', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(2, 3)
    store.stopPlacing()
    store.selection = id ? [id] : []
    const first = store.activeTabId

    store.newProject()
    expect(store.doc.components).toHaveLength(0)
    expect(store.undoLabel).toBeNull()
    expect(store.selection).toEqual([])
    store.setProjectName('Second')

    store.activateTab(first)
    expect(store.doc.components.map((c) => c.id)).toEqual([id])
    expect(store.selection).toEqual([id])
    expect(store.undoLabel).toBe('Poser Résistance')
    store.undo()
    expect(store.doc.components).toHaveLength(0)

    // L'annulation n'a touché que cet onglet.
    store.cycleTab(1)
    expect(store.doc.name).toBe('Second')
    expect(store.undoLabel).toBe('Renommer le projet')
  })

  it('colle dans un autre montage en y embarquant la définition du composant', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    store.selection = id ? [id] : []
    store.copySelection()
    const first = store.activeTabId

    store.newProject()
    store.pasteClipboard()
    expect(store.doc.components).toHaveLength(1)
    expect(store.doc.embeddedDefs['resistor']).toBeDefined()

    store.activateTab(first)
    expect(store.doc.components).toHaveLength(1)
  })

  it('rouvrir un fichier déjà ouvert ramène son onglet', async () => {
    const store = useSchematicStore()
    store.openProject(createEmptyProject('Alim', DEFAULT_PROFILE), 'D:\\Docs\\alim.pinout.json')
    // Le montage vierge du départ a cédé sa place.
    expect(store.tabs).toHaveLength(1)
    store.newProject()
    expect(store.tabs).toHaveLength(2)
    expect(await store.openPath('d:/docs/ALIM.pinout.json')).toBe(true)
    expect(store.tabs).toHaveLength(2)
    expect(store.doc.name).toBe('Alim')
  })

  it('ferme un onglet ; le dernier laisse un montage vierge', () => {
    const store = useSchematicStore()
    store.openProject(createEmptyProject('Alim', DEFAULT_PROFILE), 'D:/Docs/alim.pinout.json')
    const alim = store.activeTabId
    store.newProject()
    const blank = store.activeTabId
    // Fermer l'onglet affiché montre son voisin.
    expect(store.closeTab(blank)).toBe(true)
    expect(store.activeTabId).toBe(alim)
    expect(store.closeTab(alim)).toBe(true)
    expect(store.tabs).toHaveLength(1)
    expect(store.pristine).toBe(true)
  })

  it('ferme un onglet modifié sans rien demander : la question se pose avant, dans l’action', () => {
    const store = useSchematicStore()
    store.setProjectName('Brouillon')
    expect(store.closeTab(store.activeTabId)).toBe(true)
    expect(store.doc.name).toBe('Nouveau montage')
    expect(store.closeTab(-1)).toBe(false)
  })

  it('garde une couleur personnalisée dans le montage où elle est ajoutée, pas ailleurs', () => {
    const store = useSchematicStore()
    const paletteSize = store.colorChoices.length
    store.addCustomColor('#ff00aa')
    store.addCustomColor('#FF00AA')
    // Une couleur de la palette de l'application n'est pas reprise.
    store.addCustomColor('#000000')
    expect(store.doc.customColors).toEqual(['#ff00aa'])
    expect(store.colorChoices).toHaveLength(paletteSize + 1)
    const first = store.activeTabId

    store.newProject()
    expect(store.doc.customColors).toEqual([])
    expect(store.colorChoices).toHaveLength(paletteSize)
    store.activateTab(first)
    expect(store.colorChoices.at(-1)).toEqual({ hex: '#ff00aa', name: '#ff00aa', custom: true })
  })

  it('modifie ou supprime une couleur du montage : une commande, les fils gardent la leur', () => {
    const store = useSchematicStore()
    store.addCustomColor('#ff00aa')
    store.setCurrentColor('#ff00aa')
    const wire = store.addWire([
      [0, 0],
      [4, 0]
    ])
    store.changeColorChoice('#FF00AA', '#123456')
    expect(store.doc.customColors).toEqual(['#123456'])
    expect(store.undoLabel).toBe('Modifier une couleur')
    // La couleur des prochains fils suit sa pastille ; le fil déjà tracé ne change pas.
    expect(store.currentColor).toBe('#123456')
    expect(store.doc.wires.find((candidate) => candidate.id === wire)?.color).toBe('#ff00aa')
    // Une couleur déjà proposée est refusée.
    store.changeColorChoice('#123456', '#000000')
    expect(store.doc.customColors).toEqual(['#123456'])
    expect(store.status).toContain('déjà dans la palette')
    store.removeColorChoice('#123456')
    expect(store.doc.customColors).toEqual([])
    expect(store.undoLabel).toBe('Supprimer une couleur')
    // La couleur courante n'est plus proposée : la première de la palette la remplace.
    expect(store.currentColor).toBe(store.colorChoices[0]?.hex)
    store.undo()
    expect(store.doc.customColors).toEqual(['#123456'])
  })

  it('ne modifie ni ne supprime une couleur de la palette des fils : c’est l’affaire des paramètres', async () => {
    setBridge(new FakeFs())
    const library = useLibraryStore()
    await library.init()
    const store = useSchematicStore()
    const palette = library.palette.map((color) => ({ ...color }))
    const second = palette[1]
    if (!second) throw new Error('palette attendue')
    const before = store.doc
    store.setCurrentColor(second.hex)
    store.changeColorChoice(second.hex, '#abcdef')
    store.removeColorChoice(second.hex)
    await flushPromises()
    expect(library.palette).toEqual(palette)
    expect(store.doc).toBe(before)
    expect(store.currentColor).toBe(second.hex)
    setBridge(null)
  })

  it('réordonne les onglets sans changer celui qui est affiché', () => {
    const store = useSchematicStore()
    store.setProjectName('A')
    store.newProject()
    store.setProjectName('B')
    store.newProject()
    store.setProjectName('C')
    const names = (): string[] => store.tabs.map((tab) => tab.name)
    const c = store.activeTabId
    store.moveTab(c, 0)
    expect(names()).toEqual(['C', 'A', 'B'])
    expect(store.activeTabId).toBe(c)
    expect(store.doc.name).toBe('C')
    store.moveTab(c, 99)
    expect(names()).toEqual(['A', 'B', 'C'])
  })

  it('donne le nouveau profil général aux montages qui suivaient l’ancien, pas aux autres', () => {
    const store = useSchematicStore()
    const next = { ...DEFAULT_PROFILE, name: 'Cours', wireWidth: 0.2 }
    // Premier onglet : un montage au style propre.
    store.setProfile({ ...DEFAULT_PROFILE, cornerRadius: 0 })
    expect(store.profileDiffs).toEqual(['wires'])
    const custom = store.activeTabId
    // Deuxième onglet : il suit le profil général et a du contenu ; troisième : vierge.
    store.newProject()
    store.setProjectName('Suiveur')
    const follower = store.activeTabId
    store.newProject()

    store.followGeneralProfile(DEFAULT_PROFILE, next)
    // Le montage vierge affiché repart du nouveau profil sans devenir « modifié ».
    expect(store.doc.profile.wireWidth).toBe(0.2)
    expect(store.dirty).toBe(false)
    store.activateTab(follower)
    expect(store.doc.profile.name).toBe('Cours')
    expect(store.undoLabel).toBe('Changer le profil de style')
    store.activateTab(custom)
    expect(store.doc.profile).toMatchObject({ name: 'Standard', cornerRadius: 0 })

    // Aligner un montage sur le profil général efface ses écarts.
    store.adoptGeneralProfile()
    expect(store.followsGeneralProfile).toBe(true)
  })

  it('liste les montages modifiés pour la copie de secours, onglet par onglet', () => {
    const store = useSchematicStore()
    store.setProjectName('A')
    store.addLabel(0, 0)
    const first = store.activeTabId
    store.newProject()
    expect(store.anyDirty).toBe(true)
    expect(store.dirtyDocuments().map((entry) => [entry.key, entry.project.name])).toEqual([
      [first, 'A']
    ])
    // Enregistré : plus rien à sauvegarder pour cet onglet.
    store.activateTab(first)
    store.markSaved('D:/Docs/a.pinout.json')
    expect(store.dirtyDocuments()).toEqual([])
    expect(store.anyDirty).toBe(false)
  })
})

describe('montage : composants derrière les fils, fils à 45°', () => {
  it('pose les composants derrière les fils ; l’ordre les fait passer devant ou derrière', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const first = store.placeAt(2, 3)
    const second = store.placeAt(10, 3)
    store.stopPlacing()
    if (!first || !second) throw new Error('composants attendus')
    // À la pose, un composant est derrière les fils : ceux qu'on trace sur lui restent visibles.
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([true, true])
    // « Premier plan » : devant tout, fils compris.
    store.selection = [first]
    store.reorderInstances('top')
    expect(store.doc.components.map((instance) => [instance.id, instance.behindWires])).toEqual([
      [second, true],
      [first, false]
    ])
    expect(store.undoLabel).toBe('Ordre des composants')
    expect(store.status).toContain('Devant les fils')
    // Déjà tout devant : rien à faire, rien de plus à annuler.
    store.reorderInstances('top')
    store.undo()
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([true, true])
    // La couche s'enregistre avec le montage.
    store.selection = [second]
    store.reorderInstances('top')
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.components.map((instance) => [instance.id, instance.behindWires])).toEqual([
      [first, true],
      [second, false]
    ])
  })

  it('accepte un fil en diagonale à 45° et refuse une autre pente', () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [0, 0],
      [2, 2],
      [6, 2]
    ])
    expect(id).not.toBeNull()
    expect(
      store.addWire([
        [0, 5],
        [4, 7]
      ])
    ).toBeNull()
    // Glisser un sommet garde la pente de la diagonale.
    if (!id) throw new Error('fil attendu')
    store.setWirePoints(id, [
      [0, 1],
      [1, 2],
      [6, 2]
    ])
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 1],
      [1, 2],
      [6, 2]
    ])
  })
})

describe('montage : panneau de propriétés', () => {
  it('montré par un clic sur un élément, il se referme quand plus rien n’est sélectionné', () => {
    const store = useSchematicStore()
    const id = store.addLabel(2, 0)
    store.clearSelection()
    expect(store.inspectorOpen).toBe(false)
    // Ce que fait le canevas au clic sur un élément.
    store.selectedLabels = [id]
    store.revealInspector()
    expect(store.inspectorOpen).toBe(true)
    expect(store.inspectorFloating).toBe(true)
    store.clearSelection()
    expect(store.inspectorOpen).toBe(false)
    // Supprimer l'élément sélectionné le referme aussi.
    store.selectedLabels = [id]
    store.revealInspector()
    store.removeSelection()
    expect(store.inspectorOpen).toBe(false)
  })

  it('ouvert par la touche I, il reste ; décoché dans les paramètres, il ne s’ouvre pas tout seul', () => {
    const store = useSchematicStore()
    const id = store.addLabel(2, 0)
    store.inspectorOpen = true
    expect(store.inspectorFloating).toBe(false)
    store.clearSelection()
    expect(store.inspectorOpen).toBe(true)
    store.inspectorOpen = false
    useLibraryStore().settings = { ...DEFAULT_SETTINGS, autoOpenInspector: false }
    store.selectedLabels = [id]
    store.revealInspector()
    expect(store.inspectorOpen).toBe(false)
  })
})

describe('montage : sommets, coupe et net d’un fil', () => {
  function wireOf(store: ReturnType<typeof useSchematicStore>, points: [number, number][]): string {
    const id = store.addWire(points)
    if (!id) throw new Error('fil attendu')
    return id
  }

  it('ajoute puis retire un sommet ; un coin que rien ne remplace reste', () => {
    const store = useSchematicStore()
    const id = wireOf(store, [
      [0, 0],
      [6, 0]
    ])
    store.addWireVertex(id, [3, 0])
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 0],
      [3, 0],
      [6, 0]
    ])
    expect(store.undoLabel).toBe('Ajouter un sommet')
    store.removeWireVertex(id, 1)
    expect(store.doc.wires[0]?.points).toHaveLength(2)
    expect(store.undoLabel).toBe('Supprimer un sommet')
    const bent = wireOf(store, [
      [0, 4],
      [5, 4],
      [5, 6]
    ])
    store.removeWireVertex(bent, 1)
    expect(store.doc.wires[1]?.points).toHaveLength(3)
    expect(store.undoLabel).toBe('Tracer un fil')
  })

  it('coupe un fil en deux sans rien déplacer : jonction, rang et étiquette suivent le bon morceau', () => {
    const store = useSchematicStore()
    const trunk = wireOf(store, [
      [0, 0],
      [10, 0]
    ])
    const branch = wireOf(store, [
      [8, 0],
      [8, 5]
    ])
    store.setWireEndLabel(trunk, 1, 'VCC')
    const second = store.splitWire(trunk, [4, 0])
    expect(second).not.toBeNull()
    expect(store.doc.wires.map((wire) => [wire.id, wire.points, wire.stack])).toEqual([
      [
        trunk,
        [
          [0, 0],
          [4, 0]
        ],
        0
      ],
      [
        branch,
        [
          [8, 0],
          [8, 5]
        ],
        2
      ],
      [
        second,
        [
          [4, 0],
          [10, 0]
        ],
        1
      ]
    ])
    expect(store.doc.wires[0]?.endLabels).toEqual({ start: '', end: '' })
    expect(store.doc.wires[2]?.endLabels).toEqual({ start: '', end: 'VCC' })
    // Tout reste relié : les deux morceaux se touchent, la branche tient au second.
    const nets = store.connectivity.wireNet
    expect(new Set([nets.get(trunk), nets.get(branch), nets.get(second ?? '')]).size).toBe(1)
    expect(store.undoLabel).toBe('Couper le fil')
    store.undo()
    expect(store.doc.wires).toHaveLength(2)
    // Pas de coupe à une extrémité.
    expect(store.splitWire(trunk, [0, 0])).toBeNull()
  })

  it('sélectionne tout un net, ou un composant avec les fils posés sur ses broches', () => {
    const store = useSchematicStore()
    const a = wireOf(store, [
      [0, 0],
      [5, 0]
    ])
    const b = wireOf(store, [
      [5, 0],
      [5, 4]
    ])
    wireOf(store, [
      [0, 9],
      [4, 9]
    ])
    store.selectNet(a)
    expect(store.selectedWires).toEqual([a, b])
    // Résistance en (10, 3) : broches en (10, 4) et (14, 4).
    store.startPlacing(resistor())
    const instance = store.placeAt(10, 3)
    store.stopPlacing()
    if (!instance) throw new Error('composant attendu')
    const lead = wireOf(store, [
      [14, 4],
      [18, 4]
    ])
    store.selectConnectedWires(instance)
    expect(store.selection).toEqual([instance])
    expect(store.selectedWires).toEqual([lead])
  })

  it('sait s’il y a un croisement près d’un point', () => {
    const store = useSchematicStore()
    wireOf(store, [
      [0, 5],
      [10, 5]
    ])
    wireOf(store, [
      [5, 0],
      [5, 10]
    ])
    expect(store.crossingNear(5.2, 4.9)).toBe(true)
    expect(store.crossingNear(8, 5)).toBe(false)
  })
})

describe('montage : groupes', () => {
  it('groupe composant, fil et étiquette ; le groupe se prend d’un bloc et s’annule', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0)
    const b = store.placeAt(10, 0)
    store.stopPlacing()
    const wire = store.addWire([
      [4, 1],
      [10, 1]
    ])
    const label = store.addLabelBox({ x: 0, y: 4, w: 4, h: 1 })
    if (!a || !b || !wire) throw new Error('montage incomplet')
    store.clearSelection()
    expect(store.hasGroups).toBe(false)
    store.selection = [a]
    store.selectedWires = [wire]
    store.selectedLabels = [label]
    expect(store.canGroup).toBe(true)
    store.groupSelection()
    expect(store.undoLabel).toBe('Grouper')
    expect(store.groups).toEqual([
      { id: 'g1', members: { instance: [a], wire: [wire], label: [label] } }
    ])
    expect(store.canGroup).toBe(false)

    // Un clic sur un membre : tout le groupe.
    store.clearSelection()
    store.selection = [a]
    store.syncGroupSelection('instance', a)
    expect([store.selection, store.selectedWires, store.selectedLabels]).toEqual([
      [a],
      [wire],
      [label]
    ])

    // Un lasso sur l'autre résistance et le fil : le groupe vient en entier ; grouper fond le tout.
    store.clearSelection()
    store.selection = [b]
    store.selectedWires = [wire]
    store.expandSelectionToGroups()
    expect(store.selection).toEqual([b, a])
    expect(store.selectedLabels).toEqual([label])
    store.groupSelection()
    expect(store.groups).toEqual([
      { id: 'g2', members: { instance: [a, b], wire: [wire], label: [label] } }
    ])

    store.ungroupSelection()
    expect(store.undoLabel).toBe('Dégrouper')
    expect(store.hasGroups).toBe(false)
    store.undo()
    expect(store.groups.map((group) => group.id)).toEqual(['g2'])
    store.undo()
    expect(store.groups.map((group) => group.id)).toEqual(['g1'])
    // Le fichier garde les groupes.
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.components.map((instance) => instance.group)).toEqual(['g1', undefined])
    expect(reread.wires[0]?.group).toBe('g1')
    store.undo()
    expect(store.hasGroups).toBe(false)
  })

  it('la copie d’un groupe forme un nouveau groupe ; un morceau de fil coupé reste dans le sien', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0)
    store.stopPlacing()
    const wire = store.addWire([
      [4, 1],
      [10, 1]
    ])
    if (!a || !wire) throw new Error('montage incomplet')
    store.clearSelection()
    store.selection = [a]
    store.selectedWires = [wire]
    store.groupSelection()

    store.duplicateSelection()
    expect(store.groups.map((group) => group.id)).toEqual(['g1', 'g2'])
    // Les copies sont sélectionnées : c'est le nouveau groupe, pas celui des originaux.
    expect(store.groups[1]?.members.instance).toEqual(store.selection)
    expect(store.groups[1]?.members.wire).toEqual(store.selectedWires)
    expect(store.groups[0]?.members).toEqual({ instance: [a], wire: [wire], label: [] })

    // Un seul membre copié : sa copie n'est d'aucun groupe.
    store.clearSelection()
    store.selection = [a]
    store.duplicateSelection()
    expect(store.doc.components.at(-1)?.group).toBeUndefined()

    const second = store.splitWire(wire, [7, 1])
    expect(store.doc.wires.find((candidate) => candidate.id === second)?.group).toBe('g1')
    expect(store.groups[0]?.members.wire).toHaveLength(2)
  })
})

describe('montage : cases d’affichage', () => {
  it('lit et écrit broches, non reliées et groupes dans les paramètres de l’application', () => {
    const store = useSchematicStore()
    const library = useLibraryStore()
    expect([store.showPins, store.showUnconnected, store.showGroups]).toEqual([true, true, true])
    store.showPins = false
    store.showGroups = false
    expect([library.showPins, library.showUnconnected, library.showGroups]).toEqual([
      false,
      true,
      false
    ])
    library.setViewOption('showUnconnected', false)
    expect(store.showUnconnected).toBe(false)
  })
})

describe('montage : sommets au Ctrl+clic, fil raccordé', () => {
  it('ajoute un sommet sur une partie droite, retire un coin quand ses voisins se rejoignent', () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [0, 0],
      [6, 0],
      [6, 4]
    ])
    if (!id) throw new Error('fil refusé')
    expect(store.toggleWireVertex(id, { x: 3.2, y: 0.2 })).toBe(true)
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 0],
      [3, 0],
      [6, 0],
      [6, 4]
    ])
    expect(store.toggleWireVertex(id, { x: 3, y: 0 })).toBe(true)
    expect(store.doc.wires[0]?.points).toHaveLength(3)
    // Le coude : ses voisins ne s'alignent ni tout droit ni à 45°.
    expect(store.toggleWireVertex(id, { x: 6, y: 0 })).toBe(false)
    expect(store.status).toContain('ne se retire pas')
    expect(store.toggleWireVertex(id, { x: 0, y: 0 })).toBe(false)
  })

  it('démarre un fil sur un autre : l’outil Fil prend la main au point donné', () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [0, 0],
      [6, 0]
    ])
    store.selectedWires = id ? [id] : []
    store.startWireFrom([3, 0])
    expect(store.tool).toBe('wire')
    expect(store.hasSelection).toBe(false)
    expect(store.drawing?.points).toEqual([[3, 0]])
    store.appendWirePoints([[3, 5]])
    store.finishWire()
    expect(store.doc.wires).toHaveLength(2)
    expect(store.connectivity.junctions.map((junction) => junction.point)).toEqual([[3, 0]])
  })
})

describe('montage : variantes d’un composant', () => {
  /** Résistance (broches en (0, 1) et (4, 1)) avec une variante longue (broche 2 en (6, 1)). */
  function withVariant(): ComponentDefinition {
    const def = resistor()
    def.variants = [
      {
        id: 'v1',
        name: 'Longue',
        size: { widthCells: 6, heightCells: 2 },
        visual: { kind: 'drawing', primitives: [] },
        pins: [
          { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
          { id: 'b', name: '2', kind: 'io', x: 6, y: 1 }
        ]
      }
    ]
    return def
  }

  it('pose un composant dans la variante choisie', () => {
    const store = useSchematicStore()
    store.startPlacing(withVariant(), 'v1')
    expect(store.status).toContain('Résistance (Longue)')
    const long = store.placeAt(0, 0)
    store.startPlacing(withVariant())
    const standard = store.placeAt(0, 10)
    store.stopPlacing()
    expect(store.doc.components.map((instance) => [instance.id, instance.variant])).toEqual([
      [long, 'v1'],
      [standard, undefined]
    ])
    expect(store.placed.map((item) => item.def.size.widthCells)).toEqual([6, 4])
    // Une seule définition embarquée, variantes comprises ; le fichier garde le choix.
    expect(Object.keys(store.doc.embeddedDefs)).toEqual(['resistor'])
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.components[0]?.variant).toBe('v1')
  })

  it('change la variante d’un composant posé : le fil posé sur sa broche suit', () => {
    const store = useSchematicStore()
    store.startPlacing(withVariant())
    const id = store.placeAt(0, 0)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    // Un fil part de la broche 2, en (4, 1).
    store.addWire([
      [4, 1],
      [10, 1]
    ])
    store.setInstancesVariant([id], 'v1')
    expect(store.undoLabel).toBe('Changer de variante')
    expect(store.doc.components[0]?.variant).toBe('v1')
    expect(store.doc.wires[0]?.points[0]).toEqual([6, 1])
    expect(store.connectivity.unconnectedPinKeys.has(`${id}:b`)).toBe(false)
    // Retour à la première : la propriété disparaît, le fil revient.
    store.setInstancesVariant([id], 'base')
    expect('variant' in (store.doc.components[0] ?? {})).toBe(false)
    expect(store.doc.wires[0]?.points[0]).toEqual([4, 1])
    // Déjà dans cette variante : rien à annuler de plus.
    store.setInstancesVariant([id], 'base')
    expect(store.undoLabel).toBe('Changer de variante')
    store.undo()
    expect(store.doc.components[0]?.variant).toBe('v1')
  })
})

describe('montage : aperçu d’un composant de la bibliothèque', () => {
  it('ne voit pas un composant « à mettre à jour » quand seul son aperçu a changé', async () => {
    const fs = new FakeFs()
    setBridge(fs)
    const library = useLibraryStore()
    await library.init()
    const def = resistor()
    def.variants = [
      { id: 'v1', name: 'Longue', size: def.size, visual: def.visual, pins: def.pins }
    ]
    await saveComponent(library.libraryDir, def)
    await library.refresh()
    const store = useSchematicStore()
    store.startPlacing(def)
    store.placeAt(0, 0)
    store.stopPlacing()
    expect(store.newerLibraryDefinition('resistor')).toBeNull()
    // Réenregistré en regardant l'autre variante : seul l'aperçu change.
    await saveComponent(library.libraryDir, withPreviewVariant(def, 'v1'))
    await library.refresh()
    expect(store.newerLibraryDefinition('resistor')).toBeNull()
    expect(store.staleDefIds.size).toBe(0)
    // Un vrai changement, lui, se voit.
    await saveComponent(library.libraryDir, { ...def, description: 'Revue' })
    await library.refresh()
    expect(store.newerLibraryDefinition('resistor')).not.toBeNull()
    setBridge(null)
  })
})

describe('montage : ordre des composants entre eux', () => {
  it('pose le dernier composant au-dessus ; Ctrl+Page le range parmi les autres', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0)
    const b = store.placeAt(1, 0)
    const c = store.placeAt(2, 0)
    store.stopPlacing()
    if (!a || !b || !c) throw new Error('composants attendus')
    const order = (): string[] => store.doc.components.map((instance) => instance.id)
    // Dans l'ordre de la pose : le dernier est dessiné au-dessus des autres.
    expect(order()).toEqual([a, b, c])

    store.selection = [a]
    store.restackSelection('up')
    expect(store.undoLabel).toBe('Ordre des composants')
    expect(order()).toEqual([b, a, c])
    store.restackSelection('top')
    expect(order()).toEqual([b, c, a])
    // Déjà tout devant : rien à faire, rien de plus à annuler.
    store.restackSelection('top')
    store.restackSelection('bottom')
    expect(order()).toEqual([a, b, c])
    store.selection = [c]
    store.reorderInstances('down')
    expect(order()).toEqual([a, c, b])
    store.undo()
    expect(order()).toEqual([a, b, c])
    // Revenus à l'arrière-plan, ils sont tous derrière les fils.
    expect(store.doc.components.every((instance) => instance.behindWires)).toBe(true)
  })

  it('les fils tiennent une place dans la pile : avancer ou reculer les fait passer', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0)
    const b = store.placeAt(1, 0)
    const c = store.placeAt(2, 0)
    store.stopPlacing()
    if (!a || !b || !c) throw new Error('composants attendus')
    /** La pile, du dessous au dessus : les composants derrière les fils, les fils, les autres. */
    const stack = (): string[] => {
      const list = store.doc.components
      return [
        ...list.filter((instance) => instance.behindWires).map((instance) => instance.id),
        'fils',
        ...list.filter((instance) => !instance.behindWires).map((instance) => instance.id)
      ]
    }
    expect(stack()).toEqual([a, b, c, 'fils'])
    // Le plus haut de derrière avance : il passe devant les fils.
    store.selection = [c]
    store.reorderInstances('up')
    expect(stack()).toEqual([a, b, 'fils', c])
    expect(store.status).toContain('Devant les fils')
    // Seul devant, il n'a plus personne à dépasser.
    const before = store.doc
    store.reorderInstances('up')
    expect(store.doc).toBe(before)
    // Un autre le rejoint, puis le dépasse.
    store.selection = [b]
    store.reorderInstances('up')
    expect(stack()).toEqual([a, 'fils', b, c])
    store.reorderInstances('up')
    expect(stack()).toEqual([a, 'fils', c, b])
    // Reculer : d'abord parmi ceux de devant, puis derrière les fils, puis parmi ceux de derrière.
    store.reorderInstances('down')
    store.reorderInstances('down')
    expect(stack()).toEqual([a, b, 'fils', c])
    expect(store.status).toContain('Derrière les fils')
    store.reorderInstances('down')
    expect(stack()).toEqual([b, a, 'fils', c])
    // « Arrière-plan » : derrière tout, d'où qu'on vienne.
    store.selection = [c]
    store.reorderInstances('bottom')
    expect(stack()).toEqual([c, b, a, 'fils'])
    // Deux composants avancent ensemble, et passent les fils ensemble.
    store.selection = [b, a]
    store.reorderInstances('up')
    expect(stack()).toEqual([c, 'fils', b, a])
    // Une seule annulation remet l'ordre et la couche.
    store.undo()
    expect(stack()).toEqual([c, b, a, 'fils'])
  })

  it('avance les fils et les composants sélectionnés ensemble, chacun parmi les siens', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const a = store.placeAt(0, 0)
    const b = store.placeAt(10, 0)
    store.stopPlacing()
    const first = store.addWire([
      [0, 6],
      [4, 6]
    ])
    const second = store.addWire([
      [0, 8],
      [4, 8]
    ])
    if (!a || !b || !first || !second) throw new Error('éléments attendus')
    store.selection = [a]
    store.selectedWires = [first]
    store.restackSelection('top')
    expect(store.doc.components.map((instance) => instance.id)).toEqual([b, a])
    expect(store.sortedWires.map((wire) => wire.id)).toEqual([second, first])
  })
})

describe('montage : styles propres à une sélection', () => {
  /** Un profil enregistré qui s'écarte du Standard : fils épais, libellés deux fois plus grands. */
  const THICK = {
    ...DEFAULT_PROFILE,
    name: 'Épais',
    cellPx: 40,
    wireWidth: 0.3,
    componentStroke: 0.2,
    labelFont: { family: 'Consolas', size: 22 }
  }

  /** Un composant, deux fils et une étiquette, tous au style du montage. */
  function sample(): {
    store: ReturnType<typeof useSchematicStore>
    part: string
    first: string
    second: string
    text: string
  } {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const part = store.placeAt(0, 0)
    store.stopPlacing()
    const first = store.addWire([
      [0, 6],
      [8, 6]
    ])
    const second = store.addWire([
      [0, 8],
      [8, 8]
    ])
    const text = store.addLabelBox({ x: 0, y: 10, w: 4, h: 1 })
    if (!part || !first || !second) throw new Error('éléments attendus')
    store.clearSelection()
    return { store, part, first, second, text }
  }

  it('donne un profil à la sélection, sans toucher au reste ni à la cellule du montage', () => {
    const { store, part, first, second, text } = sample()
    store.selection = [part]
    store.selectedWires = [first]
    store.selectedLabels = [text]
    store.setSelectionStyle(THICK)
    expect(store.undoLabel).toBe('Style « Épais »')
    // Le montage garde une copie fidèle du profil, sous son nom.
    expect(store.doc.styles).toEqual([THICK])
    expect(store.doc.components[0]?.style).toBe('Épais')
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', undefined])
    // L'étiquette était ×1 des libellés du montage (11) : elle reste ×1, des libellés du profil.
    expect(store.doc.labels[0]).toMatchObject({ style: 'Épais', size: 22 })
    // Au dessin : chacun son style, sur la grille du montage.
    const wires = store.doc.wires
    expect(wires.map((wire) => store.styleFor(wire).wireWidth)).toEqual([0.3, 0.15])
    expect(wires.map((wire) => store.styleFor(wire).cellPx)).toEqual([20, 20])
    expect(store.doc.profile).toEqual(DEFAULT_PROFILE)
    expect(store.selectionStyles).toEqual(['Épais'])
    expect(store.styleUsage).toEqual([{ name: 'Épais', count: 3 }])
    // Le fichier garde le tout.
    expect(parseProject(serializeProject(store.doc)).styles).toEqual([THICK])
    store.selectedWires = [first, second]
    expect(store.selectionStyles).toEqual(['Épais', null])
    // Une seule commande : tout revient d'un coup.
    store.undo()
    expect(store.doc.styles).toEqual([])
    expect(store.doc.labels[0]?.size).toBe(11)
    expect(store.doc.wires.every((wire) => wire.style === undefined)).toBe(true)
  })

  it('rend la sélection au style du montage, et oublie un style que plus rien ne porte', () => {
    const { store, first, second, text } = sample()
    store.selectedWires = [first, second]
    store.selectedLabels = [text]
    store.setSelectionStyle(THICK)
    store.selectedWires = [first]
    store.selectedLabels = [text]
    store.setSelectionStyle(null)
    expect(store.undoLabel).toBe('Style du montage')
    expect(store.doc.wires.map((wire) => wire.style)).toEqual([undefined, 'Épais'])
    expect(store.doc.labels[0]?.size).toBe(11)
    expect('style' in (store.doc.labels[0] ?? {})).toBe(false)
    expect(store.doc.styles).toHaveLength(1)
    // Supprimer le dernier fil qui le portait retire le style du montage ; annuler le ramène.
    store.removeWires([second])
    expect(store.doc.styles).toEqual([])
    store.undo()
    expect(store.doc.styles.map((style) => style.name)).toEqual(['Épais'])
  })

  it('propose les profils enregistrés, sauf celui qui est déjà le style du montage', () => {
    const { store, first } = sample()
    const library = useLibraryStore()
    const fine = { ...DEFAULT_PROFILE, name: 'Fin', wireWidth: 0.08 }
    library.savedProfiles = [THICK, fine, { ...DEFAULT_PROFILE, cellPx: 30 }]
    // « Standard » enregistré ne diffère du montage que par la cellule : c'est le même style.
    expect(store.styleChoices.map((choice) => choice.name)).toEqual(['Épais', 'Fin'])
    // Un style que le montage porte sans profil enregistré de ce nom reste proposé.
    store.selectedWires = [first]
    store.setSelectionStyle({ ...THICK, name: 'Ailleurs' })
    expect(store.styleChoices.map((choice) => choice.name)).toEqual(['Ailleurs', 'Épais', 'Fin'])
    store.clearSelection()
    store.selectStyled('Ailleurs')
    expect([store.selection, store.selectedWires, store.selectedLabels]).toEqual([[], [first], []])
  })

  it('suit un profil enregistré qui a changé, pour tous les éléments qui le portent', () => {
    const { store, first, second, text } = sample()
    const library = useLibraryStore()
    library.savedProfiles = [THICK]
    store.selectedWires = [first, second]
    store.selectedLabels = [text]
    store.setSelectionStyle(THICK)
    expect(store.newerSavedStyle('Épais')).toBeNull()
    // Le profil change dans la bibliothèque : le montage garde sa copie, et le signale.
    const thicker = { ...THICK, wireWidth: 0.4, labelFont: { family: 'Consolas', size: 33 } }
    library.savedProfiles = [thicker]
    expect(store.styleFor(store.doc.wires[0] ?? {}).wireWidth).toBe(0.3)
    expect(store.newerSavedStyle('Épais')).toEqual(thicker)
    store.updateStyle(thicker)
    expect(store.undoLabel).toBe('Mettre à jour le style « Épais »')
    expect(store.doc.wires.map((wire) => store.styleFor(wire).wireWidth)).toEqual([0.4, 0.4])
    expect(store.doc.labels[0]?.size).toBe(33)
    expect(store.newerSavedStyle('Épais')).toBeNull()
    // Le redonner à un seul élément après un autre changement vaut aussi pour les autres.
    library.savedProfiles = [THICK]
    store.selectedWires = [first]
    store.selectedLabels = []
    store.setSelectionStyle(THICK)
    expect(store.doc.styles).toEqual([THICK])
    expect(store.doc.wires.map((wire) => store.styleFor(wire).wireWidth)).toEqual([0.3, 0.3])
    expect(store.doc.labels[0]?.size).toBe(22)
  })

  it('garde le style des copies, des morceaux d’un fil coupé, et l’emmène dans un autre montage', () => {
    const { store, first, text } = sample()
    store.selectedWires = [first]
    store.selectedLabels = [text]
    store.setSelectionStyle(THICK)
    store.splitWire(first, [4, 6])
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', undefined, 'Épais'])
    store.selectedLabels = []
    store.selectedWires = [first]
    store.duplicateSelection()
    expect(store.doc.wires.at(-1)?.style).toBe('Épais')
    store.copySelection()
    // Dans un montage qui n'a pas ce style : il arrive avec la copie.
    store.newProject()
    expect(store.doc.styles).toEqual([])
    store.pasteClipboard()
    expect(store.doc.styles).toEqual([THICK])
    expect(store.doc.wires[0]?.style).toBe('Épais')
    // Dans un montage qui a déjà un style de ce nom : c'est le sien que la copie prend.
    store.newProject()
    const lead = store.addWire([
      [0, 0],
      [4, 0]
    ])
    store.selectedWires = lead ? [lead] : []
    store.setSelectionStyle({ ...THICK, wireWidth: 0.5 })
    store.pasteClipboard()
    expect(store.doc.styles.map((style) => style.wireWidth)).toEqual([0.5])
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', 'Épais'])
  })

  it('montre l’aperçu du style du montage sans changer les styles propres', () => {
    const { store, first } = sample()
    store.selectedWires = [first]
    store.setSelectionStyle(THICK)
    store.profilePreview = { ...DEFAULT_PROFILE, cellPx: 30, wireWidth: 0.2 }
    const [styled, plain] = store.doc.wires
    if (!styled || !plain) throw new Error('fils attendus')
    expect(store.styleFor(plain).wireWidth).toBe(0.2)
    expect(store.styleFor(styled)).toMatchObject({ wireWidth: 0.3, cellPx: 30 })
  })
})

/**
 * Un connecteur extensible, un contact par cellule : 2 × 2 cellules, sa broche au milieu, et une
 * broche de repère après le motif, qui suit la fin quand il s'allonge.
 */
function header(initial = 3): ComponentDefinition {
  const def = createEmptyComponent('dupont', 'Dupont')
  def.size = { widthCells: 2, heightCells: 2 }
  def.pins = [
    { id: 'p1', name: '1', kind: 'io', x: 1, y: 1 },
    { id: 'fin', name: 'F', kind: 'io', x: 2, y: 1 }
  ]
  def.stretch = { from: 2, to: 6, initial, min: 1, max: 8 }
  return def
}

describe('montage : composants extensibles', () => {
  it('se pose à son nombre de départ, avec ses broches recopiées', () => {
    const store = useSchematicStore()
    store.startPlacing(header())
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    // Le nombre est écrit dans l'exemplaire : il ne changera pas avec la définition.
    expect(store.doc.components[0]).toMatchObject({ id, x: 10, y: 10, count: 3 })
    expect(store.placed[0]?.def.size).toEqual({ widthCells: 4, heightCells: 2 })
    // Trois contacts, puis la broche de repère au bout.
    expect(store.pinRefs.map((pin) => [pin.pinId, ...pin.point])).toEqual([
      ['p1', 11, 11],
      ['p1#1', 12, 11],
      ['p1#2', 13, 11],
      ['fin', 14, 11]
    ])
    // Un composant ordinaire ne reçoit pas de nombre.
    store.startPlacing(resistor())
    store.placeAt(0, 0)
    store.stopPlacing()
    expect(store.doc.components[1]?.count).toBeUndefined()
  })

  it('s’étire par la fin : le début reste, la broche du bout emmène son fil', () => {
    const store = useSchematicStore()
    store.startPlacing(header())
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    const onThird = store.addWire([
      [13, 11],
      [13, 16]
    ])
    const onEnd = store.addWire([
      [14, 11],
      [14, 16]
    ])
    if (!onThird || !onEnd) throw new Error('fils refusés')
    const points = (wire: string): unknown =>
      store.doc.wires.find((candidate) => candidate.id === wire)?.points

    expect(store.setInstanceCount(id, 5)).toBe(true)
    expect(store.doc.components[0]).toMatchObject({ x: 10, y: 10, count: 5 })
    expect(store.undoLabel).toBe('Étirer le composant')
    // Le fil du troisième contact ne bouge pas ; celui du bout suit sa broche, deux cellules plus loin.
    expect(points(onThird)).toEqual([
      [13, 11],
      [13, 16]
    ])
    expect(points(onEnd)).toEqual([
      [16, 11],
      [16, 16],
      [14, 16]
    ])
    // Une seule annulation remet tout.
    store.undo()
    expect(store.doc.components[0]?.count).toBe(3)
    expect(points(onEnd)).toEqual([
      [14, 11],
      [14, 16]
    ])
    // Raccourci à un seul contact : le troisième disparaît, son fil reste là, bout libre.
    expect(store.setInstanceCount(id, 1)).toBe(true)
    expect(points(onThird)).toEqual([
      [13, 11],
      [13, 16]
    ])
    expect(store.connectivity.freeEnds.some((end) => end.wireId === onThird)).toBe(true)
    // Le fil du bout a suivi sa broche, revenue en (12, 11).
    expect(points(onEnd)).toEqual([
      [12, 11],
      [12, 16],
      [14, 16]
    ])
  })

  it('s’étire par le début : la fin reste en place, et les fils avec elle', () => {
    const store = useSchematicStore()
    store.startPlacing(header())
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    const wire = store.addWire([
      [11, 11],
      [11, 16]
    ])
    expect(store.setInstanceCount(id, 5, 'end')).toBe(true)
    // Deux contacts de plus du côté du début : le composant part de deux cellules plus à gauche.
    expect(store.doc.components[0]).toMatchObject({ x: 8, y: 10, count: 5 })
    expect(store.pinRefs.map((pin) => pin.point[0])).toEqual([9, 10, 11, 12, 13, 14])
    expect(store.doc.wires.find((candidate) => candidate.id === wire)?.points).toEqual([
      [11, 11],
      [11, 16]
    ])
  })

  it('ne dépasse pas ses bornes, et ne fait rien pour un composant ordinaire', () => {
    const store = useSchematicStore()
    store.startPlacing(header())
    const id = store.placeAt(10, 10)
    store.startPlacing(resistor())
    const plain = store.placeAt(0, 0)
    store.stopPlacing()
    if (!id || !plain) throw new Error('pose refusée')
    expect(store.setInstanceCount(id, 99)).toBe(true)
    expect(store.doc.components[0]?.count).toBe(8)
    const before = store.doc
    // Déjà au maximum, déjà à ce nombre, ou pas extensible : aucune commande.
    expect(store.setInstanceCount(id, 99)).toBe(false)
    expect(store.setInstanceCount(id, 8)).toBe(false)
    expect(store.setInstanceCount(plain, 4)).toBe(false)
    expect(store.doc).toBe(before)
    expect(store.setInstanceCount(id, 0)).toBe(true)
    expect(store.doc.components[0]?.count).toBe(1)
    // Le montage se rouvre avec ses nombres.
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.components[0]?.count).toBe(1)
  })

  it('prend le modèle particulier d’un nombre : étirer passe d’un dessin à l’autre', () => {
    const store = useSchematicStore()
    const def = header(1)
    // À un seul contact, une pièce à part : trois cellules de large, deux broches.
    def.stretch = {
      from: 2,
      to: 6,
      initial: 1,
      min: 1,
      max: 8,
      models: [
        {
          count: 1,
          size: { widthCells: 3, heightCells: 2 },
          visual: { kind: 'drawing', primitives: [] },
          pins: [
            { id: 'seul', name: '1', kind: 'io', x: 1, y: 1 },
            { id: 'bout', name: 'F', kind: 'io', x: 3, y: 1 }
          ]
        }
      ]
    }
    store.startPlacing(def)
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    // Posé à un : c'est le modèle qui se dessine, sans qu'on l'ait choisi.
    expect(store.doc.components[0]).toMatchObject({ count: 1 })
    expect(store.placed[0]?.def.size.widthCells).toBe(3)
    expect(store.pinRefs.map((pin) => [pin.pinId, ...pin.point])).toEqual([
      ['seul', 11, 11],
      ['bout', 13, 11]
    ])
    const wire = store.addWire([
      [11, 11],
      [11, 16]
    ])
    // Étiré à deux : le motif répété reprend, avec ses broches à lui.
    expect(store.setInstanceCount(id, 2)).toBe(true)
    expect(store.pinRefs.map((pin) => [pin.pinId, ...pin.point])).toEqual([
      ['p1', 11, 11],
      ['p1#1', 12, 11],
      ['fin', 13, 11]
    ])
    // Le fil de la première broche reste sur la première.
    expect(store.doc.wires.find((candidate) => candidate.id === wire)?.points).toEqual([
      [11, 11],
      [11, 16]
    ])
    expect(store.connectivity.freeEnds.filter((end) => end.wireId === wire)).toHaveLength(1)
    // Et retour à un : le modèle revient.
    expect(store.setInstanceCount(id, 1)).toBe(true)
    expect(store.placed[0]?.def.pins.map((pin) => pin.id)).toEqual(['seul', 'bout'])
  })

  it('s’étire en hauteur quand ses traits sont horizontaux', () => {
    const store = useSchematicStore()
    const def = header()
    // Les deux broches sont dans le motif (la deuxième cellule du haut) : elles descendent ensemble.
    def.stretch = { axis: 'y', from: 2, to: 6, initial: 3, min: 1, max: 8 }
    store.startPlacing(def)
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    expect(store.placed[0]?.def.size).toEqual({ widthCells: 2, heightCells: 4 })
    expect(store.pinRefs.map((pin) => [pin.pinId, ...pin.point])).toEqual([
      ['p1', 11, 11],
      ['fin', 12, 11],
      ['p1#1', 11, 12],
      ['fin#1', 12, 12],
      ['p1#2', 11, 13],
      ['fin#2', 12, 13]
    ])
    const wire = store.addWire([
      [11, 13],
      [11, 18]
    ])
    // Par le début (le haut) : le bas reste en place, le composant remonte de deux cellules.
    expect(store.setInstanceCount(id, 5, 'end')).toBe(true)
    expect(store.doc.components[0]).toMatchObject({ x: 10, y: 8, count: 5 })
    expect(store.doc.wires.find((candidate) => candidate.id === wire)?.points).toEqual([
      [11, 13],
      [11, 18]
    ])
    // Par la fin : le haut reste, et le fil de la dernière broche la suit vers le bas.
    expect(store.setInstanceCount(id, 6)).toBe(true)
    expect(store.doc.components[0]).toMatchObject({ x: 10, y: 8, count: 6 })
    expect(store.placed[0]?.def.size).toEqual({ widthCells: 2, heightCells: 7 })
  })

  it('donne sa propre valeur à chaque copie d’un texte variable du motif', () => {
    const store = useSchematicStore()
    const def = header(2)
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'text',
          x: 2,
          y: 0,
          w: 4,
          h: 2,
          text: 'Nom',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: true,
          defaultValue: '',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false,
          vertical: false
        }
      ]
    }
    store.startPlacing(def)
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    const placed = store.placed[0]
    if (!id || !placed) throw new Error('pose refusée')
    // Deux motifs : deux champs, chacun avec son entrée.
    expect(componentFields(placed.def).map((field) => field.name)).toEqual(['Nom', 'Nom 2'])
    store.setInstanceField(id, 'Nom', 'A')
    store.setInstanceField(id, 'Nom 2', 'B')
    // Un motif de plus à la fin : les valeurs ne bougent pas, la nouvelle copie attend la sienne.
    store.setInstanceCount(id, 3)
    expect(store.doc.components[0]?.fields).toEqual({ Nom: 'A', 'Nom 2': 'B' })
    expect(componentFields(store.placed[0]?.def ?? def).map((field) => field.name)).toEqual([
      'Nom',
      'Nom 2',
      'Nom 3'
    ])
    // Un motif de plus au début : chaque valeur suit son motif.
    store.setInstanceCount(id, 4, 'end')
    expect(store.doc.components[0]?.fields).toEqual({ 'Nom 2': 'A', 'Nom 3': 'B' })
    // Une seule annulation remet le nombre et les valeurs.
    store.undo()
    expect(store.doc.components[0]).toMatchObject({ count: 3, fields: { Nom: 'A', 'Nom 2': 'B' } })
  })
})

describe('montage : plaque à trous', () => {
  /** Une plaque de 6 × 4 cellules, avec sa grille de trous. */
  function board(): ComponentDefinition {
    const def = createEmptyComponent('plaque', 'Plaque')
    def.size = { widthCells: 6, heightCells: 4 }
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'holes', x: 4, y: 4, w: 16, h: 8, color: '#d5dbe0' }]
    }
    return def
  }

  it('se pose sous les composants déjà là : ils vont dessus', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const first = store.placeAt(2, 2)
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    store.startPlacing(resistor())
    const last = store.placeAt(2, 4)
    store.stopPlacing()
    // Le dernier de la liste est dessiné au-dessus : la plaque est la première, donc dessous.
    expect(store.doc.components.map((instance) => instance.id)).toEqual([plate, first, last])
    expect(store.doc.components.every((instance) => instance.behindWires)).toBe(true)
  })

  /** Une LED à deux pattes, à deux trous d'écart. */
  function led(): ComponentDefinition {
    const def = createEmptyComponent('led', 'LED')
    def.size = { widthCells: 2, heightCells: 2 }
    def.pins = [
      { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
      { id: 'k', name: '2', kind: 'io', x: 2, y: 1 }
    ]
    return def
  }

  /**
   * La plaque en (0, 0), qui montre son dessous de x = 8 à 14 (x + x' = 14 d'une face à
   * l'autre) ; une LED enfichée en (1, 2) et (3, 2), dont les pattes ressortent en (13, 2) et
   * (11, 2) ; un fil soudé dessous de l'une à l'autre.
   */
  function soldered(): {
    store: ReturnType<typeof useSchematicStore>
    plate: string
    part: string
    wire: string
  } {
    const store = useSchematicStore()
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    store.startPlacing(led())
    const part = store.placeAt(1, 1)
    store.stopPlacing()
    if (!plate || !part) throw new Error('pose refusée')
    store.setInstanceUnderside(plate, true)
    const wire = store.addWire([
      [13, 2],
      [13, 3],
      [11, 3],
      [11, 2]
    ])
    if (!wire) throw new Error('fil refusé')
    store.clearSelection()
    return { store, plate, part, wire }
  }

  it('montre son dessous à la demande : les pattes enfichées dessus s’y soudent', () => {
    const store = useSchematicStore()
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    store.startPlacing(led())
    store.placeAt(1, 1)
    store.stopPlacing()
    if (!plate) throw new Error('pose refusée')
    expect(store.faces.boards).toEqual([])
    expect(store.pinRefs).toHaveLength(2)
    store.setInstanceUnderside(plate, true)
    expect(store.status).toContain('Dessous')
    expect(store.doc.components[0]?.underside).toBe(true)
    expect(store.faces.boards.map((face) => face.bottom)).toEqual([
      { x: 8, y: 0, width: 6, height: 4 }
    ])
    // Chaque patte est là deux fois : dessus, et là où elle ressort dessous.
    expect(store.pinRefs.map((pin) => pin.point)).toEqual([
      [1, 2],
      [3, 2],
      [13, 2],
      [11, 2]
    ])
    expect(store.throughs.map((mark) => mark.point)).toEqual([
      [13, 2],
      [11, 2]
    ])
    // Le montrer une seconde fois ne fait rien ; une annulation le retire.
    store.setInstanceUnderside(plate, true)
    store.undo()
    expect(store.doc.components[0]?.underside).toBeUndefined()
    expect(store.pinRefs).toHaveLength(2)
  })

  it('un fil soudé dessous relie les pattes enfichées dessus', () => {
    const { store } = soldered()
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
    expect(store.connectivity.freeEnds).toEqual([])
    // Une patte qui change de trou emmène le bout du fil, en sens inverse vu de dessous.
    const part = store.doc.components[1]?.id
    if (!part) throw new Error('LED absente')
    store.moveInstances([part], 1, 0)
    expect(store.doc.wires[0]?.points.at(0)).toEqual([12, 2])
    expect(store.doc.wires[0]?.points.at(-1)).toEqual([10, 2])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
  })

  it('écartée de son pli, la plaque et son dessous s’en éloignent autant ; ce qu’ils portent suit', () => {
    const { store, plate } = soldered()
    // Trois cellules vers la gauche, une vers le bas : le pli reste en x = 7.
    expect(store.spreadBoardFaces(plate, -3, 1)).toBe(true)
    expect(store.status).toContain('8 cellules')
    expect(store.doc.components.map((instance) => [instance.x, instance.y])).toEqual([
      [-3, 1],
      [-2, 2]
    ])
    expect(store.doc.components[0]?.facesGap).toBe(8)
    expect(store.faces.boards[0]).toMatchObject({ bottom: { x: 11, y: 1 }, flip: 14 })
    // Le fil du dessous est allé de trois cellules à droite ; il relie toujours les deux pattes.
    expect(store.doc.wires[0]?.points).toEqual([
      [16, 3],
      [16, 4],
      [14, 4],
      [14, 3]
    ])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
    // Vers le pli : pas plus près que l'écart d'origine, qui ne s'enregistre pas.
    expect(store.spreadBoardFaces(plate, 5, 0)).toBe(true)
    expect(store.doc.components[0]).toMatchObject({ x: 0, y: 1 })
    expect(store.doc.components[0]).not.toHaveProperty('facesGap')
    expect(store.spreadBoardFaces(plate, 1, 0)).toBe(false)
    // Une commande, qu'on annule.
    store.undo()
    expect(store.doc.components[0]).toMatchObject({ x: -3, y: 1, facesGap: 8 })
    expect(store.doc.wires[0]?.points.at(0)).toEqual([16, 3])
  })

  it('un composant enfiché montre son empreinte sur l’autre face d’une plaque à deux faces', () => {
    const store = useSchematicStore()
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    const part = led()
    part.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 0, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE, footprint: true }
      ]
    }
    store.startPlacing(part)
    const id = store.placeAt(1, 1)
    store.stopPlacing()
    if (!plate || !id) throw new Error('pose refusée')
    expect(store.footprints.size).toBe(0)
    store.setInstanceUnderside(plate, true)
    expect([...store.footprints.entries()].map(([key, face]) => [key, face.id])).toEqual([
      [id, plate]
    ])
    // Sorti de la plaque, le composant n'a plus d'empreinte à montrer.
    store.moveInstances([id], 20, 0)
    expect(store.footprints.size).toBe(0)
  })

  it('déplacée, la plaque emmène ce qu’elle porte sur ses deux faces, elle seule sélectionnée', () => {
    const { store, plate, part, wire } = soldered()
    store.selection = [plate]
    expect(store.selectionLoad()).toEqual({
      instances: [part],
      wires: [wire],
      labels: [],
      ends: []
    })
    store.moveSelection(5, 2)
    expect(store.selection).toEqual([plate])
    expect(store.doc.components.map((instance) => [instance.x, instance.y])).toEqual([
      [5, 2],
      [6, 3]
    ])
    expect(store.doc.wires[0]?.points).toEqual([
      [18, 4],
      [18, 5],
      [16, 5],
      [16, 4]
    ])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
    // Les champs X et Y du panneau font de même.
    store.setInstancePosition(plate, 20, 10)
    expect(store.doc.components[1]).toMatchObject({ x: 21, y: 11 })
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
    // Une annulation par commande : tout revient d'un coup.
    store.undo()
    store.undo()
    expect(store.doc.components.map((instance) => [instance.x, instance.y])).toEqual([
      [0, 0],
      [1, 1]
    ])
    expect(store.doc.wires[0]?.points.at(0)).toEqual([13, 2])
  })

  it('un fil qui sort de la plaque s’étire : son bout suit le trou où il est soudé', () => {
    const { store, plate } = soldered()
    const leaving = store.addWire([
      [5, 3],
      [5, 9]
    ])
    store.clearSelection()
    store.selection = [plate]
    expect(store.selectionLoad().ends).toEqual([[5, 3]])
    store.moveSelection(2, 0)
    const moved = store.doc.wires.find((entry) => entry.id === leaving)
    expect(moved?.points.at(0)).toEqual([7, 3])
    expect(moved?.points.at(-1)).toEqual([5, 9])
  })

  it('tournée ou retournée, la plaque garde tout en place sur elle, et tout reste relié', () => {
    const { store, plate, part } = soldered()
    const onBoard = (): boolean =>
      store.pinRefs.length === 4 && store.connectivity.unconnectedPinKeys.size === 0
    store.selection = [plate]
    store.rotateSelection('cw')
    expect(store.doc.components[0]?.rotation).toBe(90)
    // La LED a tourné avec la plaque, autour d'elle.
    expect(store.doc.components[1]?.rotation).toBe(90)
    expect(onBoard()).toBe(true)
    store.flipSelection('horizontal')
    expect(onBoard()).toBe(true)
    store.setInstanceOrientation(plate, 180, false)
    expect(onBoard()).toBe(true)
    // Sélectionnée avec la plaque, la LED tourne encore avec elle, pas sur elle-même.
    store.selection = [plate, part]
    store.rotateSelection('ccw')
    expect(onBoard()).toBe(true)
    // Une plaque qui ne montre pas son dessous emmène de même ce qu'elle porte dessus.
    store.setInstanceUnderside(plate, false)
    store.selection = [plate]
    const before = store.doc.components[1]
    store.moveSelection(1, 1)
    expect(store.doc.components[1]).toMatchObject({
      x: (before?.x ?? 0) + 1,
      y: (before?.y ?? 0) + 1
    })
  })
})

describe('montage : fil nu et pont', () => {
  it('l’outil Fil trace un fil isolé, un fil nu ou un pont', () => {
    const store = useSchematicStore()
    // Un fil nu : tracé comme un fil, enregistré avec sa sorte.
    store.startWireTool('bare')
    expect(store.tool).toBe('wire')
    expect(store.wireKind).toBe('bare')
    expect(store.status).toContain('Fil nu')
    store.beginWire([0, 0])
    store.appendWirePoints([[6, 0]])
    const bare = store.finishWire()
    expect(store.doc.wires.find((wire) => wire.id === bare)).toMatchObject({
      kind: 'bare',
      points: [
        [0, 0],
        [6, 0]
      ]
    })
    expect(store.undoLabel).toBe('Tracer un fil nu')
    // Un pont : deux clics, où qu'ils soient.
    store.startWireTool('jumper')
    store.beginWire([0, 4])
    const jumper = store.finishJumper([5, 7])
    expect(store.doc.wires.find((wire) => wire.id === jumper)).toMatchObject({
      kind: 'jumper',
      points: [
        [0, 4],
        [5, 7]
      ]
    })
    expect(store.undoLabel).toBe('Poser un pont')
    expect(store.status).toContain('Pont tracé')
    // L'outil Fil ordinaire ne donne pas de sorte.
    store.startWireTool()
    expect(store.wireKind).toBeNull()
    store.beginWire([0, 10])
    store.appendWirePoints([[4, 10]])
    const plain = store.finishWire()
    expect(store.doc.wires.find((wire) => wire.id === plain)?.kind).toBeUndefined()
    // Le fichier garde les sortes.
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.wires.map((wire) => wire.kind)).toEqual(['bare', 'jumper', undefined])
  })

  it('un fil nu a sa couleur : l’étain au départ, puis celle qu’on lui donne', () => {
    const store = useSchematicStore()
    const wireColor = store.currentColor
    const colorOf = (id: string | null): string | undefined =>
      store.doc.wires.find((wire) => wire.id === id)?.color
    const trace = (y: number): string | null => {
      store.beginWire([0, y])
      store.appendWirePoints([[6, y]])
      return store.finishWire()
    }
    // Avec son outil : en étain, quelle que soit la couleur des fils ; l'étain vient en tête
    // des pastilles du panneau et du clic droit.
    store.startWireTool('bare')
    expect(store.paletteOnBare).toBe(true)
    expect(store.paletteSwatches[0]).toEqual({ hex: '#dfe5ea', name: 'Étain', custom: false })
    expect(store.paletteColor).toBe('#dfe5ea')
    expect(store.drawingColor).toBe('#dfe5ea')
    const first = trace(0)
    expect(colorOf(first)).toBe('#dfe5ea')
    // Une couleur choisie pendant qu'on trace des fils nus vaut pour eux seuls.
    store.setCurrentColor('#b45309')
    expect([store.bareColor, store.currentColor]).toEqual(['#b45309', wireColor])
    const second = trace(2)
    expect(colorOf(second)).toBe('#b45309')
    expect(colorOf(first)).toBe('#dfe5ea')
    // L'outil en main, recliquer la couleur courante revient à l'étain : la barre d'outils n'a
    // pas de pastille pour lui.
    store.setCurrentColor('#b45309')
    expect(store.bareColor).toBe('#dfe5ea')
    expect(store.status).toContain('étain')
    expect(colorOf(second)).toBe('#b45309')
    // L'outil Fil : la palette revient aux fils, sans l'étain.
    store.startWireTool()
    expect(store.paletteOnBare).toBe(false)
    expect(store.paletteSwatches.some((swatch) => swatch.name === 'Étain')).toBe(false)
    expect(store.paletteColor).toBe(wireColor)
    const third = trace(4)
    expect(colorOf(third)).toBe(wireColor)
    // En sélection, un fil nu seul sélectionné : la palette porte sur lui, et l'étain le
    // ramène au métal.
    store.selectTool()
    store.clearSelection()
    if (!second || !third) throw new Error('fil refusé')
    store.selectedWires = [second]
    expect(store.paletteOnBare).toBe(true)
    store.setCurrentColor('#dfe5ea')
    expect(colorOf(second)).toBe('#dfe5ea')
    expect([store.bareColor, store.currentColor]).toEqual(['#dfe5ea', wireColor])
    // Avec un fil isolé dans la sélection, elle porte sur les fils.
    store.selectedWires = [second, third]
    expect(store.paletteOnBare).toBe(false)
    // Changer de sorte donne la couleur des prochains fils de la nouvelle sorte.
    store.clearSelection()
    store.setWiresKind([third], 'bare')
    expect(colorOf(third)).toBe('#dfe5ea')
    store.setWiresKind([third], null)
    expect(colorOf(third)).toBe(wireColor)
  })

  it('un fil nu relie les broches de son trajet ; redevenu isolé, plus que ses bouts', () => {
    const store = useSchematicStore()
    // Trois résistances l'une sous l'autre : leurs broches de gauche sont en x = 2.
    store.startPlacing(resistor())
    store.placeAt(2, 0)
    store.placeAt(2, 4)
    store.placeAt(2, 8)
    store.stopPlacing()
    const wire = store.addWire(
      [
        [2, 1],
        [2, 9]
      ],
      '#000000',
      'bare'
    )
    if (!wire) throw new Error('fil refusé')
    const net = (key: string): number | undefined => store.connectivity.pinNet.get(key)
    expect(net('c1:a')).toBe(net('c2:a'))
    expect(net('c2:a')).toBe(net('c3:a'))
    expect(store.connectivity.solders).toHaveLength(3)
    // Devenu fil isolé : la broche du milieu n'est plus reliée.
    store.setWiresKind([wire], null)
    expect(store.undoLabel).toBe('Fil isolé')
    expect(store.doc.wires[0]?.kind).toBeUndefined()
    expect(net('c1:a')).toBe(net('c3:a'))
    expect(net('c2:a')).not.toBe(net('c1:a'))
    expect(store.connectivity.solders).toEqual([])
    store.setWiresKind([wire], 'bare')
    expect(store.undoLabel).toBe('Fil nu')
    // Redire la même sorte ne fait rien.
    const before = store.doc
    store.setWiresKind([wire], 'bare')
    expect(store.doc).toBe(before)
  })

  it('un pont n’a que ses deux bouts : ni sommet, ni coupe ; il se retourne et suit ses broches', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const id = store.placeAt(2, 0)
    store.stopPlacing()
    // Du bout gauche de la résistance (2, 1) à un point quelconque.
    const jumper = store.addWire(
      [
        [2, 1],
        [9, 6]
      ],
      '#d62828',
      'jumper'
    )
    if (!jumper || !id) throw new Error('pont refusé')
    const points = (): unknown => store.doc.wires.find((wire) => wire.id === jumper)?.points
    const before = store.doc
    // Pas de sommet à ajouter, pas de coupe, pas de sorte à changer.
    store.addWireVertex(jumper, [5, 3])
    expect(store.toggleWireVertex(jumper, { x: 5, y: 3 })).toBe(false)
    expect(store.splitWire(jumper, [5, 3])).toBeNull()
    store.setWiresKind([jumper], 'bare')
    expect(store.doc).toBe(before)
    // Retourné : ses bouts échangés, il se bombe de l'autre côté.
    store.flipJumper(jumper)
    expect(store.undoLabel).toBe('Retourner le pont')
    expect(points()).toEqual([
      [9, 6],
      [2, 1]
    ])
    // Un bout se pose où l'on veut, hors de toute direction de la grille.
    store.setWirePoints(jumper, [
      [10, 3],
      [2, 1]
    ])
    expect(points()).toEqual([
      [10, 3],
      [2, 1]
    ])
    // Le composant bouge : le bout du pont suit sa broche, sans coude.
    store.selection = [id]
    store.moveSelection(1, 4)
    expect(points()).toEqual([
      [10, 3],
      [3, 5]
    ])
  })
})
