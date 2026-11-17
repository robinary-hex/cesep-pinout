// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyComponent, DEFAULT_PROFILE, type Primitive } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
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
      'Profil de style',
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

describe('montage : composant extensible', () => {
  it('le panneau donne son nombre de motifs, entre ses bornes', async () => {
    const store = useSchematicStore()
    const def = createEmptyComponent('dupont', 'Dupont')
    def.size = { widthCells: 2, heightCells: 2 }
    def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }]
    def.stretch = { from: 2, to: 6, initial: 2, min: 1, max: 5 }
    store.startPlacing(def)
    const id = store.placeAt(2, 3)
    store.startPlacing(createEmptyComponent('r', 'Résistance'))
    const plain = store.placeAt(20, 3)
    store.stopPlacing()
    if (!id || !plain) throw new Error('pose refusée')
    store.selection = [id]
    store.inspectorOpen = true
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    await flushPromises()
    const field = (): HTMLInputElement =>
      wrapper.get('.inspector .stretch-count').get('input').element
    const type = async (value: string): Promise<void> => {
      field().value = value
      field().dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
    }
    expect(field().value).toBe('2')
    expect([field().min, field().max]).toEqual(['1', '5'])
    await type('4')
    expect(store.doc.components[0]).toMatchObject({ id, x: 2, count: 4 })
    expect(store.undoLabel).toBe('Étirer le composant')
    // Au-delà du maximum : ramené, et le champ le redit ; vide : rien ne change.
    await type('30')
    expect(store.doc.components[0]?.count).toBe(5)
    expect(field().value).toBe('5')
    await type('')
    expect(store.doc.components[0]?.count).toBe(5)
    expect(field().value).toBe('5')
    // Un composant ordinaire n'a pas ce champ.
    store.selection = [plain]
    await flushPromises()
    expect(wrapper.find('.inspector .stretch-count').exists()).toBe(false)
    wrapper.unmount()
  })

  it('le panneau d’une plaque a la case « Montrer le dessous », sous son libellé', async () => {
    const store = useSchematicStore()
    const board = createEmptyComponent('plaque', 'Plaque')
    board.size = { widthCells: 6, heightCells: 4 }
    board.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'holes', x: 4, y: 4, w: 16, h: 8, color: '#d5dbe0' }]
    }
    store.startPlacing(board)
    const plate = store.placeAt(0, 0)
    store.startPlacing(createEmptyComponent('r', 'Résistance'))
    const plain = store.placeAt(20, 3)
    store.stopPlacing()
    if (!plate || !plain) throw new Error('pose refusée')
    store.selection = [plate]
    store.inspectorOpen = true
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    await flushPromises()
    const check = wrapper.get('.inspector .underside')
    // Juste sous le champ « Libellé ».
    expect(check.element.previousElementSibling?.textContent).toContain('Libellé')
    const box = check.get('input').element as HTMLInputElement
    expect(box.checked).toBe(false)
    box.checked = true
    box.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(store.doc.components[0]?.underside).toBe(true)
    expect(store.undoLabel).toBe('Montrer le dessous')
    // Un composant ordinaire n'a pas cette case.
    store.selection = [plain]
    await flushPromises()
    expect(wrapper.find('.inspector .underside').exists()).toBe(false)
    wrapper.unmount()
  })

  it('le panneau a une entrée par copie d’un texte variable du motif', async () => {
    const store = useSchematicStore()
    const def = createEmptyComponent('bornier', 'Bornier')
    def.size = { widthCells: 2, heightCells: 2 }
    def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }]
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'text',
          x: 2,
          y: 0,
          w: 4,
          h: 2,
          text: 'Nom',
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
        }
      ]
    }
    def.stretch = { from: 2, to: 6, initial: 3, min: 1, max: 5 }
    store.startPlacing(def)
    const id = store.placeAt(2, 3)
    store.stopPlacing()
    if (!id) throw new Error('pose refusée')
    store.selection = [id]
    store.inspectorOpen = true
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    await flushPromises()
    const labels = (): string[] =>
      wrapper.findAll('.inspector .field span').map((span) => span.text())
    // Trois motifs : trois entrées, chacune avec sa valeur.
    expect(labels()).toEqual(expect.arrayContaining(['Nom', 'Nom 2', 'Nom 3']))
    expect(labels()).not.toContain('Nom 4')
    const second = wrapper
      .findAll('.inspector .field')
      .find((entry) => entry.find('span').text() === 'Nom 2')
    if (!second) throw new Error('champ « Nom 2 » introuvable')
    await second.get('input').setValue('GND')
    await second.get('input').trigger('change')
    expect(store.doc.components[0]?.fields).toEqual({ 'Nom 2': 'GND' })
    // Un motif de plus : une entrée de plus, les valeurs en place.
    store.setInstanceCount(id, 4)
    await flushPromises()
    expect(labels()).toContain('Nom 4')
    expect(store.doc.components[0]?.fields).toEqual({ 'Nom 2': 'GND' })
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
    // Plus d'entrée « Derrière les fils » : l'ordre suffit à passer devant ou derrière eux.
    expect(menuLabels()).not.toContain('Derrière les fils')
    menuEntry('Ordre').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Avancer', 'Reculer', 'Premier plan', 'Arrière-plan'])
    menuEntry('Premier plan').click()
    await flushPromises()
    expect(order()).toEqual([b, a])
    // « Premier plan » : devant tout, fils compris.
    expect(store.doc.components.map((instance) => instance.behindWires)).toEqual([true, false])
    // Le panneau montre l'orientation du composant, sans boutons d'ordre, de rotation ni de
    // miroir, et sans case pour sa couche : clavier et menu suffisent.
    store.inspectorOpen = true
    await flushPromises()
    expect(wrapper.find('.inspector select').exists()).toBe(true)
    const titles = wrapper.findAll('.inspector button').map((button) => button.attributes('title'))
    expect(
      titles.filter((title) => /rotation|miroir|avancer|reculer|plan/i.test(title ?? ''))
    ).toEqual([])
    expect(wrapper.findAll('.inspector .check').map((check) => check.text())).toEqual(['Miroir'])
    // La rotation et la case « Miroir » sont dans les deux colonnes des champs X et Y.
    const pairs = wrapper.findAll('.inspector .pair')
    expect(pairs.map((pair) => pair.findAll('span').map((span) => span.text()))).toEqual([
      ['X (cellules)', 'Y (cellules)'],
      ['Rotation', 'Miroir']
    ])
    // Au clavier : Ctrl+Page bas recule (derrière les fils, puis sous l'autre composant),
    // Ctrl+Page haut avance.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true }))
    expect(order()).toEqual([b, a])
    expect(store.doc.components.every((instance) => instance.behindWires)).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true }))
    expect(order()).toEqual([a, b])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true }))
    expect(order()).toEqual([b, a])
    expect(store.doc.components.every((instance) => instance.behindWires)).toBe(true)
    wrapper.unmount()
  })
})

describe('montage : profil de style d’une sélection', () => {
  const THICK = { ...DEFAULT_PROFILE, name: 'Épais', wireWidth: 0.3 }
  const FINE = { ...DEFAULT_PROFILE, name: 'Fin', wireWidth: 0.08 }

  /** Deux fils et les profils enregistrés Épais, Fin et Standard (celui du montage). */
  function twoWires(): { store: Store; a: string; b: string } {
    const store = useSchematicStore()
    useLibraryStore().savedProfiles = [THICK, FINE, DEFAULT_PROFILE]
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
    return { store, a, b }
  }

  it('se choisit par le clic droit, pour toute la sélection', async () => {
    const { store, a, b } = twoWires()
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const hit = (index: number): Element =>
      wrapper.findAll('.wire-hit')[index]?.element ?? document.body
    /** Entrées cochées du sous-menu ouvert. */
    const checked = (): string[] =>
      [...document.body.querySelectorAll('.context-menu.sub-menu .entry')]
        .filter((entry) => entry.querySelector('.checked') !== null)
        .map((entry) => entry.querySelector('.label')?.textContent?.trim() ?? '')
    store.selectedWires = [a, b]
    await flushPromises()
    rightClick(hit(0), ...at(store, 3, 0))
    await flushPromises()
    // Le sous-menu vient avec le style, avant l'ordre d'empilement.
    const labels = menuLabels()
    expect(labels.indexOf('Profil de style')).toBe(labels.indexOf('Ordre') - 1)
    menuEntry('Profil de style').click()
    await flushPromises()
    // Le style du montage d'abord, puis les profils enregistrés qui ne sont pas le sien.
    expect(subMenuLabels()).toEqual(['Celui du montage (Standard)', 'Épais', 'Fin'])
    expect(checked()).toEqual(['Celui du montage (Standard)'])
    menuEntry('Épais').click()
    await flushPromises()
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', 'Épais'])
    expect(store.doc.styles).toEqual([THICK])
    expect(wrapper.findAll('.wires .wire').map((wire) => wire.attributes('stroke-width'))).toEqual([
      '0.3',
      '0.3'
    ])
    // Retour au style du montage pour un seul des deux.
    store.clearSelection()
    rightClick(hit(1), ...at(store, 3, 4))
    await flushPromises()
    menuEntry('Profil de style').click()
    await flushPromises()
    expect(checked()).toEqual(['Épais'])
    menuEntry('Celui du montage (Standard)').click()
    await flushPromises()
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', undefined])
    // Deux styles dans la sélection : aucun n'est coché.
    store.selectedWires = [a, b]
    await flushPromises()
    rightClick(hit(0), ...at(store, 3, 0))
    await flushPromises()
    menuEntry('Profil de style').click()
    await flushPromises()
    expect(checked()).toEqual([])
    wrapper.unmount()
  })

  it('se choisit dans le panneau, qui dit quand la sélection mêle plusieurs styles', async () => {
    const { store, a, b } = twoWires()
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    store.inspectorOpen = true
    store.selectedWires = [a]
    await flushPromises()
    const choice = (): HTMLSelectElement =>
      wrapper.get('.inspector select.style-choice').element as HTMLSelectElement
    const options = (): string[] => [...choice().options].map((option) => option.text.trim())
    expect(options()).toEqual(['Celui du montage (Standard)', 'Épais', 'Fin'])
    expect(choice().value).toBe('')
    await wrapper.get('.inspector select.style-choice').setValue('Fin')
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Fin', undefined])
    expect(choice().value).toBe('Fin')
    // Deux fils de styles différents : la liste le dit, sans rien cocher d'applicable.
    store.selectedWires = [a, b]
    await flushPromises()
    expect(options()[0]).toBe('Plusieurs styles')
    expect(choice().selectedOptions[0]?.text.trim()).toBe('Plusieurs styles')
    await wrapper.get('.inspector select.style-choice').setValue('Épais')
    expect(store.doc.wires.map((wire) => wire.style)).toEqual(['Épais', 'Épais'])
    // « Fin » ne sert plus : le montage ne le garde pas.
    expect(store.doc.styles.map((style) => style.name)).toEqual(['Épais'])
    // Sans sélection, le panneau liste les styles propres et sélectionne leurs éléments.
    store.clearSelection()
    await flushPromises()
    const usage = wrapper.get('.inspector .own-styles li')
    expect(usage.text()).toContain('Épais')
    expect(usage.text()).toContain('2 élément(s)')
    await usage.get('button').trigger('click')
    expect([...store.selectedWires].sort()).toEqual([a, b].sort())
    await wrapper.get('.inspector select.style-choice').setValue('')
    expect(store.doc.styles).toEqual([])
    expect(wrapper.find('.inspector .own-styles').exists()).toBe(false)
    wrapper.unmount()
  })

  it('signale un profil enregistré qui a changé, et le reprend d’un bouton', async () => {
    const { store, a } = twoWires()
    const library = useLibraryStore()
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    store.inspectorOpen = true
    store.selectedWires = [a]
    store.setSelectionStyle(THICK)
    await flushPromises()
    expect(wrapper.find('.inspector .notice').exists()).toBe(false)
    library.savedProfiles = [{ ...THICK, wireWidth: 0.4 }, FINE, DEFAULT_PROFILE]
    await flushPromises()
    const notice = wrapper.get('.inspector .notice')
    expect(notice.text()).toContain('Le profil « Épais » a changé')
    await notice.get('button').trigger('click')
    expect(store.doc.styles[0]?.wireWidth).toBe(0.4)
    expect(wrapper.find('.inspector .notice').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('montage : panneau de propriétés', () => {
  it('ne montre le projet que sans sélection ; un élément sélectionné a le panneau pour lui', async () => {
    const store = useSchematicStore()
    store.inspectorOpen = true
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    await flushPromises()
    const sections = (): string[] =>
      wrapper.findAll('.inspector .block h3').map((heading) => heading.text())
    const nameField = (): boolean =>
      wrapper.findAll('.inspector .field span').some((span) => span.text() === 'Nom du montage')
    // Rien de sélectionné : le projet, son profil, son contenu.
    expect(sections()).toEqual(['Projet', 'Profil de style', 'Éléments'])
    expect(nameField()).toBe(true)
    // Une étiquette : ses propriétés, pas le nom du projet.
    const label = store.addLabelBox({ x: 2, y: 2, w: 8, h: 2 })
    store.clearSelection()
    store.selectedLabels = [label]
    await flushPromises()
    expect(sections()).toEqual(['Étiquette', 'Position et taille', 'Profil de style'])
    expect(nameField()).toBe(false)
    // Un fil, puis les deux ensemble : de même.
    const wire = store.addWire([
      [0, 10],
      [6, 10]
    ])
    if (!wire) throw new Error('fil attendu')
    store.clearSelection()
    store.selectedWires = [wire]
    await flushPromises()
    expect(sections()[0]).toBe('Fil')
    expect(sections()).not.toContain('Projet')
    store.selectedLabels = [label]
    await flushPromises()
    expect(sections()).not.toContain('Projet')
    expect(nameField()).toBe(false)
    // La sélection vidée, le projet revient.
    store.clearSelection()
    await flushPromises()
    expect(sections()[0]).toBe('Projet')
    expect(nameField()).toBe(true)
    wrapper.unmount()
  })
})

describe('montage : flèches du clavier', () => {
  it('déplacent la sélection d’une cellule, de cinq avec Maj, fils accrochés compris', async () => {
    const store = useSchematicStore()
    const def = createEmptyComponent('resistor', 'Résistance')
    def.pins = [
      { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
      { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
    ]
    store.startPlacing(def)
    const part = store.placeAt(2, 3)
    store.stopPlacing()
    // Un fil part de la broche de droite, en (6, 4).
    store.addWire([
      [6, 4],
      [12, 4]
    ])
    if (!part) throw new Error('composant attendu')
    store.clearSelection()
    store.selection = [part]
    const wrapper = mount(SchematicEditor, { attachTo: document.body })
    const press = (key: string, shiftKey = false): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey }))
    }
    const where = (): number[] => [store.doc.components[0]?.x ?? 0, store.doc.components[0]?.y ?? 0]
    press('ArrowRight')
    expect(where()).toEqual([3, 3])
    press('ArrowDown', true)
    expect(where()).toEqual([3, 8])
    // Le bout du fil posé sur la broche a suivi.
    expect(store.doc.wires[0]?.points[0]).toEqual([7, 9])
    press('ArrowLeft', true)
    expect(where()).toEqual([-2, 8])
    press('ArrowUp')
    expect(where()).toEqual([-2, 7])
    // Chaque appui est une commande : Ctrl+Z défait le dernier, d'une cellule.
    store.undo()
    expect(where()).toEqual([-2, 8])
    store.undo()
    expect(where()).toEqual([3, 8])
    wrapper.unmount()
  })
})
