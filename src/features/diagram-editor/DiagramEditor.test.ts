// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_SPECS } from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { menuEntry, menuLabels, rightClick, subMenuLabels } from '@/ui/testing/menus'
import DiagramEditor from './DiagramEditor.vue'
import { useDiagramStore } from './store'

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

type Store = ReturnType<typeof useDiagramStore>

function at(store: Store, x: number, y: number): [number, number] {
  return [store.view.panX + x * store.cellPx, store.view.panY + y * store.cellPx]
}

describe('menu contextuel du diagramme', () => {
  it('dans le vide : pose une forme du catalogue à l’endroit du clic et ouvre son texte', async () => {
    const store = useDiagramStore()
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    rightClick(wrapper.get('svg.diagram').element, ...at(store, 20, 10))
    await flushPromises()
    expect(menuLabels()).toContain('Poser une forme ici')
    menuEntry('Poser une forme ici').click()
    await flushPromises()
    // Tout le catalogue, famille par famille.
    expect(subMenuLabels()).toHaveLength(17)
    expect(subMenuLabels().slice(0, 6)).toEqual([
      'Action',
      'Rectangle',
      'Décision',
      'Note',
      'Début / fin',
      'Entrée / sortie'
    ])
    expect(document.body.querySelectorAll('.context-menu.sub-menu .separator')).toHaveLength(3)
    menuEntry('Décision').click()
    await flushPromises()
    // Le losange est centré sur le point cliqué.
    const size = NODE_SPECS.diamond.defaultSize
    expect(store.doc.nodes[0]).toMatchObject({
      shape: 'diamond',
      x: Math.round(20 - size.w / 2),
      y: Math.round(10 - size.h / 2)
    })
    expect(wrapper.find('.node-editor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('sur un nœud : forme, texte, fond et ordre en sous-menus', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.clearSelection()
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.node .hit').element, ...at(store, 4, 3))
      await flushPromises()
    }
    await open()
    expect(store.selectedNodes).toEqual([id])
    expect(menuLabels()).toEqual([
      'Modifier le texte…',
      'Ajuster au texte',
      'Forme',
      'Texte',
      'Fond',
      'Ordre',
      'Dupliquer',
      'Copier',
      'Propriétés',
      'Supprimer'
    ])
    menuEntry('Forme').click()
    await flushPromises()
    menuEntry('Note').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.shape).toBe('note')
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual([
      'Gras',
      'Italique',
      'Souligné',
      'Barré',
      'Chasse fixe',
      '×1',
      '×1,5',
      '×2',
      '×2,5',
      '×3'
    ])
    menuEntry('Chasse fixe').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.font).toBe('mono')
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    menuEntry('×2').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.textScale).toBe(2)
    wrapper.unmount()
  })

  it('sur un lien : son étiquette (côté, fond, retrait) et ses sommets', async () => {
    const store = useDiagramStore()
    const id = store.addLink([
      [0, 0],
      [0, 10]
    ])
    if (!id) throw new Error('lien attendu')
    store.setLinkLabel(id, 'vrai')
    store.clearSelection()
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    const open = async (y: number): Promise<void> => {
      rightClick(wrapper.get('.link-hit').element, ...at(store, 0.1, y))
      await flushPromises()
    }
    await open(4)
    expect(menuLabels().slice(0, 5)).toEqual([
      'Étiquette : vrai…',
      'Étiquette de l’autre côté',
      'Fond de l’étiquette',
      'Retirer l’étiquette',
      'Ajouter un sommet ici'
    ])
    menuEntry('Étiquette de l’autre côté').click()
    await flushPromises()
    expect(store.doc.links[0]?.labelSide).toBe(-1)
    await open(4)
    menuEntry('Ajouter un sommet ici').click()
    await flushPromises()
    expect(store.doc.links[0]?.points).toEqual([
      [0, 0],
      [0, 4],
      [0, 10]
    ])
    await open(4)
    menuEntry('Supprimer ce sommet').click()
    await flushPromises()
    expect(store.doc.links[0]?.points).toHaveLength(2)
    await open(4)
    menuEntry('Retirer l’étiquette').click()
    await flushPromises()
    expect(store.doc.links[0]?.label).toBe('')
    wrapper.unmount()
  })
})

describe('diagramme : grouper par le menu et au clavier', () => {
  it('clic droit sur plusieurs éléments : Grouper ; la case « Groupes » montre ou cache le contour', async () => {
    const store = useDiagramStore()
    const a = store.addNode('rounded', 0, 0)
    const b = store.addNode('rounded', 0, 12)
    store.clearSelection()
    store.selectedNodes = [a, b]
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    expect(wrapper.find('.toolbar .check').exists()).toBe(false)
    rightClick(wrapper.get('.node .hit').element, ...at(store, 4, 3))
    await flushPromises()
    expect(menuLabels()).toContain('Grouper')
    expect(menuLabels()).not.toContain('Dégrouper')
    menuEntry('Grouper').click()
    await flushPromises()
    expect(store.groups).toEqual([{ id: 'g1', members: { node: [a, b], link: [], text: [] } }])
    expect(wrapper.get('.toolbar .check').text()).toBe('Groupes')
    expect(wrapper.find('.group-outline').exists()).toBe(true)
    await wrapper.get('.toolbar .check input').setValue(false)
    expect(store.showGroups).toBe(false)
    expect(wrapper.find('.group-outline').exists()).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', ctrlKey: true, shiftKey: true }))
    await flushPromises()
    expect(store.hasGroups).toBe(false)
    expect(wrapper.find('.toolbar .check').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }))
    expect(store.groups).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('panneau du diagramme', () => {
  it('ne porte pas de bouton pour tourner une barre : la touche R et le clic droit suffisent', async () => {
    const store = useDiagramStore()
    const id = store.addNode('bar', 0, 0)
    store.clearSelection()
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    rightClick(wrapper.get('.node .hit').element, ...at(store, 0, 0))
    await flushPromises()
    expect(store.selectedNodes).toEqual([id])
    expect(menuLabels()).toContain('Tourner')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    store.selectedNodes = [id]
    store.inspectorOpen = true
    await flushPromises()
    const buttons = wrapper.findAll('.inspector button').map((button) => button.text())
    expect(buttons).toContain('Dupliquer')
    expect(buttons).not.toContain('Tourner')
    wrapper.unmount()
  })
})
