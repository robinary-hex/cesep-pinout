// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  createEmptyComponent,
  DEFAULT_PROFILE,
  DEFAULT_SHAPE_STYLE,
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
    // Avancé d'un rang, le seul composant de derrière passe devant les fils.
    store.reorderInstances('up')
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

describe('canevas du montage : saisir le bout d’un fil', () => {
  /** Un fil en L, de (2, 2) à (8, 6) par (8, 2), rien de sélectionné. */
  function withElbow(): { store: ReturnType<typeof useSchematicStore>; id: string } {
    const store = useSchematicStore()
    const id = store.addWire([
      [2, 2],
      [8, 2],
      [8, 6]
    ])
    if (!id) throw new Error('fil refusé')
    store.clearSelection()
    return { store, id }
  }

  it('un appui près du bout le saisit, sans viser sa poignée ni sélectionner le fil d’abord', async () => {
    const { store, id } = withElbow()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // À 100 %, la saisie porte à 12 px du bout : sa poignée s'annonce, le curseur aussi.
    await fire(svg, 'pointermove', at(store, 8.3, 5.7))
    const mark = wrapper.get('.end-grab')
    expect([mark.attributes('cx'), mark.attributes('cy')]).toEqual(['8', '6'])
    expect(svg.classes()).toContain('end-near')
    // Plus loin du bout : rien ne s'annonce.
    await fire(svg, 'pointermove', at(store, 8.2, 4.5))
    expect(wrapper.find('.end-grab').exists()).toBe(false)
    expect(svg.classes()).not.toContain('end-near')

    // Appui sur le fil, à côté du bout, puis glisser : le bout suit, le tronçon reste vertical.
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 8.1, 5.6))
    expect(store.selectedWires).toEqual([id])
    await fire(svg, 'pointermove', at(store, 10, 7))
    expect(wrapper.find('.end-drop').exists()).toBe(true)
    expect(wrapper.find('.end-grab').exists()).toBe(false)
    await fire(svg, 'pointerup', at(store, 10, 7))
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [10, 2],
      [10, 7]
    ])
    expect(store.undoLabel).toBe('Modifier le fil')
    expect(wrapper.find('.end-drop').exists()).toBe(false)

    // Au milieu d'un tronçon, rien ne change : on glisse le tronçon, les bouts restent en place.
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 6, 2.1))
    await fire(svg, 'pointermove', at(store, 6, 4))
    await fire(svg, 'pointerup', at(store, 6, 4))
    const points = store.doc.wires[0]?.points ?? []
    expect(points[0]).toEqual([2, 2])
    expect(points.at(-1)).toEqual([10, 7])
    expect(points).toHaveLength(4)
  })

  it('juste à côté du bout, dans le vide : c’est le bout qu’on prend, pas un lasso', async () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [2, 2],
      [8, 2]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointerdown', at(store, 8.4, 2.3))
    await fire(svg, 'pointermove', at(store, 11, 2))
    expect(wrapper.find('.band').exists()).toBe(false)
    await fire(svg, 'pointerup', at(store, 11, 2))
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [11, 2]
    ])
    expect(store.selectedWires).toEqual([id])
    // Un simple clic à côté du bout sélectionne le fil, sans rien changer.
    store.clearSelection()
    await fire(svg, 'pointerdown', at(store, 2.2, 1.7))
    await fire(svg, 'pointerup', at(store, 2.2, 1.7))
    expect(store.selectedWires).toEqual([id])
    expect(store.doc.wires[0]?.points).toHaveLength(2)
    // Loin de tout bout : le lasso, comme avant. Avec Maj aussi, même près d'un bout.
    await fire(svg, 'pointerdown', at(store, 14, 8))
    await fire(svg, 'pointermove', at(store, 16, 10))
    expect(wrapper.find('.band').exists()).toBe(true)
    await fire(svg, 'pointerup', at(store, 16, 10))
    await fire(svg, 'pointerdown', at(store, 11.3, 2.2), { shiftKey: true })
    await fire(svg, 'pointermove', at(store, 13, 4), { shiftKey: true })
    expect(wrapper.find('.band').exists()).toBe(true)
    await fire(svg, 'pointerup', at(store, 13, 4), { shiftKey: true })
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [11, 2]
    ])
  })

  it('laisse le milieu d’un fil court au tronçon : la saisie ne prend pas plus de 45 % du bout', async () => {
    const store = useSchematicStore()
    store.addWire([
      [2, 2],
      [3, 2]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 2.5, 2))
    expect(wrapper.find('.end-grab').exists()).toBe(false)
    await fire(svg, 'pointermove', at(store, 2.8, 2))
    expect(wrapper.get('.end-grab').attributes('cx')).toBe('3')
    await fire(svg, 'pointermove', at(store, 2.2, 2))
    expect(wrapper.get('.end-grab').attributes('cx')).toBe('2')
  })

  it('un fil pris avec d’autres se déplace d’un bloc, même saisi par son bout', async () => {
    const store = useSchematicStore()
    const a = store.addWire([
      [2, 2],
      [8, 2]
    ])
    const b = store.addWire([
      [2, 6],
      [8, 6]
    ])
    if (!a || !b) throw new Error('fils refusés')
    store.clearSelection()
    store.selectedWires = [a, b]
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'pointermove', at(store, 7.8, 2))
    expect(wrapper.find('.end-grab').exists()).toBe(false)
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 7.8, 2))
    await fire(svg, 'pointermove', at(store, 7.8, 4))
    await fire(svg, 'pointerup', at(store, 7.8, 4))
    expect(store.doc.wires.map((wire) => wire.points)).toEqual([
      [
        [2, 4],
        [8, 4]
      ],
      [
        [2, 8],
        [8, 8]
      ]
    ])
  })

  it('sur un composant, c’est lui qu’on déplace ; sur le fil qui arrive à sa broche, le bout', async () => {
    const store = withResistor()
    // Un fil part de la broche de droite, en (6, 4).
    const lead = store.addWire([
      [6, 4],
      [10, 4]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // Au-dessus du composant, tout près de la broche : rien ne s'annonce, et il se déplace.
    await fire(wrapper.get('.instance .hit'), 'pointermove', at(store, 5.8, 4.2))
    expect(wrapper.find('.end-grab').exists()).toBe(false)
    await fire(wrapper.get('.instance .hit'), 'pointerdown', at(store, 5.8, 4.2))
    await fire(svg, 'pointermove', at(store, 5.8, 6.2))
    await fire(svg, 'pointerup', at(store, 5.8, 6.2))
    expect(store.doc.components[0]).toMatchObject({ x: 2, y: 5 })
    expect(store.doc.wires[0]?.points[0]).toEqual([6, 6])
    store.undo()
    store.clearSelection()
    // Sur le fil, près de la broche : le bout se détache et va ailleurs ; le composant reste.
    await fire(wrapper.get('.wire-hit'), 'pointerdown', at(store, 6.3, 4))
    await fire(svg, 'pointermove', at(store, 6, 8))
    // Posé sur une broche, la cible le dirait ; ici, il n'y en a pas.
    expect(wrapper.get('.end-drop').classes()).not.toContain('on-pin')
    await fire(svg, 'pointerup', at(store, 6, 8))
    expect(store.selectedWires).toEqual([lead])
    expect(store.doc.wires[0]?.points[0]).toEqual([6, 8])
    expect(store.doc.wires[0]?.points.at(-1)).toEqual([10, 4])
    expect(store.doc.components[0]).toMatchObject({ x: 2, y: 3 })
    // Ramené sur l'autre broche : la cible passe au vert.
    await fire(svg, 'pointerdown', at(store, 6.1, 8.2))
    await fire(svg, 'pointermove', at(store, 2, 4))
    expect(wrapper.get('.end-drop').classes()).toContain('on-pin')
    await fire(svg, 'pointerup', at(store, 2, 4))
    expect(store.doc.wires[0]?.points[0]).toEqual([2, 4])
  })

  it('un double-clic sur un bout posé sur un autre fil ne tire pas de nouveau fil', async () => {
    const store = useSchematicStore()
    store.addWire([
      [2, 2],
      [10, 2]
    ])
    // Une branche qui part du milieu du premier fil : une jonction en (6, 2), un bout libre en (6, 6).
    const branch = store.addWire([
      [6, 2],
      [6, 6]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    await fire(svg, 'dblclick', at(store, 6.2, 2.1))
    expect(store.tool).toBe('select')
    expect(store.drawing).toBeNull()
    // Sur son bout libre : son étiquette, comme avant.
    await fire(svg, 'dblclick', at(store, 6.1, 5.8))
    expect(wrapper.emitted('editWireEnd')).toEqual([[branch, 1]])
    // Ailleurs sur un fil : un nouveau fil part de là.
    await fire(svg, 'dblclick', at(store, 8.1, 2.1))
    expect(store.tool).toBe('wire')
    expect(store.drawing?.points).toEqual([[8, 2]])
  })
})

describe('canevas du montage : barre d’état', () => {
  it('dit où est l’élément sélectionné ; pour un fil, son départ, son arrivée et l’écart', async () => {
    const store = withResistor()
    const part = store.doc.components[0]?.id
    // Un fil coudé de (6, 4) à (12, 9).
    const wire = store.addWire([
      [6, 4],
      [12, 4],
      [12, 9]
    ])
    const text = store.addLabelBox({ x: 1, y: 12, w: 4, h: 1 })
    if (!part || !wire) throw new Error('montage incomplet')
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const readout = (): string | null => {
      const found = wrapper.find('.canvas-status .selected')
      return found.exists() ? found.text() : null
    }
    // Rien de sélectionné : rien à dire.
    expect(readout()).toBeNull()
    store.selection = [part]
    await nextTick()
    expect(readout()).toBe('Sélection : x 2   y 3')
    // La sélection se déplace : la barre suit.
    store.moveSelection(5, -4)
    await nextTick()
    expect(readout()).toBe('Sélection : x 7   y −1')
    store.undo()
    store.clearSelection()
    store.selectedWires = [wire]
    await nextTick()
    // L'écart entre les deux bouts, sur chaque axe : pas la longueur du fil (11 cellules ici).
    expect(readout()).toBe('Sélection : départ (6 ; 4)   arrivée (12 ; 9)   Δx 6   Δy 5')
    store.clearSelection()
    store.selectedLabels = [text]
    await nextTick()
    expect(readout()).toBe('Sélection : x 1   y 12')
    // À plusieurs : leur nombre.
    store.selection = [part]
    store.selectedWires = [wire]
    await nextTick()
    expect(readout()).toBe('Sélection : 3 éléments')
    wrapper.unmount()
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

describe('canevas du montage : composant extensible', () => {
  /** Un connecteur de trois contacts en (10, 10), seul sélectionné. */
  function withHeader(): { store: ReturnType<typeof useSchematicStore>; id: string } {
    const store = useSchematicStore()
    store.startPlacing(header())
    const id = store.placeAt(10, 10)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    // Comme après une pose sur le canevas : le composant posé est sélectionné.
    store.selection = [id]
    return { store, id }
  }

  it('montre une poignée à chaque bout du composant seul sélectionné', async () => {
    const { store, id } = withHeader()
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    await nextTick()
    // Seul sélectionné : ses deux poignées sont là, une flèche à chaque bout, à mi-hauteur.
    expect(store.selection).toEqual([id])
    const grips = wrapper.findAll('.stretch-handle')
    expect(grips).toHaveLength(2)
    /** Abscisses des trois sommets d'une flèche (sa pointe d'abord), et ordonnée de sa pointe. */
    const arrow = (index: number): { xs: number[]; tipY: number } => {
      const d = grips[index]?.get('.stretch-arrow').attributes('d') ?? ''
      const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      return {
        xs: [numbers[0] ?? NaN, numbers[2] ?? NaN, numbers[4] ?? NaN],
        tipY: numbers[1] ?? NaN
      }
    }
    const start = arrow(0)
    const end = arrow(1)
    expect([start.tipY, end.tipY]).toEqual([11, 11])
    // Elles sont hors du cadre pointillé de la sélection, qui déborde le composant (de 10 à 14)
    // de 0,15 cellule, et pointent vers l'extérieur : la pointe est le sommet le plus éloigné.
    expect(Math.max(...start.xs)).toBeLessThan(10 - 0.15)
    expect(Math.min(...end.xs)).toBeGreaterThan(14 + 0.15)
    expect(start.xs[0]).toBe(Math.min(...start.xs))
    expect(end.xs[0]).toBe(Math.max(...end.xs))
    // Autour de chaque flèche, un disque à saisir, plus large qu'elle.
    expect(wrapper.findAll('.stretch-handle .stretch-hit')).toHaveLength(2)
    expect(grips.map((grip) => (grip.element as SVGElement).style.cursor)).toEqual([
      'ew-resize',
      'ew-resize'
    ])
    // Sans sélection, ou pour un composant ordinaire : pas de poignée.
    store.clearSelection()
    await nextTick()
    expect(wrapper.findAll('.stretch-handle')).toHaveLength(0)
    store.startPlacing(resistor())
    const plain = store.placeAt(0, 0)
    store.stopPlacing()
    if (plain) store.selection = [plain]
    await nextTick()
    expect(wrapper.findAll('.stretch-handle')).toHaveLength(0)
    wrapper.unmount()
  })

  it('tirer la poignée de fin ajoute des contacts, avec aperçu, en une commande', async () => {
    const { store, id } = withHeader()
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    await nextTick()
    const svg = wrapper.get('svg.schematic')
    const pins = (): number => wrapper.findAll('.pins circle:not(.unconnected)').length
    const before = pins()
    await fire(wrapper.findAll('.stretch-handle')[1]!, 'pointerdown', at(store, 14, 11))
    // Deux cellules plus loin : deux contacts de plus, déjà dessinés, rien d'enregistré.
    await fire(svg, 'pointermove', at(store, 16.1, 11.3))
    expect(store.doc.components[0]?.count).toBe(3)
    expect(pins()).toBe(before + 2)
    // La poignée de fin suit le bout du composant, deux cellules plus loin.
    const moved = Number(wrapper.findAll('.stretch-handle .stretch-hit')[1]?.attributes('cx'))
    expect(moved).toBeGreaterThan(16.15)
    expect(moved).toBeLessThan(17)
    await fire(svg, 'pointerup', at(store, 16.1, 11.3))
    expect(store.doc.components[0]).toMatchObject({ id, x: 10, count: 5 })
    expect(store.undoLabel).toBe('Étirer le composant')
    // Revenir au point de départ ne fait pas de commande.
    const after = store.doc
    await fire(wrapper.findAll('.stretch-handle')[1]!, 'pointerdown', at(store, 16, 11))
    await fire(svg, 'pointermove', at(store, 16.3, 11))
    await fire(svg, 'pointerup', at(store, 16.3, 11))
    expect(store.doc).toBe(after)
    wrapper.unmount()
  })

  it('tirer la poignée de début allonge de l’autre côté, la fin en place', async () => {
    const { store } = withHeader()
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    await nextTick()
    const svg = wrapper.get('svg.schematic')
    await fire(wrapper.findAll('.stretch-handle')[0]!, 'pointerdown', at(store, 10, 11))
    await fire(svg, 'pointermove', at(store, 8.9, 11))
    await fire(svg, 'pointerup', at(store, 8.9, 11))
    expect(store.doc.components[0]).toMatchObject({ x: 9, count: 4 })
    // La broche du bout n'a pas bougé.
    expect(store.pinRefs.at(-1)?.point).toEqual([14, 11])
    // Pousser la poignée vers le composant le raccourcit, jusqu'à son minimum.
    await fire(wrapper.findAll('.stretch-handle')[0]!, 'pointerdown', at(store, 9, 11))
    await fire(svg, 'pointermove', at(store, 30, 11))
    await fire(svg, 'pointerup', at(store, 30, 11))
    expect(store.doc.components[0]).toMatchObject({ x: 12, count: 1 })
    wrapper.unmount()
  })
})

describe('canevas du montage : fil nu et pont', () => {
  it('dessine un fil nu en métal avec ses soudures, un pont en courbe', async () => {
    const store = useSchematicStore()
    store.startPlacing(resistor())
    store.placeAt(2, 0)
    store.placeAt(2, 4)
    store.stopPlacing()
    store.clearSelection()
    const bare = store.addWire(
      [
        [2, 1],
        [2, 5]
      ],
      null,
      'bare'
    )
    store.addWire(
      [
        [6, 1],
        [12, 1]
      ],
      '#d62828',
      'jumper'
    )
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    await nextTick()
    // Le fil nu : un liseré sombre sous un trait d'étain, et une soudure par broche.
    const edge = wrapper.get('.wires .wire-edge')
    expect(edge.attributes('stroke')).toBe('#59616a')
    expect(wrapper.get('.wires .wire-bare').attributes('stroke')).toBe('#dfe5ea')
    expect(wrapper.findAll('.solders .solder')).toHaveLength(2)
    // Une broche soudée se voit : un point de couleur vive, cerné de sombre.
    expect(wrapper.get('.solders .solder').attributes('fill')).toBe('#f5a524')
    // Le pont : une courbe de A à B, dans sa couleur, bombée vers le haut.
    const jumper = wrapper.get('.wires .wire-jumper')
    expect(jumper.attributes('d')).toBe('M 6 1 Q 9 -1.16 12 1')
    expect(jumper.attributes('stroke')).toBe('#d62828')
    // Le fil nu prend la couleur qu'on lui donne, sur le même liseré.
    if (!bare) throw new Error('fil refusé')
    store.selectedWires = [bare]
    store.setCurrentColor('#b45309')
    await nextTick()
    expect(wrapper.get('.wires .wire-bare').attributes('stroke')).toBe('#b45309')
    expect(wrapper.get('.wires .wire-edge').attributes('stroke')).toBe('#59616a')
    wrapper.unmount()
  })

  it('l’outil Pont : un clic au départ, un clic à l’arrivée', async () => {
    const store = useSchematicStore()
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    const svg = wrapper.get('svg.schematic')
    store.startWireTool('jumper')
    await nextTick()
    await fire(svg, 'pointerdown', at(store, 2, 2))
    await fire(svg, 'pointerup', at(store, 2, 2))
    expect(store.doc.wires).toHaveLength(0)
    // L'aperçu est déjà une courbe, du départ au pointeur.
    await fire(svg, 'pointermove', at(store, 7, 4))
    expect(wrapper.get('.drawing .pending').attributes('d')).toMatch(/^M 2 2 Q /)
    await fire(svg, 'pointerdown', at(store, 7, 4))
    expect(store.doc.wires).toMatchObject([
      {
        kind: 'jumper',
        points: [
          [2, 2],
          [7, 4]
        ]
      }
    ])
    // L'outil reste actif, prêt pour le pont suivant.
    expect(store.tool).toBe('wire')
    expect(store.drawing).toBeNull()
    wrapper.unmount()
  })

  it('glisser le bout d’un pont le pose où l’on veut, sans coude', async () => {
    const store = useSchematicStore()
    const id = store.addWire(
      [
        [2, 2],
        [8, 2]
      ],
      '#d62828',
      'jumper'
    )
    if (!id) throw new Error('pont refusé')
    store.selectedWires = [id]
    const wrapper = mount(SchematicCanvas, { attachTo: document.body })
    await nextTick()
    const svg = wrapper.get('svg.schematic')
    const handles = wrapper.findAll('.vertex-handle')
    expect(handles).toHaveLength(2)
    await fire(handles[1]!, 'pointerdown', at(store, 8, 2))
    await fire(svg, 'pointermove', at(store, 7, 5))
    await fire(svg, 'pointerup', at(store, 7, 5))
    expect(store.doc.wires[0]?.points).toEqual([
      [2, 2],
      [7, 5]
    ])
    wrapper.unmount()
  })
})

describe('canevas du montage : plaque à deux faces', () => {
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

  /** La plaque en (0, 0) avec son dessous (de x = 8 à 14), une LED enfichée en (1, 2) et (3, 2). */
  function withBoard(): {
    store: ReturnType<typeof useSchematicStore>
    plate: string
    part: string
  } {
    const store = useSchematicStore()
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    store.startPlacing(led())
    const part = store.placeAt(1, 1)
    store.stopPlacing()
    if (!plate || !part) throw new Error('pose refusée')
    store.setInstanceUnderside(plate, true)
    store.clearSelection()
    return { store, plate, part }
  }

  it('dessine le dessous à droite, retourné, avec les pattes qui y ressortent', async () => {
    const { store, plate } = withBoard()
    const wrapper = mount(SchematicCanvas)
    await nextTick()
    // Le même dessin, retourné autour de l'axe x = 7 : x devient 14 − x.
    const underside = wrapper.get('g.underside')
    expect(underside.attributes('transform')).toBe('matrix(-1 0 0 1 14 0)')
    expect(underside.find('.hole-pads').exists()).toBe(true)
    // Entre les deux faces, le pli : un trait pointillé en deux tronçons, et la flèche.
    const hinge = wrapper.get('.faces-hinge')
    expect(hinge.findAll('line').map((line) => line.attributes('x1'))).toEqual(['7', '7'])
    expect(hinge.get('line').attributes('stroke-dasharray')).toBe('0.25 0.25')
    expect(hinge.get('path').attributes('d')).toBe('M 6.4 2 Q 7 1.4 7.6 2')
    expect(hinge.find('polygon').exists()).toBe(true)
    // Les deux pattes de la LED, vues de dessous : une goutte d'étain sur leur pastille.
    const drops = wrapper
      .findAll('.through-marks .through')
      .map((drop) => [drop.attributes('cx'), drop.attributes('cy')])
    expect(drops).toEqual([
      ['13', '2'],
      ['11', '2']
    ])
    // Une marque de couleur vive, cernée de sombre : elle se voit sur les pastilles.
    expect(wrapper.get('.through').attributes('fill')).toBe('#f5a524')
    expect(wrapper.get('.through').attributes('stroke')).toBe('#6b3f00')
    // La plaque sélectionnée : un cadre par face.
    store.selection = [plate]
    await nextTick()
    expect(wrapper.findAll('rect.selection')).toHaveLength(2)
    // Le dessous masqué, il ne reste que le dessus.
    store.setInstanceUnderside(plate, false)
    await nextTick()
    expect(wrapper.find('g.underside').exists()).toBe(false)
    expect(wrapper.find('.faces-hinge').exists()).toBe(false)
    expect(wrapper.find('.through').exists()).toBe(false)
    expect(wrapper.findAll('rect.selection')).toHaveLength(1)
  })

  it('montre, vu de l’autre face, le trou que survole le pointeur', async () => {
    const { store } = withBoard()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // Sur le trou (1, 2) du dessus : il est en (13, 2) dessous.
    await fire(svg, 'pointermove', at(store, 1.1, 2.1))
    const ring = wrapper.get('.twin-mark')
    expect([ring.attributes('cx'), ring.attributes('cy')]).toEqual(['13', '2'])
    // Entre deux trous, ou hors de la plaque : rien.
    await fire(svg, 'pointermove', at(store, 1.5, 2.5))
    expect(wrapper.find('.twin-mark').exists()).toBe(false)
    await fire(svg, 'pointermove', at(store, 20, 2))
    expect(wrapper.find('.twin-mark').exists()).toBe(false)
  })

  it('glisser la plaque emmène la LED et le fil du dessous, pendant le geste comme à la fin', async () => {
    const { store, plate } = withBoard()
    store.addWire([
      [13, 2],
      [13, 3],
      [11, 3],
      [11, 2]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // Par son dessous : c'est toujours la plaque qu'on prend.
    await fire(wrapper.get('g.underside .hit'), 'pointerdown', at(store, 9, 0.5))
    expect(store.selection).toEqual([plate])
    await fire(svg, 'pointermove', at(store, 12, 2.5))
    // Pendant le geste : la LED suit, le fil du dessous aussi, le dessous reste à droite.
    const shown = wrapper.findAll('g.instance').map((group) => group.attributes('transform'))
    expect(shown).toContain('matrix(1 0 0 1 4 3)')
    expect(wrapper.get('g.underside').attributes('transform')).toBe('matrix(-1 0 0 1 20 0)')
    expect(wrapper.get('.faces-hinge line').attributes('x1')).toBe('10')
    expect(wrapper.get('.wires .wire').attributes('d')).toContain('M 16 4')
    await fire(svg, 'pointerup', at(store, 12, 2.5))
    expect(store.selection).toEqual([plate])
    expect(store.doc.components.map((instance) => [instance.x, instance.y])).toEqual([
      [3, 2],
      [4, 3]
    ])
    expect(store.doc.wires[0]?.points.at(0)).toEqual([16, 4])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
  })

  it('Ctrl pendant qu’on glisse la plaque : elle s’écarte de son pli, son dessous autant', async () => {
    const { store, plate } = withBoard()
    store.addWire([
      [13, 2],
      [13, 3],
      [11, 3],
      [11, 2]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    const flip = (): string | undefined => wrapper.get('g.underside').attributes('transform')
    const shown = (): (string | undefined)[] =>
      wrapper.findAll('g.instance').map((group) => group.attributes('transform'))
    await fire(wrapper.get('g.instance.board .hit'), 'pointerdown', at(store, 4.5, 0.5))
    // Sans Ctrl, deux cellules à gauche et une plus bas : les deux faces vont ensemble.
    await fire(svg, 'pointermove', at(store, 2.5, 1.5))
    expect(flip()).toBe('matrix(-1 0 0 1 10 0)')
    // Ctrl enfoncée en cours de geste : le pli reste en x = 7 ; le dessus et la LED vont à
    // gauche, le dessous et son fil à droite, d'autant.
    await fire(svg, 'pointermove', at(store, 2.5, 1.5), CTRL)
    expect(flip()).toBe('matrix(-1 0 0 1 14 0)')
    expect(wrapper.get('.faces-hinge line').attributes('x1')).toBe('7')
    expect(shown()).toContain('matrix(1 0 0 1 -2 1)')
    expect(shown()).toContain('matrix(1 0 0 1 -1 2)')
    expect(wrapper.get('.wires .wire').attributes('d')).toContain('M 15 3')
    // Un cadre par face, là où elles vont.
    expect(
      wrapper.findAll('rect.selection').map((frame) => Number(frame.attributes('width')))
    ).toHaveLength(2)
    await fire(svg, 'pointerup', at(store, 2.5, 1.5), CTRL)
    expect(store.selection).toEqual([plate])
    expect(store.doc.components.map((instance) => [instance.x, instance.y])).toEqual([
      [-2, 1],
      [-1, 2]
    ])
    expect(store.doc.components[0]?.facesGap).toBe(6)
    expect(store.doc.wires[0]?.points.at(0)).toEqual([15, 3])
    expect(store.connectivity.unconnectedPinKeys.size).toBe(0)
    // Par son dessous, le geste se lit de l'autre côté du pli : le tirer à droite écarte encore.
    await nextTick()
    await fire(wrapper.get('g.underside .hit'), 'pointerdown', at(store, 11, 2.5))
    await fire(svg, 'pointermove', at(store, 12, 2.5), CTRL)
    expect(flip()).toBe('matrix(-1 0 0 1 14 0)')
    await fire(svg, 'pointerup', at(store, 12, 2.5), CTRL)
    expect(store.doc.components[0]).toMatchObject({ x: -3, y: 1, facesGap: 8 })
    // Relâchée sans Ctrl, c'est un déplacement ordinaire : l'écart ne change pas.
    await nextTick()
    await fire(wrapper.get('g.instance.board .hit'), 'pointerdown', at(store, -1.5, 1.5))
    await fire(svg, 'pointermove', at(store, 0.5, 1.5), CTRL)
    await fire(svg, 'pointermove', at(store, 0.5, 1.5))
    await fire(svg, 'pointerup', at(store, 0.5, 1.5))
    expect(store.doc.components[0]).toMatchObject({ x: -1, y: 1, facesGap: 8 })
  })

  it('montre sur l’autre face l’empreinte d’un composant enfiché, en une silhouette', async () => {
    const store = useSchematicStore()
    store.startPlacing(board())
    const plate = store.placeAt(0, 0)
    const part = led()
    part.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 0, y: 0, w: 8, h: 8, rx: 0, style: DEFAULT_SHAPE_STYLE },
        { kind: 'rect', x: 0, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE, footprint: true }
      ]
    }
    store.startPlacing(part)
    const id = store.placeAt(1, 1)
    store.stopPlacing()
    if (!plate || !id) throw new Error('pose refusée')
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    await nextTick()
    const drawn = (): number =>
      wrapper.findAll('g.instance:not(.board) .component-graphic rect').length
    // Sans dessous montré : le composant seul, sans son empreinte.
    expect(wrapper.find('g.footprint').exists()).toBe(false)
    expect(drawn()).toBe(1)
    store.setInstanceUnderside(plate, true)
    await nextTick()
    // L'empreinte : la silhouette des formes d'empreinte du composant, retournée sur l'autre
    // face (x devient 14 − x) ; le composant lui-même ne change pas.
    const footprint = wrapper.get('g.footprint')
    expect(footprint.attributes('transform')).toBe('matrix(-1 0 0 1 14 0)')
    expect(footprint.get('g').attributes('transform')).toBe('matrix(1 0 0 1 1 1)')
    // Un voile, puis le contour que le masque laisse des traits : un filet sombre et des tirets
    // clairs, dans l'allure commune aux empreintes.
    const mask = `empreinte-${plate}-${id}`
    expect(footprint.get('mask').attributes('id')).toBe(mask)
    expect(footprint.get('.footprint-outline').attributes('mask')).toBe(`url(#${mask})`)
    expect(
      footprint.findAll('.footprint-dashes').map((path) => path.attributes('stroke-dasharray'))
    ).toEqual(['0.24 0.18'])
    expect(footprint.find('.footprint-shadow path').exists()).toBe(true)
    expect(drawn()).toBe(1)
    // Elle se dessine avec la plaque, sous les pattes qui ressortent.
    const order = wrapper
      .findAll('g.underside, g.footprint, g.through-marks')
      .map((group) => group.classes().find((name) => name !== 'instance' && name !== 'board'))
    expect(order).toEqual(['underside', 'footprint', 'through-marks'])
    // Elle suit le composant qu'on glisse sur la plaque.
    await fire(wrapper.get('g.instance:not(.board) .hit'), 'pointerdown', at(store, 2, 1.5))
    await fire(wrapper.get('svg.schematic'), 'pointermove', at(store, 3, 1.5))
    expect(footprint.get('g').attributes('transform')).toBe('matrix(1 0 0 1 2 1)')
    await fire(wrapper.get('svg.schematic'), 'pointerup', at(store, 3, 1.5))
  })

  it('sur la plaque, près du bout d’un fil : c’est le bout qu’on saisit, pas la plaque', async () => {
    const { store, plate } = withBoard()
    const wire = store.addWire([
      [5, 1],
      [5, 3]
    ])
    store.clearSelection()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // L'appui tombe sur la plaque, à côté du fil et tout près de son bout.
    await fire(wrapper.get('g.instance.board .hit'), 'pointerdown', at(store, 5.2, 3.3))
    expect([store.selection, store.selectedWires]).toEqual([[], [wire]])
    await fire(svg, 'pointermove', at(store, 3.2, 3.3))
    await fire(svg, 'pointerup', at(store, 3.2, 3.3))
    expect(store.doc.wires[0]?.points.at(-1)).toEqual([3, 3])
    expect(store.doc.components[0]).toMatchObject({ x: 0, y: 0 })
    // Plus loin du fil, c'est la plaque qu'on prend.
    store.clearSelection()
    await fire(wrapper.get('g.instance.board .hit'), 'pointerdown', at(store, 1.5, 3.5))
    expect(store.selection).toEqual([plate])
    await fire(svg, 'pointerup', at(store, 1.5, 3.5))
  })

  it('un lasso ne prend la plaque que s’il l’entoure : ce qu’elle porte se prend sans elle', async () => {
    const { store, plate, part } = withBoard()
    const wrapper = mount(SchematicCanvas)
    const svg = wrapper.get('svg.schematic')
    // Parti du vide, le lasso couvre la LED et une partie de la plaque.
    await fire(svg, 'pointerdown', at(store, -2, -2))
    await fire(svg, 'pointermove', at(store, 4, 3.5))
    await fire(svg, 'pointerup', at(store, 4, 3.5))
    expect(store.selection).toEqual([part])
    // Autour du dessus en entier : la plaque est prise.
    store.clearSelection()
    await fire(svg, 'pointerdown', at(store, -2, -2))
    await fire(svg, 'pointermove', at(store, 6.5, 4.5))
    await fire(svg, 'pointerup', at(store, 6.5, 4.5))
    expect(store.selection).toEqual([plate, part])
  })
})
