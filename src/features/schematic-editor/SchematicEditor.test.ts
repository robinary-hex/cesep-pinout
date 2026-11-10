// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyComponent } from '@/domain'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { menuEntry, menuLabels, rightClick, subMenuLabels } from '@/ui/testing/menus'
import SchematicEditor from './SchematicEditor.vue'
import { useSchematicStore } from './store'

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

type Store = ReturnType<typeof useSchematicStore>

/** Position à l'écran d'un point de la grille : jsdom place le SVG en (0, 0). */
function at(store: Store, x: number, y: number): [number, number] {
  return [store.view.panX + x * store.cellPx, store.view.panY + y * store.cellPx]
}

describe('menu contextuel du montage', () => {
  it('sur un fil : sommet à l’endroit du clic, coupe, net, extrémités et ordre en sous-menus', async () => {
    const store = useSchematicStore()
    const id = store.addWire([
      [0, 0],
      [6, 0]
    ])
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    rightClick(wrapper.get('.wire-hit').element, ...at(store, 3.1, 0.1))
    await flushPromises()
    expect(store.selectedWires).toEqual([id])
    expect(menuLabels()).toEqual([
      'Ajouter un sommet ici',
      'Couper le fil ici',
      'Extrémités libres',
      'Sélectionner tout le net',
      'Ordre',
      'Dupliquer',
      'Copier',
      'Propriétés',
      'Supprimer'
    ])
    menuEntry('Ordre').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Avancer', 'Reculer', 'Premier plan', 'Arrière-plan'])
    menuEntry('Ajouter un sommet ici').click()
    await flushPromises()
    expect(store.doc.wires[0]?.points).toEqual([
      [0, 0],
      [3, 0],
      [6, 0]
    ])
    // Sur ce sommet : le retirer ; ici, pas d'ajout.
    rightClick(wrapper.get('.wire-hit').element, ...at(store, 3, 0))
    await flushPromises()
    expect(menuLabels().slice(0, 2)).toEqual(['Supprimer ce sommet', 'Couper le fil ici'])
    menuEntry('Couper le fil ici').click()
    await flushPromises()
    expect(store.doc.wires).toHaveLength(2)
    wrapper.unmount()
  })

  it('sur une étiquette : styles et alignement en sous-menus, texte sur plusieurs lignes', async () => {
    const store = useSchematicStore()
    const id = store.addLabelBox({ x: 2, y: 2, w: 6, h: 2 })
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.text-label').element, ...at(store, 4, 3))
      await flushPromises()
    }
    await open()
    expect(menuLabels().slice(0, 3)).toEqual(['Modifier le texte…', 'Style', 'Alignement'])
    menuEntry('Style').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Gras', 'Italique', 'Souligné', 'Barré', 'Vertical', 'Fond'])
    menuEntry('Fond').click()
    await flushPromises()
    expect(store.doc.labels[0]).toMatchObject({ id, background: true })
    await open()
    menuEntry('Alignement').click()
    await flushPromises()
    menuEntry('Droite').click()
    await flushPromises()
    expect(store.doc.labels[0]?.anchor).toBe('end')
    await open()
    menuEntry('Modifier le texte…').click()
    await flushPromises()
    const area = wrapper.get('.prompt textarea')
    await area.setValue('Pompe\n12 V')
    await area.trigger('keydown', { key: 'Enter' })
    expect(store.doc.labels[0]?.text).toBe('Pompe\n12 V')
    wrapper.unmount()
  })

  it('sur un composant : ouvrir sa définition dans l’éditeur, sélectionner ses fils', async () => {
    const store = useSchematicStore()
    const def = createEmptyComponent('resistor', 'Résistance')
    def.pins = [
      { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
      { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
    ]
    store.startPlacing(def)
    const instance = store.placeAt(2, 3)
    store.stopPlacing()
    const lead = store.addWire([
      [6, 4],
      [9, 4]
    ])
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.instance .hit').element, ...at(store, 4, 3.5))
      await flushPromises()
    }
    await open()
    menuEntry('Modifier dans l’éditeur de composants').click()
    expect(wrapper.emitted('editComponent')).toEqual([['resistor']])
    await flushPromises()
    await open()
    menuEntry('Sélectionner les fils reliés').click()
    await flushPromises()
    expect(store.selection).toEqual([instance])
    expect(store.selectedWires).toEqual([lead])
    wrapper.unmount()
  })
})
