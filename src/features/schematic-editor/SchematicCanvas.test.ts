// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  createEmptyComponent,
  DEFAULT_PROFILE,
  type ComponentDefinition,
  type Primitive
} from '@/domain'
import SchematicCanvas from './SchematicCanvas.vue'
import { useSchematicStore } from './store'

function resistor(): ComponentDefinition {
  const def = createEmptyComponent('resistor', 'Résistance')
  def.pins = [
    { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
    { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
  ]
  return def
}

/** Montage avec une résistance en (2, 3) : broches en (2, 4) et (6, 4). */
function withResistor(): ReturnType<typeof useSchematicStore> {
  const store = useSchematicStore()
  store.startPlacing(resistor())
  store.placeAt(2, 3)
  store.stopPlacing()
  return store
}

/** Position à l'écran d'un point de la grille : jsdom place le SVG en (0, 0). */
function at(
  store: ReturnType<typeof useSchematicStore>,
  x: number,
  y: number
): { clientX: number; clientY: number } {
  return {
    clientX: store.view.panX + x * store.cellPx,
    clientY: store.view.panY + y * store.cellPx
  }
}

/**
 * Envoie un événement de pointeur (bouton gauche) et attend le rendu. `trigger` de test-utils ne
 * sait pas donner de coordonnées à un événement de souris : elles se passent au constructeur.
 */
async function fire(
  target: { element: Element },
  type: string,
  position: { clientX: number; clientY: number },
  extra: MouseEventInit = {}
): Promise<void> {
  target.element.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...position, ...extra })
  )
  await nextTick()
}

/** Ctrl enfoncée : les événements de souris la portent, comme dans la vraie fenêtre. */
const CTRL = { ctrlKey: true }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  // jsdom ne connaît pas la capture du pointeur.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
})

describe('canevas du montage : fil tiré d’une broche par Ctrl+glisser', () => {
  it('sans Ctrl, rien ne s’annonce et glisser un composant le déplace', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 6, 4))
    expect(wrapper.find('.pin-grab').exists()).toBe(false)
    // Appui tout près de la broche de droite, puis glisser : le composant suit, aucun fil.
    await fire(wrapper.get('.instance .hit'), 'pointerdown', at(store, 5.8, 4))
    await fire(svg, 'pointermove', at(store, 8.8, 6))
    await fire(svg, 'pointerup', at(store, 8.8, 6))
    expect(store.doc.wires).toHaveLength(0)
    expect(store.doc.components[0]).toMatchObject({ x: 5, y: 5 })
  })

  it('Ctrl montre la broche la plus proche du composant survolé, pas avec un autre outil', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // Au milieu du composant, côté droit : c'est la broche de droite (6, 4) qui serait saisie.
    await fire(svg, 'pointermove', at(store, 5, 4.4), CTRL)
    expect(store.ctrlHeld).toBe(true)
    const ring = wrapper.get('.pin-grab')
    expect([ring.attributes('cx'), ring.attributes('cy')]).toEqual(['6', '4'])
    await fire(svg, 'pointermove', at(store, 2.6, 4.4), CTRL)
    expect(wrapper.get('.pin-grab').attributes('cx')).toBe('2')
    // Loin de tout composant et de toute broche : rien.
    await fire(svg, 'pointermove', at(store, 12, 12), CTRL)
    expect(wrapper.find('.pin-grab').exists()).toBe(false)
    store.tool = 'wire'
    await fire(svg, 'pointermove', at(store, 6, 4), CTRL)
    expect(wrapper.find('.pin-grab').exists()).toBe(false)
    // Ctrl relâchée : l'anneau disparaît.
    store.tool = 'select'
    await fire(svg, 'pointermove', at(store, 6, 4), CTRL)
    expect(wrapper.find('.pin-grab').exists()).toBe(true)
    await fire(svg, 'pointermove', at(store, 6, 4))
    expect(wrapper.find('.pin-grab').exists()).toBe(false)
  })

  it('Ctrl+glisser sur un composant tire un fil de sa broche la plus proche, en une commande', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 5, 4.4), CTRL)
    await fire(wrapper.get('.instance .hit'), 'pointerdown', at(store, 5, 4.4), CTRL)
    // Rien tant que le pointeur n'a pas bougé ; puis l'aperçu du fil suit le pointeur.
    expect(wrapper.find('.drawing').exists()).toBe(false)
    await fire(svg, 'pointermove', at(store, 9.2, 6.9), CTRL)
    expect(wrapper.find('.drawing .pending').exists()).toBe(true)
    expect(wrapper.find('.pin-grab').exists()).toBe(false)
    await fire(svg, 'pointerup', at(store, 9.2, 6.9), CTRL)
    expect(store.doc.wires).toHaveLength(1)
    const points = store.doc.wires[0]?.points ?? []
    expect(points.at(0)).toEqual([6, 4])
    expect(points.at(-1)).toEqual([9, 7])
    expect(wrapper.find('.drawing').exists()).toBe(false)
    // Le composant n'a pas bougé et n'est pas sélectionné ; l'outil reste la sélection.
    expect(store.doc.components[0]).toMatchObject({ x: 2, y: 3 })
    expect(store.selection).toEqual([])
    expect(store.tool).toBe('select')
    expect(store.undoLabel).toBe('Tracer un fil')
    store.undo()
    expect(store.doc.wires).toHaveLength(0)
  })

  it('accroche l’arrivée à une autre broche', async () => {
    const store = withResistor()
    store.startPlacing(resistor())
    store.placeAt(2, 8)
    store.stopPlacing()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 6, 4), CTRL)
    await fire(svg, 'pointerdown', at(store, 6, 4), CTRL)
    // Relâché près de la broche (6, 9) de la seconde résistance, pas pile dessus.
    await fire(svg, 'pointermove', at(store, 6.3, 8.8), CTRL)
    await fire(svg, 'pointerup', at(store, 6.3, 8.8), CTRL)
    expect(store.doc.wires[0]?.points).toEqual([
      [6, 4],
      [6, 9]
    ])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(2)
  })

  it('un simple Ctrl+clic sélectionne le composant, sans fil', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 2, 4), CTRL)
    await fire(svg, 'pointerdown', at(store, 2, 4), CTRL)
    // L'anneau reste pendant le clic.
    expect(wrapper.find('.pin-grab').exists()).toBe(true)
    await fire(svg, 'pointerup', at(store, 2, 4), CTRL)
    expect(store.doc.wires).toHaveLength(0)
    expect(store.selection).toEqual([store.doc.components[0]?.id])
  })

  it('revenir relâcher sur la broche de départ ne trace rien', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 2, 4), CTRL)
    await fire(svg, 'pointerdown', at(store, 2, 4), CTRL)
    await fire(svg, 'pointermove', at(store, 0, 0), CTRL)
    await fire(svg, 'pointermove', at(store, 2.1, 4.1), CTRL)
    await fire(svg, 'pointerup', at(store, 2.1, 4.1), CTRL)
    expect(store.doc.wires).toHaveLength(0)
    expect(store.undoLabel).toBe('Poser Résistance')
  })
})

describe('canevas du montage : étiquettes texte', () => {
  it('dessine une étiquette avec sa couleur, ses styles et son sens', async () => {
    const store = useSchematicStore()
    const id = store.addLabelBox({ x: 2, y: 0, w: 1, h: 4 })
    const wrapper = mount(SchematicCanvas)
    const text = (): ReturnType<typeof wrapper.get> => wrapper.get('.text-label text')
    // Noir pur : l'encre du thème, sans décoration ni rotation.
    expect(text().attributes('fill')).toBe('var(--ink)')
    expect(text().attributes('transform')).toBeUndefined()
    expect(text().attributes('font-style')).toBeUndefined()
    store.setLabelStyle(id, 'Styles', { color: '#d62828', italic: true, strike: true })
    store.setLabelVertical(id, true)
    await wrapper.vm.$nextTick()
    expect(text().attributes()).toMatchObject({
      fill: '#d62828',
      'font-style': 'italic',
      'text-decoration': 'line-through',
      transform: 'rotate(90 2.5 2)'
    })
    // Les lignes se posent au centre de la boîte tournée.
    expect(wrapper.get('.text-label tspan').attributes('x')).toBe('2.5')
  })

  it('ne met un fond sous une étiquette que si on le demande', async () => {
    const store = useSchematicStore()
    const id = store.addLabelBox({ x: 2, y: 0, w: 4, h: 1 })
    const wrapper = mount(SchematicCanvas)
    expect(store.doc.labels[0]?.background).toBe(false)
    expect(wrapper.find('.label-back').exists()).toBe(false)
    store.setLabelStyle(id, 'Fond de l’étiquette', { background: true })
    await wrapper.vm.$nextTick()
    // Sa boîte, sous le texte.
    expect(wrapper.get('.text-label .label-back').attributes()).toMatchObject({
      x: '2',
      y: '0',
      width: '4',
      height: '1'
    })
    expect(
      wrapper.get('.text-label').element.firstElementChild?.classList.contains('label-back')
    ).toBe(true)
    store.undo()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.label-back').exists()).toBe(false)
  })
})

describe('canevas du montage : fils à 45° avec Alt', () => {
  /** Alt enfoncée : les événements de souris la portent. */
  const ALT = { altKey: true }

  it('trace une diagonale puis un segment droit tant qu’Alt est enfoncée, l’inverse avec Maj', async () => {
    const store = useSchematicStore()
    store.startWireTool()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointerdown', at(store, 0, 0))
    // Sans Alt, l'aperçu est un L ; avec, il part en diagonale.
    await fire(svg, 'pointermove', at(store, 5, 2))
    expect(wrapper.get('.drawing .pending').attributes('d')).toContain('L 5 2')
    expect(store.altHeld).toBe(false)
    await fire(svg, 'pointermove', at(store, 5, 2), ALT)
    expect(store.altHeld).toBe(true)
    const pending = wrapper.get('.drawing .pending').attributes('d') ?? ''
    expect(pending.startsWith('M 0 0 L 1.')).toBe(true)
    expect(pending.endsWith('L 5 2')).toBe(true)
    await fire(svg, 'pointerdown', at(store, 5, 2), ALT)
    expect(store.drawing?.points).toEqual([
      [0, 0],
      [2, 2],
      [5, 2]
    ])
    // Maj inverse : le segment droit d'abord, la diagonale à l'arrivée.
    store.shiftHeld = true
    await fire(svg, 'pointerdown', at(store, 9, 4), ALT)
    store.shiftHeld = false
    expect(store.drawing?.points.slice(2)).toEqual([
      [5, 2],
      [7, 2],
      [9, 4]
    ])
    store.finishWire()
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 0],
      [2, 2],
      [7, 2],
      [9, 4]
    ])
    // Relâcher Alt revient au L.
    await fire(svg, 'pointermove', at(store, 12, 8))
    expect(store.altHeld).toBe(false)
  })

  it('Ctrl+Alt+glisser tire d’une broche un fil à 45°', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    store.ctrlHeld = true
    await fire(svg, 'pointermove', at(store, 6.2, 4), CTRL)
    await fire(svg, 'pointerdown', at(store, 6.2, 4), CTRL)
    await fire(svg, 'pointermove', at(store, 11, 7), { ...CTRL, ...ALT })
    await fire(svg, 'pointerup', at(store, 11, 7), { ...CTRL, ...ALT })
    expect(store.doc.wires[0]?.points).toEqual([
      [6, 4],
      [9, 7],
      [11, 7]
    ])
  })
})

describe('canevas du montage : composants derrière les fils', () => {
  it('dessine sous les fils le composant qu’on vient de poser, et au-dessus celui passé devant', async () => {
    const store = withResistor()
    const id = store.doc.components[0]?.id
    if (!id) throw new Error('composant attendu')
    store.addWire([
      [0, 4],
      [8, 4]
    ])
    const wrapper = mount(SchematicCanvas)
    const precedes = (first: string, second: string): boolean => {
      const a = wrapper.get(first).element
      const b = wrapper.get(second).element
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    }
    // Posé : derrière les fils. Il reste un composant qu'on saisit et qu'on déplace.
    expect(precedes('.instance', '.wires')).toBe(true)
    await fire(wrapper.get('.instance'), 'pointerdown', at(store, 4, 3.2))
    expect(store.selection).toEqual([id])
    await fire(wrapper.get('svg.schematic'), 'pointerup', at(store, 4, 3.2))
    store.setInstancesBehindWires([id], false)
    await wrapper.vm.$nextTick()
    expect(precedes('.wires', '.instance')).toBe(true)
  })
})

describe('canevas du montage : fil sélectionné', () => {
  it('l’entoure d’un liseré bleu détaché du fil par un filet de la couleur du papier', async () => {
    const store = useSchematicStore()
    const a = store.addWire([
      [0, 0],
      [6, 0]
    ])
    const b = store.addWire([
      [0, 4],
      [6, 4]
    ])
    if (!a || !b) throw new Error('fils refusés')
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    expect(wrapper.find('.wire-selections path').exists()).toBe(false)
    store.selectedWires = [a]
    await nextTick()
    const marks = wrapper.findAll('.wire-selections path')
    expect(marks.map((mark) => mark.classes())).toEqual([['ring'], ['gap']])
    // À 100 % (20 px par cellule) : le liseré dépasse le fil de 9 px en tout, le filet de 4.
    const wire = Number(wrapper.get('.wires .wire').attributes('stroke-width'))
    const widths = marks.map((mark) => Number(mark.attributes('stroke-width')))
    expect((widths[0] ?? 0) - wire).toBeCloseTo(9 / store.cellPx / store.view.zoom)
    expect((widths[1] ?? 0) - wire).toBeCloseTo(4 / store.cellPx / store.view.zoom)
    // Deux fils sélectionnés : tous les liserés d'abord, tous les filets ensuite.
    store.selectedWires = [a, b]
    await nextTick()
    expect(wrapper.findAll('.wire-selections path').map((mark) => mark.classes()[0])).toEqual([
      'ring',
      'ring',
      'gap',
      'gap'
    ])
  })
})

describe('canevas du montage : groupes', () => {
  /** La résistance (de (2, 3) à (6, 5)) groupée avec un fil de (10, 8) à (14, 8). */
  function withGroup(): {
    store: ReturnType<typeof useSchematicStore>
    instance: string
    wire: string
  } {
    const store = withResistor()
    const instance = store.doc.components[0]?.id
    const wire = store.addWire([
      [10, 8],
      [14, 8]
    ])
    if (!instance || !wire) throw new Error('montage incomplet')
    store.clearSelection()
    store.selection = [instance]
    store.selectedWires = [wire]
    store.groupSelection()
    store.clearSelection()
    return { store, instance, wire }
  }

  it('entoure le groupe, le prend d’un clic sur un membre et le déplace d’un bloc', async () => {
    const { store, instance, wire } = withGroup()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    const outline = (): number[] =>
      ['x', 'y', 'width', 'height'].map((name) =>
        Number(wrapper.get('.group-outline').attributes(name))
      )
    // Le contour entoure la résistance et le fil, à 0,4 cellule.
    const [x, y, width, height] = outline()
    expect(x).toBeCloseTo(1.6)
    expect(y).toBeCloseTo(2.6)
    expect(width).toBeCloseTo(12.8)
    expect(height).toBeCloseTo(5.8)

    // Clic sur le fil : tout le groupe est sélectionné, et le glisser l'emmène, contour compris.
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 12, 8))
    expect([store.selection, store.selectedWires]).toEqual([[instance], [wire]])
    await fire(svg, 'pointermove', at(store, 14, 9))
    expect(outline()[0]).toBeCloseTo(3.6)
    expect(outline()[1]).toBeCloseTo(3.6)
    await fire(svg, 'pointerup', at(store, 14, 9))
    expect(store.doc.components[0]).toMatchObject({ x: 4, y: 4 })
    expect(store.doc.wires[0]?.points).toEqual([
      [12, 9],
      [16, 9]
    ])

    // Maj+clic sur le composant : tout le groupe quitte la sélection.
    await fire(wrapper.get('.instance .hit'), 'pointerdown', at(store, 6, 5), { shiftKey: true })
    expect(store.hasSelection).toBe(false)

    // Case « Groupes » décochée : plus de contour.
    store.showGroups = false
    await nextTick()
    expect(wrapper.find('.group-outline').exists()).toBe(false)
  })

  it('un lasso qui touche un membre prend tout le groupe ; Ctrl+clic prend l’élément seul', async () => {
    const { store, instance, wire } = withGroup()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointerdown', at(store, 9, 7))
    await fire(svg, 'pointermove', at(store, 11, 9))
    await fire(svg, 'pointerup', at(store, 11, 9))
    expect([store.selection, store.selectedWires]).toEqual([[instance], [wire]])

    // Ctrl+clic sur le fil : lui seul, pour le retoucher sans défaire le groupe.
    store.clearSelection()
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 12, 8), CTRL)
    await fire(svg, 'pointerup', at(store, 12, 8), CTRL)
    expect([store.selection, store.selectedWires]).toEqual([[], [wire]])
  })
})

describe('canevas du montage : sommets au Ctrl+clic, double-clic sur un fil', () => {
  it('Ctrl+clic ajoute un sommet sur une partie droite, et retire le coin dont on vise la poignée', async () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [2, 2],
      [8, 2],
      [8, 6]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 5, 2), CTRL)
    await fire(svg, 'pointerup', at(store, 5, 2), CTRL)
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [5, 2],
      [8, 2],
      [8, 6]
    ])
    // Le fil est sélectionné, seul : ses sommets montrent leurs poignées.
    expect(store.selectedWires).toEqual([id])
    const handle = wrapper.findAll('.vertex-handle')[1]
    await fire(handle ?? svg, 'pointerdown', at(store, 5, 2), CTRL)
    await fire(svg, 'pointerup', at(store, 5, 2), CTRL)
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [8, 2],
      [8, 6]
    ])
    // Ctrl+clic sur le coude, à même le fil : ses voisins ne se rejoignent pas, il reste.
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 8, 2), CTRL)
    await fire(svg, 'pointerup', at(store, 8, 2), CTRL)
    expect(store.doc.wires[0]?.points).toHaveLength(3)
  })

  it('double-clic sur un fil : un nouveau fil part de là, raccordé par une jonction', async () => {
    const store = useSchematicStore()
    store.addWire([
      [2, 2],
      [8, 2],
      [8, 6]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'dblclick', at(store, 8.1, 4.2))
    expect(store.tool).toBe('wire')
    expect(store.drawing?.points).toEqual([[8, 4]])
    await fire(svg, 'pointerdown', at(store, 12, 4))
    store.finishWire()
    expect(store.doc.wires[1]?.points).toEqual([
      [8, 4],
      [12, 4]
    ])
    expect(store.connectivity.junctions.map((junction) => junction.point)).toEqual([[8, 4]])
    // Loin de tout fil, ou sur une extrémité : pas de nouveau fil.
    store.selectTool()
    await fire(svg, 'dblclick', at(store, 20, 20))
    expect(store.tool).toBe('select')
  })

  it('ne garde le pointeur qu’une fois le geste commencé, pour laisser le double-clic à l’élément', async () => {
    const store = withResistor()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    const capture = vi.mocked(Element.prototype.setPointerCapture)
    const down = at(store, 4, 4)
    await fire(wrapper.get('.instance .hit'), 'pointerdown', down)
    await fire(svg, 'pointermove', { clientX: down.clientX + 1, clientY: down.clientY })
    expect(capture).not.toHaveBeenCalled()
    await fire(svg, 'pointermove', at(store, 6, 4))
    expect(capture).toHaveBeenCalledTimes(1)
    await fire(svg, 'pointerup', at(store, 6, 4))
    expect(store.doc.components[0]).toMatchObject({ x: 4, y: 3 })
  })
})

/** Composant vide qui ne porte qu'un texte. */
function captioned(id: string, text: string): ComponentDefinition {
  const caption: Primitive = {
    kind: 'text',
    x: 0,
    y: 0,
    w: 8,
    h: 4,
    text,
    size: 0.5,
    anchor: 'start',
    color: '#000000',
    variable: false,
    defaultValue: '',
    unit: '',
    bold: false,
    followsRotation: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false
  }
  return { ...createEmptyComponent(id, id), visual: { kind: 'drawing', primitives: [caption] } }
}

describe('canevas du montage : ordre des composants', () => {
  it('dessine les textes d’un composant avec lui, sous le composant posé dessus', () => {
    const store = useSchematicStore()
    store.startPlacing(captioned('dessous', 'DESSOUS'))
    store.placeAt(2, 3)
    store.startPlacing(captioned('dessus', 'DESSUS'))
    store.placeAt(3, 3)
    store.stopPlacing()
    const wrapper = mount(SchematicCanvas)
    const drawn = [...(wrapper.get('.instance').element.parentElement?.children ?? [])]
      .map((child) => child.getAttribute('class') ?? '')
      .filter((name) => name.startsWith('instance'))
    expect(drawn).toEqual(['instance', 'instance-texts', 'instance', 'instance-texts'])
    expect(wrapper.findAll('.instance-texts').map((group) => group.text())).toEqual([
      'DESSOUS',
      'DESSUS'
    ])
    wrapper.unmount()
  })

  it('dessine les composants dans l’ordre de la liste, le dernier posé au-dessus', async () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    const first = store.placeAt(2, 3)
    const second = store.placeAt(12, 3)
    store.stopPlacing()
    if (!first || !second) throw new Error('composants attendus')
    const wrapper = mount(SchematicCanvas)
    const drawn = (): (string | undefined)[] =>
      wrapper.findAll('.instance').map((item) => item.attributes('transform'))
    const [below, above] = drawn()
    expect(below).not.toBe(above)
    // Le premier posé passe devant : il est dessiné après l'autre.
    store.selection = [first]
    store.reorderInstances('top')
    await nextTick()
    expect(drawn()).toEqual([above, below])
    wrapper.unmount()
  })
})

describe('canevas du montage : styles propres', () => {
  /** Fils deux fois plus épais, sans coins arrondis ; libellés en Consolas, deux fois plus grands. */
  const THICK = {
    ...DEFAULT_PROFILE,
    name: 'Épais',
    cellPx: 40,
    wireWidth: 0.3,
    cornerRadius: 0,
    componentStroke: 0.2,
    labelFont: { family: 'Consolas', size: 22 },
    endLabelFont: { family: 'Consolas', size: 28 }
  }

  it('dessine chaque élément avec son style, sur la grille du montage', async () => {
    const store = withResistor()
    const part = store.doc.components[0]?.id
    const plain = store.addWire([
      [0, 8],
      [8, 8]
    ])
    // Un fil coudé, libre à l'arrivée, qui part du milieu du premier : une jonction.
    const styled = store.addWire([
      [4, 8],
      [4, 12],
      [8, 12]
    ])
    const text = store.addLabelBox({ x: 0, y: 14, w: 4, h: 1 })
    if (!part || !plain || !styled) throw new Error('montage incomplet')
    store.setInstanceLabel(part, 'R1')
    store.setWireEndLabel(styled, 2, 'VCC')
    const wrapper = mount(SchematicCanvas)
    const widths = (): number[] =>
      wrapper.findAll('.wires .wire').map((wire) => Number(wire.attributes('stroke-width')))
    const corner = (): boolean =>
      (wrapper.findAll('.wires .wire')[1]?.attributes('d') ?? '').includes('A')
    expect(widths()).toEqual([0.15, 0.15])
    expect(corner()).toBe(true)
    const zoomed = store.cellPx

    store.clearSelection()
    store.selection = [part]
    store.selectedWires = [styled]
    store.selectedLabels = [text]
    store.setSelectionStyle(THICK)
    await nextTick()
    // La cellule ne bouge pas : le profil épais en demandait 40 px, le montage reste à 20.
    expect(store.cellPx).toBe(zoomed)
    // Fils : épaisseur et coins de chacun ; le liseré de sélection suit l'épaisseur du fil.
    expect(widths()).toEqual([0.15, 0.3])
    expect(corner()).toBe(false)
    const ring = Number(wrapper.get('.wire-selections .ring').attributes('stroke-width'))
    expect(ring - 0.3).toBeCloseTo(9 / store.cellPx)
    // Jonction : le point du plus épais des deux fils (0,3 × 2 / 2).
    expect(Number(wrapper.get('.junctions circle').attributes('r'))).toBeCloseTo(0.3)
    // Étiquette d'extrémité : police du profil, 28 points sur une cellule de 20.
    const end = wrapper.get('.end-label text')
    expect(end.attributes('font-family')).toBe('Consolas')
    expect(Number(end.attributes('font-size'))).toBeCloseTo(1.4)
    expect(Number(wrapper.get('.end-label circle').attributes('r'))).toBe(0.3)
    // Libellé du composant et étiquette texte : police des libellés du profil.
    const label = wrapper.get('.labels text')
    expect(label.text()).toBe('R1')
    expect(label.attributes('font-family')).toBe('Consolas')
    expect(Number(label.attributes('font-size'))).toBeCloseTo(1.1)
    const free = wrapper.get('.text-label text')
    expect(free.attributes('font-family')).toBe('Consolas')
    expect(Number(free.attributes('font-size'))).toBeCloseTo(1.1)

    // Retour au style du montage : tout redevient comme avant.
    store.setSelectionStyle(null)
    await nextTick()
    expect(widths()).toEqual([0.15, 0.15])
    expect(wrapper.get('.labels text').attributes('font-family')).toBe('Segoe UI')
    expect(Number(wrapper.get('.text-label text').attributes('font-size'))).toBeCloseTo(0.55)
    wrapper.unmount()
  })

  it('redessine le fil du dessus d’un croisement dans son épaisseur à lui', async () => {
    const store = useSchematicStore()
    store.addWire([
      [0, 2],
      [8, 2]
    ])
    const top = store.addWire([
      [4, 0],
      [4, 4]
    ])
    if (!top) throw new Error('fil refusé')
    const wrapper = mount(SchematicCanvas)
    const marks = (): number[] =>
      wrapper.findAll('.crossings line').map((line) => Number(line.attributes('stroke-width')))
    expect(marks()[1]).toBe(0.15)
    store.clearSelection()
    store.selectedWires = [top]
    store.setSelectionStyle(THICK)
    await nextTick()
    expect(marks()[0]).toBeCloseTo(0.66)
    expect(marks()[1]).toBe(0.3)
    wrapper.unmount()
  })
})
