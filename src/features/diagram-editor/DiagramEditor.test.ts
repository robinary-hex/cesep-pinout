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
      'Copier le style',
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
      // Les tailles, en points : celle du diagramme (14), que le nœud suit, puis les autres.
      'Celle du diagramme (14 pt)',
      '10 pt',
      '12 pt',
      '16 pt',
      '18 pt',
      '24 pt',
      '32 pt',
      'Celle de la forme'
    ])
    // La couleur du texte : une pastille de la palette, ou celle de la forme.
    const swatches = document.body.querySelectorAll<HTMLElement>('.context-menu.sub-menu .swatch')
    expect(swatches).toHaveLength(store.colorChoices.length)
    swatches[1]?.click()
    await flushPromises()
    expect(store.doc.nodes[0]?.textColor).toBe(store.colorChoices[1]?.hex)
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    menuEntry('Celle de la forme').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.textColor).toBeNull()
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    menuEntry('Chasse fixe').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.font).toBe('mono')
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    menuEntry('24 pt').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.textSize).toBe(24)
    await open()
    menuEntry('Texte').click()
    await flushPromises()
    menuEntry('Celle du diagramme (14 pt)').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.textSize).toBeNull()
    // Fond : la bordure ne se choisit que pour un fond plein.
    await open()
    menuEntry('Fond').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Contour', 'Teinté', 'Plein'])
    menuEntry('Plein').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.fill).toBe('solid')
    await open()
    menuEntry('Fond').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Contour', 'Teinté', 'Plein', 'Automatique'])
    const borders = document.body.querySelectorAll<HTMLElement>('.context-menu.sub-menu .swatch')
    expect(borders).toHaveLength(store.colorChoices.length)
    borders[1]?.click()
    await flushPromises()
    expect(store.doc.nodes[0]?.borderColor).toBe(store.colorChoices[1]?.hex)
    expect(store.undoLabel).toBe('Couleur de la bordure')
    await open()
    menuEntry('Fond').click()
    await flushPromises()
    menuEntry('Automatique').click()
    await flushPromises()
    expect(store.doc.nodes[0]?.borderColor).toBeNull()
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
  it('panneau d’un nœud : la couleur de son texte, celle de la forme par défaut', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.setNodeText(id, { title: 'Titre' })
    store.inspectorOpen = true
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    await flushPromises()
    const field = (): ReturnType<typeof wrapper.findAll>[number] => {
      const found = wrapper
        .findAll('.inspector .field')
        .find((entry) => entry.find('span').text() === 'Couleur du texte')
      if (!found) throw new Error('champ « Couleur du texte » introuvable')
      return found
    }
    // « Auto » est choisi : le texte suit la forme. Puis une pastille par couleur de la palette.
    expect(field().get('button.auto').classes()).toContain('current')
    expect(field().findAll('button.swatch')).toHaveLength(store.colorChoices.length)
    expect(field().findAll('button.swatch.current')).toHaveLength(0)
    await field().findAll('button.swatch')[2]?.trigger('click')
    expect(store.doc.nodes[0]?.textColor).toBe(store.colorChoices[2]?.hex)
    expect(store.undoLabel).toBe('Couleur du texte')
    expect(field().get('button.auto').classes()).not.toContain('current')
    expect(field().findAll('button.swatch.current')).toHaveLength(1)
    // La forme garde sa couleur.
    expect(store.doc.nodes[0]?.color).toBe('#000000')
    await field().get('button.auto').trigger('click')
    expect(store.doc.nodes[0]?.textColor).toBeNull()
    // Une forme sans texte n'a pas ce réglage.
    store.addNode('start', 0, 20)
    await flushPromises()
    expect(wrapper.findAll('.inspector .field span').map((span) => span.text())).not.toContain(
      'Couleur du texte'
    )
    wrapper.unmount()
  })

  it('panneau d’un nœud : taille du texte en points, bordure d’un fond plein', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.setNodeText(id, { title: 'Titre' })
    store.inspectorOpen = true
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    await flushPromises()
    const names = (): string[] =>
      wrapper.findAll('.inspector .field span').map((span) => span.text())
    const field = (name: string): ReturnType<typeof wrapper.findAll>[number] => {
      const found = wrapper
        .findAll('.inspector .field')
        .find((entry) => entry.find('span').text() === name)
      if (!found) throw new Error(`champ « ${name} » introuvable`)
      return found
    }
    const size = (): HTMLInputElement => field('Taille (pt)').get('input').element
    const type = async (value: string): Promise<void> => {
      size().value = value
      await field('Taille (pt)').get('input').trigger('change')
    }
    // La taille est celle du diagramme tant que le nœud n'a pas la sienne.
    expect(size().value).toBe('14')
    await type('18')
    expect(store.doc.nodes[0]?.textSize).toBe(18)
    expect(store.undoLabel).toBe('Taille du texte du nœud')
    expect(size().value).toBe('18')
    // Hors des bornes, elle y est ramenée ; une saisie vide ne change rien.
    await type('500')
    expect(store.doc.nodes[0]?.textSize).toBe(96)
    expect(size().value).toBe('96')
    await type('')
    expect(store.doc.nodes[0]?.textSize).toBe(96)
    expect(size().value).toBe('96')
    // Revenue à la taille du diagramme, le nœud la suit de nouveau.
    await type('14')
    expect(store.doc.nodes[0]?.textSize).toBeNull()
    // La bordure ne se choisit que sur un fond plein ; « Auto » la déduit du fond.
    expect(names()).not.toContain('Couleur de la bordure')
    store.setNodesStyle([id], { fill: 'solid' })
    await flushPromises()
    const border = (): ReturnType<typeof field> => field('Couleur de la bordure')
    expect(border().get('button.auto').classes()).toContain('current')
    expect(border().findAll('button.swatch')).toHaveLength(store.colorChoices.length)
    await border().findAll('button.swatch')[3]?.trigger('click')
    expect(store.doc.nodes[0]?.borderColor).toBe(store.colorChoices[3]?.hex)
    expect(store.undoLabel).toBe('Couleur de la bordure')
    expect(border().findAll('button.swatch.current')).toHaveLength(1)
    expect(border().get('button.auto').classes()).not.toContain('current')
    await border().get('button.auto').trigger('click')
    expect(store.doc.nodes[0]?.borderColor).toBeNull()
    // X, Y, largeur et hauteur : une seule ligne de quatre champs.
    expect(wrapper.findAll('.inspector .box-row')).toHaveLength(1)
    expect(wrapper.findAll('.inspector .box-row input[type="number"]')).toHaveLength(4)
    wrapper.unmount()
  })

  it('panneau d’un nœud : la forme (type, fond, couleur, bordure), puis le texte dans sa section', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.setNodeText(id, { title: 'Titre' })
    store.setNodesStyle([id], { fill: 'solid' })
    store.inspectorOpen = true
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    await flushPromises()
    const sections = (): string[] =>
      wrapper.findAll('.inspector .block h3').map((heading) => heading.text())
    const fields = (section: string): string[] =>
      wrapper.findAll(`.inspector ${section} .field span`).map((span) => span.text())
    // Trois sections pour un nœud : sa forme, son texte, sa position et sa taille.
    expect(sections()).toEqual(['Diagramme', 'Forme', 'Texte', 'Position et taille'])
    // La couleur du texte reste avec le texte.
    expect(fields('.node-text')).toEqual([
      'Titre',
      'Sous-titre',
      'Style du texte',
      'Taille (pt)',
      'Couleur du texte'
    ])
    // Le type de forme, son fond, puis sa couleur, puis celle de la bordure d'un fond plein.
    expect(fields('.node-shape')).toEqual(['Type', 'Fond', 'Couleur', 'Couleur de la bordure'])
    store.setNodesStyle([id], { fill: 'tint' })
    await flushPromises()
    expect(fields('.node-shape')).toEqual(['Type', 'Fond', 'Couleur'])
    // Une forme sans texte n'a pas de section « Texte ».
    store.addNode('start', 0, 20)
    await flushPromises()
    expect(sections()).toEqual(['Diagramme', 'Forme', 'Position et taille'])
    expect(wrapper.find('.inspector .node-text').exists()).toBe(false)
    wrapper.unmount()
  })

  it('panneau : ni chemin du fichier ni mention sous le nom du diagramme', async () => {
    const store = useDiagramStore()
    store.inspectorOpen = true
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    await flushPromises()
    const first = wrapper.get('.inspector .block')
    expect(first.find('input[type="text"]').exists()).toBe(true)
    expect(first.findAll('p')).toHaveLength(0)
    expect(first.text()).not.toContain('Pas encore enregistré')
    // Un texte libre : sa taille se tape en points.
    const text = store.addTextBox({ x: 0, y: 0, w: 12, h: 3 })
    await flushPromises()
    const input = wrapper
      .findAll('.inspector .field')
      .find((entry) => entry.find('span').text() === 'Taille (pt)')
      ?.get('input')
    if (!input) throw new Error('champ « Taille (pt) » introuvable')
    expect((input.element as HTMLInputElement).value).toBe('12')
    ;(input.element as HTMLInputElement).value = '17'
    await input.trigger('change')
    expect(store.doc.texts.find((entry) => entry.id === text)?.size).toBe(17)
    wrapper.unmount()
  })

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

describe('diagramme : flèches du clavier', () => {
  it('déplacent la sélection d’une cellule, de cinq avec Maj', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 10, 10)
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    const press = (key: string, shiftKey = false): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey }))
    }
    const where = (): number[] => {
      const node = store.doc.nodes.find((candidate) => candidate.id === id)
      return [node?.x ?? 0, node?.y ?? 0]
    }
    expect(store.selectedNodes).toEqual([id])
    press('ArrowRight')
    expect(where()).toEqual([11, 10])
    press('ArrowRight', true)
    expect(where()).toEqual([16, 10])
    press('ArrowUp', true)
    expect(where()).toEqual([16, 5])
    press('ArrowDown')
    expect(where()).toEqual([16, 6])
    wrapper.unmount()
  })
})

describe('diagramme : copie de style', () => {
  it('bouton, touche S et clic droit la démarrent ; Échap l’arrête et garde la sélection', async () => {
    const store = useDiagramStore()
    const wrapper = mount(DiagramEditor, { attachTo: document.body })
    const press = (key: string): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    }
    const button = (): ReturnType<typeof wrapper.get> => wrapper.get('.toolbar button.style-copy')
    // Rien de sélectionné : pas de style à copier, le bouton est grisé et S ne fait rien.
    expect(button().attributes('disabled')).toBeDefined()
    press('s')
    expect(store.tool).toBe('select')
    expect(store.status).toContain('sélectionne d’abord')
    const id = store.addNode('rounded', 0, 0)
    await flushPromises()
    expect(button().attributes('disabled')).toBeUndefined()
    press('s')
    await flushPromises()
    expect(store.tool).toBe('style')
    expect(button().classes()).toContain('active')
    // Échap arrête la copie d'abord ; la sélection ne part qu'à l'appui suivant.
    press('Escape')
    await flushPromises()
    expect(store.tool).toBe('select')
    expect(store.selectedNodes).toEqual([id])
    expect(button().classes()).not.toContain('active')
    // Le bouton la démarre, puis l'arrête.
    await button().trigger('click')
    expect(store.tool).toBe('style')
    await button().trigger('click')
    expect(store.tool).toBe('select')
    // Un autre outil l'arrête aussi.
    press('s')
    expect(store.tool).toBe('style')
    press('v')
    expect(store.tool).toBe('select')
    // Montré par une sélection, le panneau flotte sur le dessin : il s'efface le temps de la
    // copie, pour ne pas cacher les éléments à styler, et revient ensuite.
    store.revealInspector()
    await flushPromises()
    expect(store.inspectorFloating).toBe(true)
    expect(wrapper.find('.inspector').exists()).toBe(true)
    press('s')
    await flushPromises()
    expect(wrapper.find('.inspector').exists()).toBe(false)
    press('Escape')
    await flushPromises()
    expect(wrapper.find('.inspector').exists()).toBe(true)
    // Ouvert pour de bon, il reste à sa place pendant la copie.
    store.inspectorOpen = true
    press('s')
    await flushPromises()
    expect(wrapper.find('.inspector').exists()).toBe(true)
    press('Escape')
    store.inspectorOpen = false
    await flushPromises()
    // Clic droit sur un élément : « Copier le style ».
    rightClick(wrapper.get('.node .hit').element, ...at(store, 4, 3))
    await flushPromises()
    menuEntry('Copier le style').click()
    await flushPromises()
    expect(store.tool).toBe('style')
    expect(store.styleSource).toEqual({ kind: 'node', id })
    wrapper.unmount()
  })
})
