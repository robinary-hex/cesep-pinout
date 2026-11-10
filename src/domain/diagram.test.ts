import { describe, expect, it } from 'vitest'
import {
  createEmptyDiagram,
  DEFAULT_DIAGRAM_STYLE,
  fittedNodeSize,
  isEmptyDiagram,
  NODE_SHAPES,
  NODE_SPECS,
  nodeSizeProblem,
  type DiagramLink,
  type DiagramNode
} from './diagram'
import {
  defaultLabelOffset,
  diagramBounds,
  linkArrowHead,
  linkLabelCenter,
  linkRenderPoints,
  linksFollowingNodes,
  movedAnchor,
  nodeAnchors,
  pathMidpoint
} from './diagramLinks'
import {
  DARK_GROUND,
  groundOf,
  layoutNodeText,
  LIGHT_GROUND,
  mixColors,
  nodePaint,
  nodeParts
} from './diagramShapes'
import fixture from './fixtures/v1/diagram.json?raw'
import { FileFormatError } from './migrations'
import { parseDiagram, serializeDiagram } from './serialize'

const style = DEFAULT_DIAGRAM_STYLE

function node(patch: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'n1',
    shape: 'rounded',
    x: 0,
    y: 0,
    w: 16,
    h: 6,
    title: 'Titre',
    subtitle: '',
    color: '#000000',
    fill: 'none',
    ...patch
  }
}

function link(points: [number, number][], patch: Partial<DiagramLink> = {}): DiagramLink {
  return {
    id: 'l1',
    points,
    color: '#000000',
    dash: 'solid',
    startArrow: false,
    endArrow: true,
    label: '',
    labelDx: 0,
    labelDy: 0,
    ...patch
  }
}

describe('diagramme : format', () => {
  it('lit et réécrit un fichier sans rien perdre', () => {
    const diagram = parseDiagram(fixture)
    expect(diagram.schemaVersion).toBe(1)
    expect(diagram.nodes.map((entry) => entry.shape)).toEqual([
      'start',
      'diamond',
      'rounded',
      'bar'
    ])
    expect(diagram.links[1]).toMatchObject({ label: 'vrai', labelDx: 10, endArrow: true })
    expect(diagram.texts[0]?.text).toBe('tant que')
    expect(parseDiagram(serializeDiagram(diagram))).toEqual(diagram)
  })

  it('refuse des identifiants en double, un lien en biais et une taille impossible', () => {
    const base = parseDiagram(fixture)
    const broken = (patch: object): string => JSON.stringify({ ...base, ...patch })
    expect(() => parseDiagram(broken({ nodes: [node(), node()] }))).toThrow(FileFormatError)
    expect(() =>
      parseDiagram(
        broken({
          links: [
            link([
              [0, 0],
              [3, 2]
            ])
          ]
        })
      )
    ).toThrow(FileFormatError)
    expect(() => parseDiagram(broken({ nodes: [node({ shape: 'diamond', w: 5 })] }))).toThrow(
      FileFormatError
    )
  })

  it('part d’un diagramme vide au style par défaut', () => {
    const diagram = createEmptyDiagram('Essai')
    expect(isEmptyDiagram(diagram)).toBe(true)
    expect(diagram.style).toEqual(DEFAULT_DIAGRAM_STYLE)
    expect(diagram.style).not.toBe(DEFAULT_DIAGRAM_STYLE)
    expect(parseDiagram(serializeDiagram(diagram))).toEqual(diagram)
  })
})

describe('diagramme : formes', () => {
  it('donne à chaque forme une taille par défaut valide et de quoi la dessiner', () => {
    for (const shape of NODE_SHAPES) {
      const size = NODE_SPECS[shape].defaultSize
      const sample = node({ shape, ...size })
      expect(nodeSizeProblem(sample), shape).toBeNull()
      const parts = nodeParts(sample, style)
      expect(parts.length, shape).toBeGreaterThan(0)
      for (const part of parts) expect(part.d, shape).toMatch(/^M [0-9A-Za-z .-]+$/)
    }
  })

  it('ramène une taille à ce que la forme permet', () => {
    expect(fittedNodeSize('rounded', 0, 3)).toEqual({ w: 1, h: 3 })
    // Losange : dimensions paires, pour que ses pointes tombent sur la grille.
    expect(fittedNodeSize('diamond', 5, 3)).toEqual({ w: 6, h: 4 })
    expect(fittedNodeSize('diamond', 0, 0)).toEqual({ w: 2, h: 2 })
    // Disque : carré, le plus grand côté l'emporte.
    expect(fittedNodeSize('start', 4, 2)).toEqual({ w: 4, h: 4 })
    // Barre : épaisseur nulle, dans le sens qu'elle avait.
    expect(fittedNodeSize('bar', 12, 3)).toEqual({ w: 12, h: 0 })
    expect(fittedNodeSize('bar', 3, 12, { w: 0, h: 8 })).toEqual({ w: 0, h: 12 })
    expect(nodeSizeProblem({ shape: 'bar', w: 4, h: 2 })).not.toBeNull()
    expect(nodeSizeProblem({ shape: 'start', w: 4, h: 2 })).not.toBeNull()
  })

  it('centre le titre et le sous-titre en un bloc, hors de la pointe d’un signal', () => {
    const layout = layoutNodeText(node({ subtitle: 'détail' }), style)
    if (!layout) throw new Error('texte attendu')
    expect(layout.x).toBe(8)
    expect(layout.lines.map((line) => [line.text, line.role])).toEqual([
      ['Titre', 'title'],
      ['détail', 'subtitle']
    ])
    // Bloc de 1,68 + 1,44 cellule de haut, centré sur y = 3.
    expect(layout.lines[0]?.y).toBeCloseTo(3 - 1.56 + 0.84 + 0.35 * 1.4)
    expect(layout.lines[1]?.size).toBeCloseTo(1.2)
    // Envoi de 16 × 6 : pointe de 3 cellules, le texte se centre sur les 13 autres.
    expect(layoutNodeText(node({ shape: 'send' }), style)?.x).toBe(6.5)
    expect(layoutNodeText(node({ shape: 'receive' }), style)?.x).toBe(9.5)
    expect(layoutNodeText(node({ title: '' }), style)).toBeNull()
    expect(layoutNodeText(node({ shape: 'start', w: 2, h: 2 }), style)).toBeNull()
  })

  it('mêle deux couleurs et choisit l’encre d’après le papier', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixColors('#ff0000', '#0000ff', 1)).toBe('#ff0000')
    expect(groundOf('#ffffff')).toEqual(LIGHT_GROUND)
    expect(groundOf('#20242c')).toMatchObject({ ink: '#e6edf3', dark: true })
  })

  it('contour : le trait a la couleur, pas de fond, texte à l’encre', () => {
    expect(nodePaint({ color: '#1d4ed8', fill: 'none' }, LIGHT_GROUND)).toEqual({
      stroke: '#1d4ed8',
      fill: null,
      solid: '#1d4ed8',
      text: '#000000'
    })
    // Le noir pur est l'encre : claire sur un papier sombre.
    expect(nodePaint({ color: '#000000', fill: 'none' }, DARK_GROUND)).toMatchObject({
      stroke: '#e6edf3',
      text: '#e6edf3'
    })
  })

  it('teinté : fond plus clair que le contour sur papier clair, plus sombre sur papier sombre', () => {
    const light = nodePaint({ color: '#1d4ed8', fill: 'tint' }, LIGHT_GROUND)
    expect(light.stroke).toBe('#1d4ed8')
    expect(light.fill).toBe(mixColors('#1d4ed8', '#ffffff', 0.16))
    expect(light.text).toBe('#000000')
    const dark = nodePaint({ color: '#7f77dd', fill: 'tint' }, DARK_GROUND)
    expect(dark.fill).toBe(mixColors('#7f77dd', '#16181d', 0.38))
    expect(dark.text).toBe('#e6edf3')
  })

  it('plein : le fond est la couleur, le contour s’en détache, le texte contraste', () => {
    // Couleur sombre : contour éclairci, texte blanc.
    const deep = nodePaint({ color: '#3c3489', fill: 'solid' }, LIGHT_GROUND)
    expect(deep.fill).toBe('#3c3489')
    expect(deep.stroke).toBe(mixColors('#3c3489', '#ffffff', 0.62))
    expect(deep.text).toBe('#ffffff')
    // Couleur claire : contour foncé, texte noir.
    const pale = nodePaint({ color: '#ffd33d', fill: 'solid' }, DARK_GROUND)
    expect(pale.stroke).toBe(mixColors('#ffd33d', '#000000', 0.62))
    expect(pale.text).toBe('#000000')
    // Plein à l'encre sur papier sombre : fond clair, texte noir.
    expect(nodePaint({ color: '#000000', fill: 'solid' }, DARK_GROUND)).toMatchObject({
      fill: '#e6edf3',
      text: '#000000'
    })
  })
})

describe('diagramme : accroche des liens', () => {
  it('offre le tour d’un rectangle, les quatre pointes d’un losange, toute une barre', () => {
    const box = nodeAnchors(node({ w: 4, h: 2 }))
    expect(box).toHaveLength(12)
    expect(box).toContainEqual([0, 1])
    expect(box).toContainEqual([4, 2])
    expect(nodeAnchors(node({ shape: 'diamond', w: 4, h: 4 }))).toEqual([
      [2, 0],
      [2, 4],
      [0, 2],
      [4, 2]
    ])
    expect(nodeAnchors(node({ shape: 'bar', w: 3, h: 0 }))).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0]
    ])
  })

  it('suit le contour des signaux et de la note', () => {
    const send = nodeAnchors(node({ shape: 'send', w: 16, h: 6 }))
    // Pointe de 3 : le haut s'arrête à x = 13, le côté droit n'a que sa pointe.
    expect(send).toContainEqual([13, 0])
    expect(send).not.toContainEqual([14, 0])
    expect(send.filter((point) => point[0] === 16)).toEqual([[16, 3]])
    const receive = nodeAnchors(node({ shape: 'receive', w: 16, h: 6 }))
    expect(receive).toContainEqual([3, 3])
    expect(receive).not.toContainEqual([0, 3])
    const note = nodeAnchors(node({ shape: 'note', w: 16, h: 6 }))
    expect(note).not.toContainEqual([16, 0])
    expect(note).toContainEqual([14, 0])
    expect(note).toContainEqual([16, 2])
  })

  it('déplace une accroche avec sa boîte : bord, milieu, ou position gardée', () => {
    const before = { x: 0, y: 0, w: 8, h: 4 }
    // Déplacement simple.
    expect(movedAnchor(before, { x: 3, y: 1, w: 8, h: 4 }, [2, 0])).toEqual([5, 1])
    // Élargie par la droite : le bord droit suit, le milieu du haut reste au milieu.
    const wider = { x: 0, y: 0, w: 12, h: 4 }
    expect(movedAnchor(before, wider, [8, 2])).toEqual([12, 2])
    expect(movedAnchor(before, wider, [4, 0])).toEqual([6, 0])
    expect(movedAnchor(before, wider, [2, 4])).toEqual([2, 4])
    // Rétrécie par la gauche : un point du haut garde sa place, bornée à la nouvelle boîte.
    expect(movedAnchor(before, { x: 5, y: 0, w: 3, h: 4 }, [2, 0])).toEqual([5, 0])
  })

  it('fait suivre les extrémités posées sur un nœud déplacé ou redimensionné', () => {
    const a = node({ id: 'a', x: 0, y: 0, w: 8, h: 4 })
    const b = node({ id: 'b', x: 0, y: 10, w: 8, h: 4 })
    const down = link([
      [4, 4],
      [4, 10]
    ])
    // b glisse de 6 vers la droite : l'arrivée suit, un coude apparaît.
    const moved = linksFollowingNodes([down], [a, b], [a, { ...b, x: 6 }])
    expect(moved[0]?.points.at(0)).toEqual([4, 4])
    expect(moved[0]?.points.at(-1)).toEqual([10, 10])
    expect(moved[0]?.points.length).toBeGreaterThan(2)
    // Rien ne bouge : le même objet revient.
    expect(linksFollowingNodes([down], [a, b], [a, b])[0]).toBe(down)
    // Un lien libre n'est pas concerné.
    const free = link(
      [
        [20, 0],
        [20, 5]
      ],
      { id: 'l2' }
    )
    expect(linksFollowingNodes([free], [a], [{ ...a, x: 2 }])[0]).toBe(free)
  })

  it('garde l’accroche quand la forme change, sur le point le plus proche', () => {
    const box = node({ id: 'a', x: 0, y: 0, w: 4, h: 4 })
    const side = link([
      [1, 0],
      [1, -5]
    ])
    const followed = linksFollowingNodes([side], [box], [{ ...box, shape: 'diamond' }])
    expect(followed[0]?.points.at(0)).toEqual([2, 0])
  })
})

describe('diagramme : dessin des liens', () => {
  it('ouvre une pointe en V vers l’arrivée', () => {
    const head = linkArrowHead({ x: 0, y: 0 }, { x: 0, y: 5 }, 0.15)
    expect(head).toHaveLength(3)
    expect(head?.[1]).toEqual({ x: 0, y: 5 })
    expect(head?.[0]?.y).toBeCloseTo(4.1)
    expect(Math.abs(head?.[0]?.x ?? 0)).toBeCloseTo(0.45)
    expect(linkArrowHead({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.15)).toBeNull()
  })

  it('arrête au bord de la barre un lien qui arrive de face', () => {
    const bar = node({ id: 'b', shape: 'bar', x: 0, y: 10, w: 8, h: 0 })
    const arriving = link([
      [4, 4],
      [4, 10]
    ])
    expect(linkRenderPoints(arriving, [bar]).at(-1)).toEqual([4, 9.7])
    const leaving = link([
      [2, 10],
      [2, 14]
    ])
    expect(linkRenderPoints(leaving, [bar])[0]).toEqual([2, 10.3])
    // Le long de la barre, ou sans barre : rien ne change.
    const along = link([
      [8, 10],
      [12, 10]
    ])
    expect(linkRenderPoints(along, [bar])).toEqual(along.points)
    expect(linkRenderPoints(arriving, [])).toEqual(arriving.points)
  })

  it('place l’étiquette depuis le milieu du tracé', () => {
    const points: [number, number][] = [
      [0, 0],
      [0, 4],
      [8, 4]
    ]
    // 12 de long : le milieu est à 6, donc 2 cellules après le coude, sur le segment horizontal.
    expect(pathMidpoint(points)).toEqual({ point: { x: 2, y: 4 }, horizontal: true })
    expect(linkLabelCenter(link(points, { label: 'oui', labelDx: 4, labelDy: -6 }))).toEqual({
      x: 3,
      y: 2.5
    })
    // Par défaut : au-dessus d'un segment horizontal, à droite d'un vertical.
    expect(defaultLabelOffset(points, 'oui', style).dx).toBe(0)
    expect(defaultLabelOffset(points, 'oui', style).dy).toBeLessThan(0)
    const vertical: [number, number][] = [
      [0, 0],
      [0, 6]
    ]
    expect(defaultLabelOffset(vertical, 'oui', style).dx).toBeGreaterThan(0)
  })

  it('mesure le diagramme entier, étiquettes et textes compris', () => {
    const diagram = parseDiagram(fixture)
    const bounds = diagramBounds(diagram)
    if (!bounds) throw new Error('limites attendues')
    // À gauche le lien de retour (-4) ; à droite le texte libre (20 + 8) ; en bas la barre.
    expect(bounds.x).toBe(-4)
    expect(bounds.x + bounds.width).toBe(28)
    expect(bounds.y).toBe(0)
    expect(bounds.y + bounds.height).toBeCloseTo(30.3)
    expect(diagramBounds(createEmptyDiagram('Vide'))).toBeNull()
  })
})
