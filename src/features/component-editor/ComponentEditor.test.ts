// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_SHAPE_STYLE } from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import ComponentEditor from './ComponentEditor.vue'
import { useComponentEditorStore } from './store'

beforeEach(() => {
  setBridge(new FakeFs())
  setActivePinia(createPinia())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
})

afterEach(() => {
  setBridge(null)
  document.body.innerHTML = ''
})

async function press(target: { element: Element }, extra: MouseEventInit = {}): Promise<void> {
  target.element.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...extra })
  )
  await nextTick()
}

async function key(name: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  await nextTick()
}

function withRectangle(): ReturnType<typeof useComponentEditorStore> {
  const store = useComponentEditorStore()
  store.addPrimitive(
    { kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE },
    'Ajouter un rectangle'
  )
  store.selection = null
  return store
}

describe('éditeur de composants : panneau de propriétés', () => {
  it('est replié au départ ; un clic sur une forme le montre, flottant, et il repart avec la sélection', async () => {
    const store = withRectangle()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    expect(wrapper.find('.inspector').exists()).toBe(false)
    await press(wrapper.get('.component-graphic .interactive'))
    expect(store.selectedIndexes).toEqual([0])
    expect(wrapper.get('.inspector').classes()).toContain('floating')
    expect(wrapper.get('.inspector').text()).toContain('Rectangle')
    // Plus de croix à côté du nom de la forme : la seule du panneau le masque.
    expect(
      wrapper.findAll('.inspector .block button').some((button) => button.text() === '✕')
    ).toBe(false)
    // Clic hors de la feuille : la sélection tombe, le panneau se referme.
    await press(wrapper.get('.canvas-scroll'))
    expect(store.selection).toBeNull()
    expect(wrapper.find('.inspector').exists()).toBe(false)
    wrapper.unmount()
  })

  it('la touche I ou le bouton de la barre l’ouvrent pour de bon, ancré, et le referment', async () => {
    const store = withRectangle()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    await key('i')
    expect(wrapper.get('.inspector').classes()).not.toContain('floating')
    // Sans sélection, il montre le composant ; il reste quand on sélectionne puis désélectionne.
    expect(wrapper.get('.inspector').text()).toContain('Composant')
    await press(wrapper.get('.component-graphic .interactive'))
    await press(wrapper.get('.canvas-scroll'))
    expect(wrapper.find('.inspector').exists()).toBe(true)
    await wrapper.get('button[title^="Afficher ou masquer le panneau"]').trigger('click')
    expect(store.inspectorOpen).toBe(false)
    expect(wrapper.find('.inspector').exists()).toBe(false)
    // La croix du panneau le masque aussi.
    await key('i')
    await wrapper.get('.inspector .panel-head button').trigger('click')
    expect(wrapper.find('.inspector').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('éditeur de composants : clic hors de la feuille', () => {
  it('quitte l’outil de dessin et revient à la sélection, en gardant la forme tracée', async () => {
    const store = withRectangle()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    store.tool = 'rect'
    store.selectPrimitives([0])
    await press(wrapper.get('.canvas-scroll'))
    expect(store.tool).toBe('select')
    expect(store.selectedIndexes).toEqual([0])
    // Un second clic hors de la feuille, en sélection, désélectionne.
    await press(wrapper.get('.canvas-scroll'))
    expect(store.selection).toBeNull()
    wrapper.unmount()
  })

  it('termine la polyligne en cours avant de quitter l’outil', async () => {
    const store = useComponentEditorStore()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    store.tool = 'polyline'
    const svg = wrapper.get('svg.canvas')
    const at = (x: number, y: number): MouseEventInit => ({ clientX: x, clientY: y })
    await press(svg, at(60, 60))
    await press(svg, at(140, 60))
    await press(svg, at(140, 120))
    expect(store.doc.visual.primitives).toHaveLength(0)
    await press(wrapper.get('.canvas-scroll'))
    expect(store.tool).toBe('select')
    expect(store.doc.visual.primitives).toHaveLength(1)
    expect(store.doc.visual.primitives[0]).toMatchObject({ kind: 'polyline', closed: false })
    wrapper.unmount()
  })
})
