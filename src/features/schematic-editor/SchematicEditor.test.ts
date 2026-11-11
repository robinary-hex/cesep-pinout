// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyComponent, type Primitive } from '@/domain'
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

describe('montage : grouper par le menu et au clavier', () => {
  it('clic droit sur plusieurs éléments : Grouper, puis Dégrouper ; Ctrl+G et Ctrl+Maj+G aussi', async () => {
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
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const checks = (): string[] => wrapper.findAll('.toolbar .check').map((label) => label.text())
    const wireHit = (index: number): Element =>
      wrapper.findAll('.wire-hit')[index]?.element ?? document.body
    expect(checks()).toEqual(['Broches', 'Non reliées'])
    store.clearSelection()
    store.selectedWires = [a, b]
    await flushPromises()
    rightClick(wireHit(0), ...at(store, 3, 0))
    await flushPromises()
    expect(menuLabels()).toContain('Grouper')
    expect(menuLabels()).not.toContain('Dégrouper')
    menuEntry('Grouper').click()
    await flushPromises()
    expect(store.groups).toHaveLength(1)
    // La case « Groupes » n'est dans la barre que si le montage a des groupes.
    expect(checks()).toEqual(['Broches', 'Non reliées', 'Groupes'])
    expect(wrapper.find('.group-outline').exists()).toBe(true)

    // Clic droit sur un seul membre : le groupe entier est pris, et il se défait d'ici.
    store.clearSelection()
    rightClick(wireHit(1), ...at(store, 3, 4))
    await flushPromises()
    expect([...store.selectedWires].sort()).toEqual([a, b].sort())
    expect(menuLabels()).toContain('Dégrouper')
    expect(menuLabels()).not.toContain('Grouper')
    menuEntry('Dégrouper').click()
    await flushPromises()
    expect(store.hasGroups).toBe(false)
    expect(checks()).toEqual(['Broches', 'Non reliées'])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }))
    expect(store.groups).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', ctrlKey: true, shiftKey: true }))
    expect(store.hasGroups).toBe(false)
    wrapper.unmount()
  })

  it('ne propose la valeur d’un texte variable que si le composant n’en a qu’un', async () => {
    const store = useSchematicStore()
    const variable = (name: string, y: number): Primitive => ({
      kind: 'text',
      x: 0,
      y,
      w: 8,
      h: 2,
      text: name,
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
    })
    const one = createEmptyComponent('resistor', 'Résistance')
    one.visual = { kind: 'drawing', primitives: [variable('valeur', 0)] }
    const two = createEmptyComponent('chip', 'Circuit')
    two.visual = { kind: 'drawing', primitives: [variable('nom', 0), variable('ref', 4)] }
    store.startPlacing(one)
    store.placeAt(0, 0)
    store.startPlacing(two)
    store.placeAt(10, 0)
    store.stopPlacing()
    store.clearSelection()
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const hit = (index: number): Element =>
      wrapper.findAll('.instance .hit')[index]?.element ?? document.body
    rightClick(hit(0), ...at(store, 2, 1))
    await flushPromises()
    expect(menuLabels().slice(0, 2)).toEqual(['valeur : (vide)…', 'Libellé…'])
    menuEntry('Copier').click()
    await flushPromises()
    // Deux textes variables : leurs valeurs se changent dans le panneau, pas dans le menu.
    rightClick(hit(1), ...at(store, 12, 1))
    await flushPromises()
    expect(menuLabels()[0]).toBe('Libellé…')
    expect(menuLabels().some((label) => label.includes('nom') || label.includes('ref'))).toBe(false)
    wrapper.unmount()
  })
})

describe('montage : variante d’un composant posé', () => {
  it('se change par le clic droit ou dans le panneau', async () => {
    const store = useSchematicStore()
    const def = createEmptyComponent('led', 'LED')
    def.variantName = 'Rouge'
    def.variants = [{ id: 'v1', name: 'Verte', size: def.size, visual: def.visual, pins: [] }]
    store.startPlacing(def)
    const id = store.placeAt(2, 3)
    store.stopPlacing()
    store.clearSelection()
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    rightClick(wrapper.get('.instance .hit').element, ...at(store, 4, 3.5))
    await flushPromises()
    expect(menuLabels()).toContain('Variante')
    menuEntry('Variante').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Rouge', 'Verte'])
    menuEntry('Verte').click()
    await flushPromises()
    expect(store.doc.components[0]).toMatchObject({ id, variant: 'v1' })
    // Dans le panneau : une liste, sur la variante en cours.
    store.inspectorOpen = true
    await flushPromises()
    const select = wrapper.get('.inspector select')
    expect((select.element as HTMLSelectElement).value).toBe('v1')
    await select.setValue('base')
    expect(store.doc.components[0]?.variant).toBeUndefined()
    wrapper.unmount()
  })
})

describe('montage : ordre des composants', () => {
  it('se change par le clic droit ou Ctrl+Page ; le panneau n’a pas de boutons pour ça', async () => {
    const store = useSchematicStore()
    store.startPlacing(createEmptyComponent('led', 'LED'))
    const a = store.placeAt(2, 3)
    const b = store.placeAt(12, 3)
    store.stopPlacing()
    store.clearSelection()
    if (!a || !b) throw new Error('composants attendus')
    const order = (): string[] => store.doc.components.map((instance) => instance.id)
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    // Le premier posé est dessiné le premier, donc dessous.
    rightClick(wrapper.get('.instance .hit').element, ...at(store, 4, 3.5))
    await flushPromises()
    expect(menuLabels()).toContain('Ordre')
    menuEntry('Ordre').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Avancer', 'Reculer', 'Premier plan', 'Arrière-plan'])
    menuEntry('Premier plan').click()
    await flushPromises()
    expect(order()).toEqual([b, a])
    // Le panneau montre l'orientation et la couche du composant, sans boutons d'ordre, de
    // rotation ni de miroir : clavier et menu suffisent.
    store.inspectorOpen = true
    await flushPromises()
    expect(wrapper.find('.inspector select').exists()).toBe(true)
    const titles = wrapper.findAll('.inspector button').map((button) => button.attributes('title'))
    expect(
      titles.filter((title) => /rotation|miroir|avancer|reculer|plan/i.test(title ?? ''))
    ).toEqual([])
    store.reorderInstances('down')
    expect(order()).toEqual([a, b])
    // Au clavier : Ctrl+Page haut avance, Ctrl+Page bas recule ; la couche ne change pas.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true }))
    expect(order()).toEqual([b, a])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true }))
    expect(order()).toEqual([a, b])
    expect(store.doc.components.every((instance) => instance.behindWires)).toBe(true)
    wrapper.unmount()
  })
})
