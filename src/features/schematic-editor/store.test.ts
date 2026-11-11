import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  absolutePinPosition,
  createEmptyComponent,
  createEmptyProject,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
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
    expect(store.colorChoices.at(-1)).toEqual({ hex: '#ff00aa', name: '#ff00aa' })
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
  it('pose les composants derrière les fils ; commande ou Ctrl+Page les passe devant ou derrière', () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const first = store.placeAt(2, 3)
    const second = store.placeAt(10, 3)
    store.stopPlacing()
    if (!first || !second) throw new Error('composants attendus')
    // À la pose, un composant est derrière les fils : ceux qu'on trace sur lui restent visibles.
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([true, true])
    store.setInstancesBehindWires([first], false)
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([false, true])
    expect(store.undoLabel).toBe('Passer devant les fils')
    // Déjà devant : rien à faire, rien de plus à annuler.
    store.setInstancesBehindWires([first], false)
    store.undo()
    expect(store.doc.components[0]?.behindWires).toBe(true)
    // Ctrl+Page haut sur la sélection, puis Ctrl+Page bas.
    store.selection = [second]
    store.restackSelection('up')
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([true, false])
    store.restackSelection('bottom')
    expect(store.doc.components[1]?.behindWires).toBe(true)
    expect(store.undoLabel).toBe('Passer derrière les fils')
    // Le réglage s'enregistre avec le montage.
    store.restackSelection('top')
    const reread = parseProject(serializeProject(store.doc))
    expect(reread.components.map((instance) => instance.behindWires)).toEqual([true, false])
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
