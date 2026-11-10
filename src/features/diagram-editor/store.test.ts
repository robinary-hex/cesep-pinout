import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDiagram, serializeDiagram } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { readDiagramAutosaves, syncDiagramAutosaves } from '@/io/autosave'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { closeDiagramTabAsking, saveDiagram } from './diagramActions'
import { useDiagramStore } from './store'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

describe('diagramme : nœuds', () => {
  it('pose une forme centrée sur le clic, à sa taille par défaut, et la sélectionne', () => {
    const store = useDiagramStore()
    store.startPlacing('rounded')
    expect(store.tool).toBe('place')
    const id = store.placeAt(20, 10)
    expect(store.doc.nodes[0]).toMatchObject({
      id,
      shape: 'rounded',
      x: 12,
      y: 7,
      w: 16,
      h: 6,
      title: '',
      color: '#000000',
      fill: 'tint'
    })
    expect(store.selectedNodes).toEqual([id])
    expect(store.undoLabel).toBe('Poser « Action »')
    store.stopPlacing()
    expect(store.tool).toBe('select')
    expect(store.placeAt(0, 0)).toBeNull()
  })

  it('ramène une taille demandée à ce que la forme permet', () => {
    const store = useDiagramStore()
    const diamond = store.addNode('diamond', 0, 0)
    store.setNodeBox(diamond, { x: 0, y: 0, w: 7, h: 3 })
    expect(store.doc.nodes[0]).toMatchObject({ w: 8, h: 4 })
    const bar = store.addNode('bar', 0, 10)
    store.setNodeBox(bar, { x: 0, y: 10, w: 20, h: 3 })
    expect(store.doc.nodes[1]).toMatchObject({ w: 20, h: 0 })
    store.turnBar(bar)
    expect(store.doc.nodes[1]).toMatchObject({ x: 10, y: 0, w: 0, h: 20 })
    store.turnBar(bar)
    expect(store.doc.nodes[1]).toMatchObject({ x: 0, y: 10, w: 20, h: 0 })
  })

  it('écrit titre et sous-titre, change de forme et d’ordre', () => {
    const store = useDiagramStore()
    const a = store.addNode('rounded', 0, 0)
    const b = store.addNode('rect', 0, 10)
    store.setNodeText(a, { title: 'Arduino', subtitle: '(un par énigme)' })
    expect(store.doc.nodes[0]).toMatchObject({ title: 'Arduino', subtitle: '(un par énigme)' })
    store.setNodeShape(a, 'diamond')
    expect(store.doc.nodes[0]).toMatchObject({ shape: 'diamond', w: 16, h: 6 })
    store.setNodeShape(a, 'start')
    expect(store.doc.nodes[0]).toMatchObject({ shape: 'start', w: 16, h: 16 })
    store.selectedNodes = [a]
    store.reorderNodes('top')
    expect(store.doc.nodes.map((node) => node.id)).toEqual([b, a])
    store.undo()
    expect(store.doc.nodes.map((node) => node.id)).toEqual([a, b])
  })

  it('agrandit un nœud dont le texte déborde, et l’ajuste au plus près sur demande', () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 10, 10)
    store.addLink([
      [18, 16],
      [18, 22]
    ])
    // Texte court : la boîte de 16 × 6 suffit.
    store.setNodeText(id, { title: 'Arduino' })
    expect(store.doc.nodes[0]).toMatchObject({ x: 10, y: 10, w: 16, h: 6 })
    // Texte long (estimé à 0,77 cellule par caractère) : la boîte grandit autour de son centre,
    // en une seule commande avec le texte, et le lien accroché au milieu du bas y reste.
    store.setNodeText(id, { title: 'Publier le message sur le sujet de la partie' })
    const grown = store.doc.nodes[0]
    expect(grown?.w).toBeGreaterThan(16)
    expect((grown?.x ?? 0) + (grown?.w ?? 0) / 2).toBe(18)
    expect(store.doc.links[0]?.points.at(0)).toEqual([18, 16])
    expect(store.undoLabel).toBe('Modifier le texte du nœud')
    store.undo()
    expect(store.doc.nodes[0]).toMatchObject({ title: 'Arduino', w: 16 })
    // « Ajuster » resserre la boîte autour du texte ; le lien suit le bord qui remonte.
    store.fitNodeToText(id)
    expect(store.doc.nodes[0]).toMatchObject({ w: 10, h: 4, x: 13, y: 11 })
    expect(store.doc.links[0]?.points.at(0)).toEqual([18, 15])
    expect(store.undoLabel).toBe('Ajuster le nœud à son texte')
  })

  it('style le texte d’un nœud ; la boîte grandit si le texte grossit', () => {
    const store = useDiagramStore()
    const id = store.addNode('rounded', 10, 10)
    expect(store.doc.nodes[0]).toMatchObject({ font: null, bold: true, textScale: 1 })
    store.setNodeText(id, { title: 'Brancher' })
    expect(store.doc.nodes[0]).toMatchObject({ w: 16, h: 6 })
    store.setNodesTextStyle([id], 'Italique activé', { italic: true, underline: true })
    expect(store.doc.nodes[0]).toMatchObject({ italic: true, underline: true, w: 16 })
    expect(store.undoLabel).toBe('Italique activé')
    // ×2 : le texte ne tient plus, la boîte grandit autour de son centre, en une commande.
    store.setNodesTextStyle([id], 'Taille du texte du nœud', { textScale: 2 })
    const grown = store.doc.nodes[0]
    expect(grown?.textScale).toBe(2)
    expect(grown?.w).toBeGreaterThan(16)
    expect((grown?.x ?? 0) + (grown?.w ?? 0) / 2).toBe(18)
    store.undo()
    expect(store.doc.nodes[0]).toMatchObject({ textScale: 1, w: 16, x: 10 })
    // La police propre au nœud ; null revient à celle du diagramme.
    store.setNodesTextStyle([id], 'Texte en chasse fixe', { font: 'mono' })
    expect(store.doc.nodes[0]?.font).toBe('mono')
    store.setNodesTextStyle([id], 'Texte en police normale', { font: null })
    expect(store.doc.nodes[0]?.font).toBeNull()
    // Dans un diagramme en chasse fixe, un nouveau nœud a un titre maigre.
    store.setStyle({ font: 'mono' })
    store.addNode('rect', 0, 30)
    expect(store.doc.nodes[1]?.bold).toBe(false)
  })

  it('règle le style du diagramme, en une commande annulable', () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.setStyle({ lineWidth: 0.3, titleSize: 18 })
    expect(store.style).toMatchObject({ lineWidth: 0.3, titleSize: 18, font: 'sans' })
    expect(store.undoLabel).toBe('Changer le style du diagramme')
    store.undo()
    expect(store.style.lineWidth).toBe(0.15)
  })

  it('prend le style courant, que la palette règle en colorant la sélection', () => {
    const store = useDiagramStore()
    const a = store.addNode('rounded', 0, 0)
    store.setCurrentColor('#1d4ed8')
    store.setCurrentFill('solid')
    expect(store.doc.nodes[0]).toMatchObject({ color: '#1d4ed8', fill: 'solid' })
    store.clearSelection()
    const b = store.addNode('rect', 0, 10)
    expect(store.doc.nodes.find((node) => node.id === b)).toMatchObject({
      color: '#1d4ed8',
      fill: 'solid'
    })
    expect(store.doc.nodes.find((node) => node.id === a)?.color).toBe('#1d4ed8')
  })
})

describe('diagramme : liens', () => {
  it('trace un lien au style courant ; un tracé d’un seul point est abandonné', () => {
    const store = useDiagramStore()
    store.startLinkTool()
    store.beginLink([0, 0])
    expect(store.stopLinkDrawing()).toBe(true)
    expect(store.doc.links).toHaveLength(0)
    store.beginLink([0, 0])
    store.appendLinkPoints([
      [0, 5],
      [8, 5]
    ])
    const id = store.finishLink()
    expect(store.doc.links[0]).toMatchObject({
      id,
      points: [
        [0, 0],
        [0, 5],
        [8, 5]
      ],
      dash: 'solid',
      startArrow: false,
      endArrow: true,
      label: ''
    })
    expect(store.addLink([[3, 3]])).toBeNull()
  })

  it('colore les prochains liens quand on en trace ou qu’on n’a sélectionné qu’eux', () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.clearSelection()
    store.startLinkTool()
    store.setCurrentColor('#d62828')
    expect(store.linkColor).toBe('#d62828')
    expect(store.nodeColor).toBe('#000000')
    const id = store.addLink([
      [0, 10],
      [8, 10]
    ])
    expect(store.doc.links[0]?.color).toBe('#d62828')
    store.selectTool()
    store.selectedLinks = id ? [id] : []
    store.setCurrentColor('#15803d')
    expect(store.doc.links[0]?.color).toBe('#15803d')
    expect(store.doc.nodes[0]?.color).toBe('#000000')
  })

  it('fait suivre les liens accrochés quand un nœud bouge ou change de taille', () => {
    const store = useDiagramStore()
    const a = store.addNode('rounded', 0, 0)
    const b = store.addNode('rounded', 0, 12)
    store.addLink([
      [8, 6],
      [8, 12]
    ])
    store.selectedNodes = [b]
    store.moveSelection(4, 0)
    const moved = store.doc.links[0]?.points ?? []
    expect(moved.at(0)).toEqual([8, 6])
    expect(moved.at(-1)).toEqual([12, 12])
    expect(store.undoLabel).toBe('Déplacer la sélection')
    store.undo()
    // Le nœud du haut s'élargit par la droite : le milieu de son bas reste au milieu.
    store.setNodeBox(a, { x: 0, y: 0, w: 20, h: 6 })
    expect(store.doc.links[0]?.points.at(0)).toEqual([10, 6])
  })

  it('déplace en bloc un lien sélectionné avec ses nœuds, sans le déformer', () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.addNode('rounded', 0, 12)
    store.addLink([
      [8, 6],
      [8, 12]
    ])
    store.selectAll()
    store.moveSelection(3, -2)
    expect(store.doc.links[0]?.points).toEqual([
      [11, 4],
      [11, 10]
    ])
    expect(store.doc.nodes.map((node) => [node.x, node.y])).toEqual([
      [3, -2],
      [3, 10]
    ])
  })

  it('pose une étiquette le long du lien, la déplace, la retire ; inverse le sens', () => {
    const store = useDiagramStore()
    const id = store.addLink([
      [0, 0],
      [0, 10]
    ])
    if (!id) throw new Error('lien attendu')
    store.setLinkLabel(id, '  vrai ')
    // Au milieu d'un lien vertical, à droite.
    expect(store.doc.links[0]).toMatchObject({ label: 'vrai', labelAt: 0.5, labelSide: 1 })
    store.setLinkLabelPlacement(id, 0.2, -1)
    expect(store.undoLabel).toBe('Déplacer l’étiquette du lien')
    store.setLinkLabel(id, 'faux')
    // Changer le texte ne déplace pas une étiquette déjà posée.
    expect(store.doc.links[0]).toMatchObject({ label: 'faux', labelAt: 0.2, labelSide: -1 })
    // La position reste entre le départ et l'arrivée.
    store.setLinkLabelPlacement(id, 1.4, -1)
    expect(store.doc.links[0]?.labelAt).toBe(1)
    store.setLinkLabelPlacement(id, 0.2, -1)
    // Inverser le sens : l'étiquette reste au même endroit du tracé.
    store.reverseLinks([id])
    expect(store.doc.links[0]).toMatchObject({
      points: [
        [0, 10],
        [0, 0]
      ],
      startArrow: true,
      endArrow: false,
      labelAt: 0.8,
      labelSide: -1
    })
    store.setLinkLabel(id, '')
    expect(store.doc.links[0]?.label).toBe('')
  })
})

describe('diagramme : textes, copies, onglets', () => {
  it('pose un texte libre et le style comme une étiquette du montage', () => {
    const store = useDiagramStore()
    const id = store.addText(10, 4)
    expect(store.doc.texts[0]).toMatchObject({ x: 6, y: 4, w: 8, h: 2, text: 'Texte', size: 12 })
    store.setTextContent(id, 'note')
    store.setTextStyle(id, 'Gras activé', { bold: true })
    store.setTextVertical(id, true)
    expect(store.doc.texts[0]).toMatchObject({
      text: 'note',
      bold: true,
      vertical: true,
      w: 2,
      h: 8
    })
  })

  it('copie, colle et duplique avec de nouveaux identifiants', () => {
    const store = useDiagramStore()
    store.addNode('rounded', 0, 0)
    store.addLink([
      [8, 6],
      [8, 12]
    ])
    store.selectAll()
    store.copySelection()
    store.pasteClipboardAt(40, 20)
    expect(store.doc.nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      ['n1', 0, 0],
      ['n2', 40, 20]
    ])
    expect(store.doc.links[1]?.points).toEqual([
      [48, 26],
      [48, 32]
    ])
    expect(store.selectedNodes).toEqual(['n2'])
    store.duplicateSelectionAt(0, 10)
    expect(store.doc.nodes).toHaveLength(3)
    store.removeSelection()
    expect(store.doc.nodes).toHaveLength(2)
  })

  it('un diagramme vide et sans fichier n’a rien à enregistrer', () => {
    const store = useDiagramStore()
    expect(store.pristine).toBe(true)
    store.setName('Essai')
    expect(store.dirty).toBe(false)
    store.addNode('start', 0, 0)
    expect(store.dirty).toBe(true)
    store.newDiagram()
    expect(store.tabs.map((tab) => [tab.name, tab.dirty])).toEqual([
      ['Essai', true],
      ['Nouveau diagramme', false]
    ])
  })

  it('enregistre en .pinuml, rouvre le même onglet, et tient ses copies de secours', async () => {
    const store = useDiagramStore()
    const library = useLibraryStore()
    store.setName('Boucle')
    store.addNode('diamond', 0, 0)
    await syncDiagramAutosaves(store.dirtyDocuments())
    expect(await readDiagramAutosaves()).toHaveLength(1)
    fs.saveDialogAnswers.push('D:/Cours/boucle')
    expect(await saveDiagram(store, library)).toBe(true)
    expect(store.filePath).toBe('D:/Cours/boucle.pinuml')
    expect(store.dirty).toBe(false)
    expect(await readDiagramAutosaves()).toEqual([])
    const written = fs.texts.get('D:/Cours/boucle.pinuml') ?? ''
    expect(parseDiagram(written)).toEqual(store.doc)
    expect(serializeDiagram(store.doc)).toBe(written)
    // Le rouvrir ramène son onglet.
    store.newDiagram()
    expect(await store.openPath('D:/Cours/boucle.pinuml')).toBe(true)
    expect(store.tabs).toHaveLength(2)
    expect(store.doc.name).toBe('Boucle')
  })

  it('demande avant de fermer un diagramme modifié', async () => {
    const store = useDiagramStore()
    const library = useLibraryStore()
    store.addNode('start', 0, 0)
    fs.confirmSaveAnswers.push('cancel')
    expect(await closeDiagramTabAsking(store, library, store.activeTabId)).toBe(false)
    fs.confirmSaveAnswers.push('discard')
    expect(await closeDiagramTabAsking(store, library, store.activeTabId)).toBe(true)
    expect(store.doc.nodes).toHaveLength(0)
  })
})
