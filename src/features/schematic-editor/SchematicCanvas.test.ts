// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createEmptyComponent, type ComponentDefinition } from '@/domain'
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
})
