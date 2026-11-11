// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_SHAPE_STYLE } from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { menuEntry, menuLabels, rightClick, subMenuLabels } from '@/ui/testing/menus'
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

describe('éditeur de composants : menu contextuel', () => {
  it('sur une forme : ordre en sous-menu, puis dupliquer, copier, propriétés, supprimer', async () => {
    const store = withRectangle()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    rightClick(wrapper.get('.component-graphic .interactive').element)
    await flushPromises()
    // La forme visée entre dans la sélection.
    expect(store.selectedIndexes).toEqual([0])
    expect(menuLabels()).toEqual(['Ordre', 'Dupliquer', 'Copier', 'Propriétés', 'Supprimer'])
    menuEntry('Ordre').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Avancer', 'Reculer', 'Premier plan', 'Arrière-plan'])
    menuEntry('Dupliquer').click()
    await flushPromises()
    expect(store.doc.visual.primitives).toHaveLength(2)
    wrapper.unmount()
  })

  it('sur une ligne : ses flèches ; sur un texte : son texte, sur plusieurs lignes', async () => {
    const store = useComponentEditorStore()
    store.addPrimitive(
      {
        kind: 'line',
        x1: 0,
        y1: 4,
        x2: 8,
        y2: 4,
        arrows: { start: false, middle: false, end: false },
        style: DEFAULT_SHAPE_STYLE
      },
      'Ajouter une ligne'
    )
    store.addPrimitive(
      {
        kind: 'text',
        x: 0,
        y: 0,
        w: 8,
        h: 4,
        text: 'R',
        size: 0.5,
        anchor: 'middle',
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
      },
      'Ajouter un texte'
    )
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    const shapes = wrapper.findAll('.component-graphic .interactive')
    rightClick(shapes[0]?.element ?? document.body)
    await flushPromises()
    expect(menuLabels().slice(0, 3)).toEqual([
      'Flèche au départ',
      'Flèche au centre',
      'Flèche à l’arrivée'
    ])
    menuEntry('Flèche à l’arrivée').click()
    await flushPromises()
    expect(store.doc.visual.primitives[0]).toMatchObject({ arrows: { end: true, start: false } })
    rightClick(shapes[1]?.element ?? document.body)
    await flushPromises()
    menuEntry('Modifier le texte…').click()
    await flushPromises()
    const area = wrapper.get('.prompt textarea')
    await area.setValue('10 k\nΩ')
    await area.trigger('keydown', { key: 'Enter' })
    expect(store.doc.visual.primitives[1]).toMatchObject({ kind: 'text', text: '10 k\nΩ' })
    wrapper.unmount()
  })

  it('sur une broche : la renommer, changer son type', async () => {
    const store = useComponentEditorStore()
    const id = store.addPin({ x: 0, y: 1 })
    store.selection = null
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.pin').element)
      await flushPromises()
    }
    await open()
    expect(store.selectedPinIds).toEqual([id])
    expect(menuLabels().slice(0, 2)).toEqual(['Renommer…', 'Type'])
    menuEntry('Type').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Entrée', 'Sortie', 'Bidirectionnelle', 'Alimentation'])
    menuEntry('Alimentation').click()
    await flushPromises()
    expect(store.doc.pins[0]?.kind).toBe('power')
    await open()
    menuEntry('Renommer…').click()
    await flushPromises()
    await wrapper.get('.prompt input').setValue('VCC')
    await wrapper.get('.prompt').trigger('submit')
    expect(store.doc.pins[0]?.name).toBe('VCC')
    wrapper.unmount()
  })

  it('dans le vide : coller à l’endroit du clic, importer une image, vue et panneau', async () => {
    const store = withRectangle()
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('svg.canvas').element, 200, 120)
      await flushPromises()
    }
    await open()
    expect(menuLabels()).toEqual([
      'Coller ici',
      'Tout sélectionner',
      'Importer une image…',
      'Ajuster à la fenêtre',
      'Zoom 100 %',
      'Panneau de propriétés'
    ])
    expect(menuEntry('Coller ici').disabled).toBe(true)
    menuEntry('Tout sélectionner').click()
    await flushPromises()
    store.copySelection()
    await open()
    menuEntry('Coller ici').click()
    await flushPromises()
    expect(store.doc.visual.primitives).toHaveLength(2)
    // La copie a son coin supérieur gauche là où l'on a cliqué, pas une cellule plus loin.
    const [original, copy] = store.doc.visual.primitives
    expect(copy).not.toMatchObject({
      x: (original?.kind === 'rect' ? original.x : 0) + 4,
      y: (original?.kind === 'rect' ? original.y : 0) + 4
    })
    wrapper.unmount()
  })
})

describe('éditeur de composants : groupes', () => {
  it('clic droit sur plusieurs formes : Grouper ; un clic prend le groupe, la case le montre ou le cache', async () => {
    const store = withRectangle()
    store.addPrimitive(
      { kind: 'rect', x: 14, y: 2, w: 4, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE },
      'Ajouter un rectangle'
    )
    store.selection = null
    const wrapper = mount(ComponentEditor, { attachTo: document.body })
    const shape = (index: number): { element: Element } =>
      wrapper.findAll('.component-graphic .interactive')[index] ?? wrapper.get('svg.canvas')
    expect(wrapper.find('.toolbar .check').exists()).toBe(false)
    store.selectAll()
    await nextTick()
    rightClick(shape(0).element)
    await flushPromises()
    expect(menuLabels()).toContain('Grouper')
    expect(menuLabels()).not.toContain('Dégrouper')
    menuEntry('Grouper').click()
    await flushPromises()
    expect(store.groups).toEqual([{ id: 'g1', indexes: [0, 1], pinIds: [] }])
    expect(wrapper.find('.group-outline').exists()).toBe(true)

    // La case « Groupes » arrive avec le premier groupe ; décochée, le contour disparaît.
    expect(wrapper.get('.toolbar .check').text()).toBe('Groupes')
    await wrapper.get('.toolbar .check input').setValue(false)
    expect(store.showGroups).toBe(false)
    expect(wrapper.find('.group-outline').exists()).toBe(false)

    // Un clic sur une forme prend tout le groupe ; Ctrl+clic, elle seule.
    const release = async (): Promise<void> => {
      wrapper
        .get('svg.canvas')
        .element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }))
      await nextTick()
    }
    store.selection = null
    await press(shape(1))
    expect(store.selectedIndexes).toEqual([0, 1])
    await release()
    store.selection = null
    await press(shape(1), { ctrlKey: true })
    expect(store.selectedIndexes).toEqual([1])
    await release()

    // Clic droit sur une forme du groupe : Dégrouper ; Ctrl+G regroupe la sélection.
    store.selection = null
    rightClick(shape(0).element)
    await flushPromises()
    expect(store.selectedIndexes).toEqual([0, 1])
    menuEntry('Dégrouper').click()
    await flushPromises()
    expect(store.hasGroups).toBe(false)
    expect(wrapper.find('.toolbar .check').exists()).toBe(false)
    await key('g')
    expect(store.hasGroups).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }))
    expect(store.groups).toHaveLength(1)
    wrapper.unmount()
  })
})
