// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DiagramCanvas from './DiagramCanvas.vue'
import DiagramLibrary from './DiagramLibrary.vue'
import { useDiagramStore } from './store'

type Store = ReturnType<typeof useDiagramStore>

/** Position à l'écran d'un point de la grille : jsdom place le SVG en (0, 0). */
function at(store: Store, x: number, y: number): { clientX: number; clientY: number } {
  return {
    clientX: store.view.panX + x * store.cellPx,
    clientY: store.view.panY + y * store.cellPx
  }
}

/** Envoie un événement de souris (bouton gauche) avec ses coordonnées, et attend le rendu. */
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

describe('canevas du diagramme : nœuds', () => {
  it('pose la forme choisie dans la bibliothèque et ouvre la saisie de son texte', async () => {
    const store = useDiagramStore()
    const library = mount(DiagramLibrary)
    // Dix-sept formes, rangées par famille.
    expect(library.findAll('.tile')).toHaveLength(17)
    expect(library.findAll('.family h3').map((title) => title.text())).toEqual([
      'Général',
      'Organigramme',
      'Activité',
      'Communication'
    ])
    expect(
      library
        .findAll('.family')[1]
        ?.findAll('.tile-name')
        .map((name) => name.text())
    ).toEqual(['Début / fin', 'Entrée / sortie', 'Sous-programme', 'Préparation', 'Renvoi'])
    await library.findAll('.tile')[0]?.trigger('click')
    expect(store.placement).toBe('rounded')
    const wrapper = mount(DiagramCanvas, { attachTo: document.body })
    const svg = wrapper.get('svg.diagram')
    await fire(svg, 'pointermove', at(store, 20, 10))
    expect(wrapper.find('.ghost').exists()).toBe(true)
    await fire(svg, 'pointerdown', at(store, 20, 10))
    expect(store.doc.nodes[0]).toMatchObject({ shape: 'rounded', x: 12, y: 7, w: 16, h: 6 })
    expect(store.tool).toBe('select')
    // L'éditeur de texte s'ouvre sur le nœud : titre, sous-titre, Entrée valide.
    const title = wrapper.get('.node-editor textarea')
    await title.setValue('Arduino')
    await wrapper.get('.node-editor input').setValue('(un par énigme)')
    await title.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.node-editor').exists()).toBe(false)
    expect(store.doc.nodes[0]).toMatchObject({ title: 'Arduino', subtitle: '(un par énigme)' })
    expect(wrapper.get('.node text').text()).toContain('Arduino')
    wrapper.unmount()
  })

  it('Échap abandonne la saisie sans rien changer', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.setNodeText(id, { title: 'Avant' })
    const wrapper = mount(DiagramCanvas, { attachTo: document.body })
    await fire(wrapper.get('.node .hit'), 'dblclick', at(store, 8, 3))
    const title = wrapper.get('.node-editor textarea')
    await title.setValue('Après')
    await title.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.node-editor').exists()).toBe(false)
    expect(store.doc.nodes[0]?.title).toBe('Avant')
    wrapper.unmount()
  })

  it('déplace un nœud en le glissant, ses liens accrochés suivent', async () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    const b = store.addNode('rounded', 0, 12)
    store.addLink([
      [8, 6],
      [8, 12]
    ])
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    const hits = wrapper.findAll('.node .hit')
    await fire(hits[1] ?? svg, 'pointerdown', at(store, 8, 15))
    expect(store.selectedNodes).toEqual([b])
    await fire(svg, 'pointermove', at(store, 12, 17))
    await fire(svg, 'pointerup', at(store, 12, 17))
    expect(store.doc.nodes[1]).toMatchObject({ x: 4, y: 14 })
    expect(store.doc.links[0]?.points.at(0)).toEqual([8, 6])
    expect(store.doc.links[0]?.points.at(-1)).toEqual([12, 14])
  })

  it('redimensionne par une poignée, à la taille que la forme permet', async () => {
    const store = useDiagramStore()
    store.addNode('diamond', 0, 0)
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    await nextTick()
    // Losange 4 × 4 sélectionné : huit poignées ; la dernière des coins est « se » (index 4).
    const handles = wrapper.findAll('.box-handle')
    expect(handles).toHaveLength(8)
    await fire(handles[4] ?? svg, 'pointerdown', at(store, 4, 4))
    await fire(svg, 'pointermove', at(store, 9, 7))
    await fire(svg, 'pointerup', at(store, 9, 7))
    // 9 × 7 demandé : dimensions paires.
    expect(store.doc.nodes[0]).toMatchObject({ x: 0, y: 0, w: 10, h: 8 })
  })
})

describe('canevas du diagramme : liens', () => {
  it('sans Ctrl, rien ne s’annonce au bord d’un nœud et le glisser le déplace', async () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    await fire(svg, 'pointermove', at(store, 8, 6))
    expect(wrapper.find('.anchor-grab').exists()).toBe(false)
    await fire(wrapper.get('.node .hit'), 'pointerdown', at(store, 8, 5.9))
    await fire(svg, 'pointermove', at(store, 11, 9.9))
    await fire(svg, 'pointerup', at(store, 11, 9.9))
    expect(store.doc.links).toHaveLength(0)
    expect(store.doc.nodes[0]).toMatchObject({ x: 3, y: 4 })
  })

  it('Ctrl+glisser sur un nœud tire un lien de son accroche la plus proche vers un autre nœud', async () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.addNode('rounded', 0, 12)
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    // Dans le premier nœud, près du milieu de son bord bas : l'anneau s'y met.
    await fire(svg, 'pointermove', at(store, 8.1, 4.6), CTRL)
    expect(store.ctrlHeld).toBe(true)
    const ring = wrapper.get('.anchor-grab')
    expect([ring.attributes('cx'), ring.attributes('cy')]).toEqual(['8', '6'])
    await fire(wrapper.findAll('.node .hit')[0] ?? svg, 'pointerdown', at(store, 8.1, 4.6), CTRL)
    await fire(svg, 'pointermove', at(store, 8.3, 11.6), CTRL)
    expect(wrapper.find('.drawing .pending').exists()).toBe(true)
    await fire(svg, 'pointerup', at(store, 8.3, 11.6), CTRL)
    expect(store.doc.links).toHaveLength(1)
    expect(store.doc.links[0]).toMatchObject({
      points: [
        [8, 6],
        [8, 12]
      ],
      endArrow: true,
      startArrow: false
    })
    // Le nœud n'a pas bougé ; une pointe ouverte à l'arrivée.
    expect(store.doc.nodes[0]).toMatchObject({ x: 0, y: 0 })
    expect(wrapper.findAll('.link-head')).toHaveLength(1)
    expect(store.undoLabel).toBe('Tracer un lien')
  })

  it('un simple Ctrl+clic sélectionne le nœud', async () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 0, 0)
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    await fire(svg, 'pointermove', at(store, 0, 3), CTRL)
    await fire(svg, 'pointerdown', at(store, 0, 3), CTRL)
    await fire(svg, 'pointerup', at(store, 0, 3), CTRL)
    expect(store.doc.links).toHaveLength(0)
    expect(store.selectedNodes).toEqual([id])
  })

  it('trace un lien à l’outil, coude par coude, et le termine sur une accroche', async () => {
    const store = useDiagramStore()
    store.addNode('rounded', 20, 10)
    store.startLinkTool()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    await fire(svg, 'pointerdown', at(store, 0, 0))
    await fire(svg, 'pointerdown', at(store, 0, 13))
    // Arrivée sur le milieu du côté gauche du nœud (20, 13) : le lien est terminé.
    await fire(svg, 'pointerdown', at(store, 20.2, 13.1))
    expect(store.drawing).toBeNull()
    expect(store.doc.links[0]?.points).toEqual([
      [0, 0],
      [0, 13],
      [20, 13]
    ])
  })

  it('montre l’étiquette d’un lien ; la glisser la fait longer le trait et changer de côté', async () => {
    const store = useDiagramStore()
    const id = store.addLink([
      [0, 0],
      [0, 10]
    ])
    if (!id) throw new Error('lien attendu')
    store.setLinkLabel(id, 'vrai')
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    const label = wrapper.get('.link-label')
    expect(label.text()).toBe('vrai')
    // À droite du lien vertical : le texte part du trait.
    expect(label.get('text').attributes('text-anchor')).toBe('start')
    await fire(label, 'pointerdown', at(store, 2, 5))
    // Vers le haut et de l'autre côté du trait : l'aperçu suit, le texte finit maintenant au trait.
    await fire(svg, 'pointermove', at(store, -3, 2.2))
    expect(wrapper.get('.link-label text').attributes('text-anchor')).toBe('end')
    await fire(svg, 'pointerup', at(store, -3, 2.2))
    // 2 cellules sur 10 depuis le départ (au pas d'une demi-cellule), côté gauche.
    expect(store.doc.links[0]).toMatchObject({ labelAt: 0.2, labelSide: -1 })
    expect(store.selectedLinks).toEqual([id])
    expect(store.undoLabel).toBe('Déplacer l’étiquette du lien')
  })
})

describe('canevas du diagramme : fond des étiquettes', () => {
  it('ne peint le fond d’une étiquette de lien ou d’un texte que si on le demande', async () => {
    const store = useDiagramStore()
    const id = store.addLink([
      [0, 0],
      [0, 10]
    ])
    if (!id) throw new Error('lien attendu')
    store.setLinkLabel(id, 'vrai')
    const textId = store.addText(10, 4)
    expect(store.doc.links[0]?.labelBackground).toBe(false)
    expect(store.doc.texts[0]?.background).toBe(false)
    const wrapper = mount(DiagramCanvas)
    // La boîte de l'étiquette d'un lien reste là pour la saisir, mais ne se voit pas.
    expect(wrapper.get('.link-label .label-back').classes()).not.toContain('filled')
    expect(wrapper.find('.text-label .label-back').exists()).toBe(false)
    store.setLinksStyle([id], { labelBackground: true })
    store.setTextStyle(textId, 'Fond du texte', { background: true })
    await nextTick()
    expect(wrapper.get('.link-label .label-back').classes()).toContain('filled')
    expect(wrapper.get('.text-label .label-back').classes()).toContain('filled')
  })
})

describe('canevas du diagramme : lien sélectionné', () => {
  it('l’entoure d’un liseré bleu détaché du trait par un filet de la couleur du papier', async () => {
    const store = useDiagramStore()
    const id = store.addLink([
      [0, 0],
      [10, 0]
    ])
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    expect(wrapper.find('.link-selections path').exists()).toBe(false)
    store.selectedLinks = id ? [id] : []
    await nextTick()
    const marks = wrapper.findAll('.link-selections path')
    expect(marks.map((mark) => mark.classes())).toEqual([['ring'], ['gap']])
    const widths = marks.map((mark) => Number(mark.attributes('stroke-width')))
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0)
  })
})

describe('canevas du diagramme : groupes', () => {
  it('entoure le groupe, le prend d’un clic et le déplace d’un bloc ; Ctrl+clic prend le nœud seul', async () => {
    const store = useDiagramStore()
    const a = store.addNode('rounded', 0, 0)
    const b = store.addNode('rounded', 0, 12)
    store.addNode('rounded', 40, 0)
    store.clearSelection()
    store.selectedNodes = [a, b]
    store.groupSelection()
    store.clearSelection()
    const wrapper = mount(DiagramCanvas)
    const svg = wrapper.get('svg.diagram')
    const outline = (): number[] =>
      ['x', 'y', 'width', 'height'].map((name) =>
        Number(wrapper.get('.group-outline').attributes(name))
      )
    // Deux nœuds de 16 × 6, l'un sous l'autre : le contour les entoure à 0,8 cellule.
    const [x, y, width, height] = outline()
    expect(x).toBeCloseTo(-0.8)
    expect(y).toBeCloseTo(-0.8)
    expect(width).toBeCloseTo(17.6)
    expect(height).toBeCloseTo(19.6)

    const hits = wrapper.findAll('.node .hit')
    await fire(hits[1] ?? svg, 'pointerdown', at(store, 8, 15))
    expect(store.selectedNodes).toEqual([b, a])
    await fire(svg, 'pointermove', at(store, 12, 17))
    expect(outline()[0]).toBeCloseTo(3.2)
    await fire(svg, 'pointerup', at(store, 12, 17))
    expect(store.doc.nodes.map((node) => [node.x, node.y])).toEqual([
      [4, 2],
      [4, 14],
      [40, 0]
    ])

    // Ctrl+clic : le nœud seul, sans son groupe.
    store.clearSelection()
    await fire(svg, 'pointermove', at(store, 4, 5), CTRL)
    await fire(svg, 'pointerdown', at(store, 4, 5), CTRL)
    await fire(svg, 'pointerup', at(store, 4, 5), CTRL)
    expect(store.selectedNodes).toEqual([a])

    store.showGroups = false
    await nextTick()
    expect(wrapper.find('.group-outline').exists()).toBe(false)
  })
})
