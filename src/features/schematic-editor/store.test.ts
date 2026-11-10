import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  absolutePinPosition,
  createEmptyComponent,
  createEmptyProject,
  DEFAULT_PROFILE,
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
          strike: false
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('un montage vierge n’est pas modifié, et un nouveau montage prend sa place', () => {
    const store = useSchematicStore()
    expect(store.dirty).toBe(false)
    expect(store.pristine).toBe(true)
    store.newProject()
    expect(store.tabs).toHaveLength(1)
    store.setProjectName('Alim')
    expect(store.pristine).toBe(false)
    store.newProject()
    expect(store.tabs.map((tab) => [tab.name, tab.dirty])).toEqual([
      ['Alim', true],
      ['Nouveau montage', false]
    ])
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

  it('demande confirmation avant de fermer un onglet modifié', () => {
    const store = useSchematicStore()
    store.setProjectName('Brouillon')
    vi.stubGlobal('window', { confirm: () => false })
    expect(store.closeTab(store.activeTabId)).toBe(false)
    expect(store.doc.name).toBe('Brouillon')
    vi.stubGlobal('window', { confirm: () => true })
    expect(store.closeTab(store.activeTabId)).toBe(true)
    expect(store.doc.name).toBe('Nouveau montage')
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

  it('liste les montages modifiés pour la copie de secours, onglet par onglet', () => {
    const store = useSchematicStore()
    store.setProjectName('A')
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
