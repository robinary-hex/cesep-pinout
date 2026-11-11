import { describe, expect, it } from 'vitest'
import {
  createEmptyDiagram,
  createNode,
  DEFAULT_DIAGRAM_STYLE,
  defaultNodeTextStyle,
  fittedNodeSize,
  isEmptyDiagram,
  NODE_FAMILIES,
  NODE_SHAPES,
  NODE_SPECS,
  nodeSizeProblem,
  type DiagramLink,
  type DiagramNode
} from './diagram'
import {
  defaultLabelSide,
  diagramBounds,
  linkArrowGap,
  linkArrowHead,
  linkLabelPlacement,
  linkRenderPoints,
  linkShape,
  anchorNormals,
  linkEndAt,
  linksFollowingNodes,
  movedAnchor,
  moveLinkSegment,
  nearestOnPath,
  nodeAnchors,
  pathMidpoint,
  pathPointAt,
  routeLink,
  touchesNote
} from './diagramLinks'
import {
  DARK_GROUND,
  DIAMOND_ROUNDING,
  estimatedNodeTextWidth,
  groundOf,
  layoutNodeText,
  LIGHT_GROUND,
  mixColors,
  nodeBoxFollowingText,
  nodeBoxForText,
  nodeLineAttrs,
  nodePaint,
  nodeParts,
  nodeSizeForText,
  nodeTextBox
} from './diagramShapes'
import fixtureV1 from './fixtures/v1/diagram.json?raw'
import fixtureV2 from './fixtures/v2/diagram.json?raw'
import fixture from './fixtures/v3/diagram.json?raw'
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
    font: null,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
    textScale: 1,
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
    labelAt: 0.5,
    labelSide: 1,
    labelBackground: false,
    ...patch
  }
}

describe('diagramme : format', () => {
  it('lit et réécrit un fichier sans rien perdre', () => {
    const diagram = parseDiagram(fixture)
    expect(diagram.schemaVersion).toBe(4)
    expect(diagram.nodes.map((entry) => entry.shape)).toEqual([
      'start',
      'diamond',
      'rounded',
      'bar'
    ])
    expect(diagram.links[1]).toMatchObject({
      label: 'vrai',
      labelAt: 0.25,
      labelSide: 1,
      endArrow: true
    })
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

  it('v1 → v2 : chaque nœud reçoit un style de texte qui garde son allure', () => {
    // Diagramme en chasse fixe : le titre y était maigre, il le reste.
    const mono = parseDiagram(fixtureV1)
    expect(mono.schemaVersion).toBe(4)
    expect(mono.nodes[1]).toMatchObject({
      title: 'condition',
      font: null,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      textScale: 1
    })
    // En police normale, le titre était demi-gras : il devient gras.
    const raw = JSON.parse(fixtureV1) as { style: { font: string } }
    raw.style.font = 'sans'
    expect(parseDiagram(JSON.stringify(raw)).nodes[1]?.bold).toBe(true)
  })

  it('v2 → v3 : l’étiquette d’un lien revient au milieu du tracé, du côté où elle était', () => {
    const diagram = parseDiagram(fixtureV2)
    expect(diagram.schemaVersion).toBe(4)
    // « vrai » était décalée vers la droite d'un lien vertical : elle reste à droite.
    expect(diagram.links[1]).toMatchObject({ label: 'vrai', labelAt: 0.5, labelSide: 1 })
    expect('labelDx' in (diagram.links[1] ?? {})).toBe(false)
    // À gauche d'un lien vertical, ou au-dessus d'un horizontal : l'autre côté.
    const raw = JSON.parse(fixtureV2) as { links: { labelDx: number; labelDy: number }[] }
    const second = raw.links[1]
    if (second) second.labelDx = -6
    expect(parseDiagram(JSON.stringify(raw)).links[1]?.labelSide).toBe(-1)
  })

  it('v3 → v4 : étiquettes de lien et textes libres restent sans fond', () => {
    const diagram = parseDiagram(fixture)
    expect(diagram.links.map((entry) => entry.labelBackground)).toEqual([false, false, false])
    expect(diagram.texts.every((text) => !text.background)).toBe(true)
    // Un fond déjà choisi n'est pas effacé par la migration.
    const raw = JSON.parse(fixture) as { links: { labelBackground?: boolean }[] }
    const second = raw.links[1]
    if (second) second.labelBackground = true
    expect(parseDiagram(JSON.stringify(raw)).links[1]?.labelBackground).toBe(true)
  })

  it('pose un nœud neuf au style de texte par défaut du diagramme', () => {
    expect(createNode('n1', 'rounded', 3, 4)).toMatchObject({
      x: 3,
      y: 4,
      w: 16,
      h: 6,
      fill: 'tint',
      font: null,
      bold: true,
      textScale: 1
    })
    expect(defaultNodeTextStyle({ ...style, font: 'mono' }).bold).toBe(false)
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

  it('range chaque forme du catalogue dans une famille, dans l’ordre de la bibliothèque', () => {
    expect(NODE_FAMILIES.flatMap((family) => family.shapes)).toEqual([...NODE_SHAPES])
    expect(NODE_FAMILIES.map((family) => family.label)).toEqual([
      'Général',
      'Organigramme',
      'Activité',
      'Communication'
    ])
  })

  it('dessine les formes d’organigramme et de communication dans leur boîte', () => {
    // Sous-programme : le rectangle, puis ses deux barres à une cellule des bords.
    const subroutine = nodeParts(node({ shape: 'subroutine' }), style)
    expect(subroutine).toHaveLength(2)
    expect(subroutine[1]).toMatchObject({ d: 'M 1 0 v 6 M 15 0 v 6', fill: 'none', stroke: true })
    // Parallélogramme : le haut décalé de deux cellules vers la droite, le bas vers la gauche.
    expect(nodeParts(node({ shape: 'io' }), style)[0]?.d).toBe('M 2 0 L 16 0 L 14 6 L 0 6 Z')
    // Cylindre : le corps fermé, puis le bord avant du dessus.
    const database = nodeParts(node({ shape: 'database', w: 10, h: 8 }), style)
    expect(database.map((part) => part.fill)).toEqual(['body', 'none'])
    expect(database[0]?.d).toBe('M 0 1 a 5 1 0 0 1 10 0 v 6 a 5 1 0 0 1 -10 0 Z')
    // Nuage : il part du bas du lobe gauche et son dôme culmine au milieu du haut de la boîte.
    const cloud = nodeParts(node({ shape: 'cloud', w: 20, h: 14 }), style)[0]?.d ?? ''
    expect(cloud.startsWith('M 5 14 A 5 5 0 0 1 ')).toBe(true)
    expect(cloud).toContain('A 6 6 0 0 1 15.6727 4.0455')
    expect(cloud.endsWith('A 5 5 0 0 1 15 14 Z')).toBe(true)
    // Le texte d'un cylindre se centre sous son dessus ; celui d'un nuage, sous son dôme.
    expect(nodeTextBox(node({ shape: 'database', w: 10, h: 8 }))).toEqual({
      x: 0,
      y: 2,
      w: 10,
      h: 6
    })
    const inCloud = nodeTextBox(node({ shape: 'cloud', w: 20, h: 10 }))
    expect(inCloud.x + inCloud.w / 2).toBeCloseTo(10)
    expect(inCloud.y).toBeCloseTo(3)
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

  it('style le titre selon le nœud, garde le sous-titre secondaire, et suit sa police et sa taille', () => {
    const styled = node({
      subtitle: 'détail',
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      textScale: 2
    })
    const layout = layoutNodeText(styled, style)
    const [title, subtitle] = layout?.lines ?? []
    if (!title || !subtitle) throw new Error('deux lignes attendues')
    expect(nodeLineAttrs(title)).toEqual({
      'font-weight': '600',
      'font-style': 'italic',
      'text-decoration': 'underline line-through'
    })
    expect(nodeLineAttrs(subtitle)).toEqual({
      'font-weight': undefined,
      'font-style': undefined,
      'text-decoration': undefined
    })
    // Taille ×2 : les deux lignes doublent.
    expect(title.size).toBeCloseTo(2.8)
    expect(subtitle.size).toBeCloseTo(2.4)
    // Police : celle du diagramme, sauf si le nœud a la sienne ; en chasse fixe le sous-titre
    // passe en italique.
    expect(layout?.font).toBe('sans')
    const mono = layoutNodeText(node({ subtitle: 'détail', font: 'mono', bold: false }), style)
    expect(mono?.font).toBe('mono')
    expect(mono?.lines.map((entry) => entry.italic)).toEqual([false, true])
    expect(layoutNodeText(node({ font: 'sans' }), { ...style, font: 'mono' })?.font).toBe('sans')
    expect(layoutNodeText(node(), { ...style, font: 'mono' })?.font).toBe('mono')
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
    expect(light.fill).toBe(mixColors('#1d4ed8', '#ffffff', 0.2))
    expect(light.text).toBe('#000000')
    const dark = nodePaint({ color: '#7f77dd', fill: 'tint' }, DARK_GROUND)
    expect(dark.fill).toBe(mixColors('#7f77dd', '#16181d', 0.4))
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

  it('calcule la taille qu’il faut à un nœud pour son texte, selon sa forme', () => {
    // Mesure simple : une cellule par caractère.
    const measure = (line: { text: string }): number => line.text.length
    // « Titre » : 5 de large + 2 × 1,5 de marge ; une ligne de 1,68 + 2 × 1 de marge.
    expect(nodeSizeForText(node(), style, measure)).toEqual({ w: 8, h: 4 })
    // Deux lignes : la plus longue fait la largeur, les deux la hauteur.
    expect(
      nodeSizeForText(node({ title: 'Brancher', subtitle: '(Arduino connecté)' }), style, measure)
    ).toEqual({ w: 21, h: 6 })
    // Losange : le texte n'a que la moitié de chaque dimension ; dimensions paires.
    expect(nodeSizeForText(node({ shape: 'diamond' }), style, measure)).toEqual({ w: 16, h: 8 })
    // Envoi : la pointe s'ajoute à la largeur.
    expect(nodeSizeForText(node({ shape: 'send' }), style, measure)).toEqual({ w: 10, h: 4 })
    // Début / fin : ses bouts arrondis ; parallélogramme et sous-programme : leurs bords.
    expect(nodeSizeForText(node({ shape: 'terminal' }), style, measure)).toEqual({ w: 10, h: 4 })
    expect(nodeSizeForText(node({ shape: 'io' }), style, measure)).toEqual({ w: 10, h: 4 })
    expect(nodeSizeForText(node({ shape: 'subroutine' }), style, measure)).toEqual({
      w: 10,
      h: 4
    })
    // Hexagone : ses deux pointes ; renvoi : un cercle, donc un carré ; cylindre : son dessus.
    expect(nodeSizeForText(node({ shape: 'preparation' }), style, measure)).toEqual({
      w: 12,
      h: 4
    })
    expect(nodeSizeForText(node({ shape: 'connector' }), style, measure)).toEqual({ w: 8, h: 8 })
    expect(nodeSizeForText(node({ shape: 'database' }), style, measure)).toEqual({ w: 8, h: 8 })
    // Nuage : le texte n'a que la partie large, sous le dôme.
    expect(nodeSizeForText(node({ shape: 'cloud' }), style, measure)).toEqual({ w: 10, h: 6 })
    expect(nodeSizeForText(node({ title: '' }), style, measure)).toBeNull()
    expect(nodeSizeForText(node({ shape: 'start', w: 2, h: 2 }), style, measure)).toBeNull()
    // L'estimation sans écran : un caractère moyen par lettre.
    const line = layoutNodeText(node({ title: 'abcd', bold: false }), style)?.lines[0]
    if (!line) throw new Error('ligne attendue')
    expect(estimatedNodeTextWidth(line)).toBeCloseTo(4 * 0.55 * 1.4)
    // Le gras élargit un peu ; pas en chasse fixe.
    expect(estimatedNodeTextWidth({ ...line, bold: true })).toBeCloseTo(4 * 0.55 * 1.4 * 1.06)
    expect(estimatedNodeTextWidth({ ...line, bold: true, font: 'mono' })).toBeCloseTo(4 * 0.6 * 1.4)
  })

  it('arrondit les quatre pointes d’un losange sans les éloigner de ses accroches', () => {
    const outline = (shape: DiagramNode, nodeRadius: number): string =>
      nodeParts(shape, { ...style, nodeRadius })[0]?.d ?? ''
    // Losange de 10 × 8, pointes de rayon 1 : le losange intérieur a des demi-diagonales de 4 et
    // 3, donc des côtés de 5, décalés de (0,6 ; 0,8) vers l'extérieur.
    const diamond = node({ shape: 'diamond', w: 10, h: 8 })
    expect(outline(diamond, 1 / DIAMOND_ROUNDING)).toBe(
      'M 5.6 0.2 L 9.6 3.2 A 1 1 0 0 1 9.6 4.8 L 5.6 7.8 A 1 1 0 0 1 4.4 7.8 ' +
        'L 0.4 4.8 A 1 1 0 0 1 0.4 3.2 L 4.4 0.2 A 1 1 0 0 1 5.6 0.2 Z'
    )
    // L'arc de droite, de (9,6 ; 3,2) à (9,6 ; 4,8), a son centre en (9 ; 4) : son sommet est en
    // (10 ; 4), l'accroche de droite, là où un lien s'attache. De même pour les trois autres.
    expect(nodeAnchors(diamond)).toEqual([
      [5, 0],
      [5, 8],
      [0, 4],
      [10, 4]
    ])
    // Même rayon aux quatre pointes d'un losange aplati, aiguës ou obtuses.
    const flat = outline(node({ shape: 'diamond', w: 32, h: 8 }), 1)
    expect(flat.match(/A 0\.5 0\.5 /g)).toHaveLength(4)
    // Sans rayon : quatre sommets vifs, de pointe à pointe.
    expect(outline(diamond, 0)).toBe('M 5 0 L 10 4 L 5 8 L 0 4 Z')
    // Petit losange : le rayon ne dépasse pas le quart d'une dimension.
    expect(outline(node({ shape: 'diamond', w: 2, h: 2 }), 4).match(/A 0\.5 0\.5 /g)).toHaveLength(
      4
    )
  })

  it('fait suivre son texte à un nœud : il grandit, et rétrécit aussi', () => {
    const measure = (line: { text: string }): number => line.text.length
    const follow = (current: DiagramNode, title: string, subtitle = ''): DiagramNode => {
      const edited = { ...current, title, subtitle }
      return { ...edited, ...(nodeBoxFollowingText(current, edited, style, measure) ?? {}) }
    }
    const size = (shown: DiagramNode): number[] => [shown.w, shown.h]
    // Taille par défaut (16 × 6), texte court : rien ne bouge.
    const fresh = node({ title: '', w: 16, h: 6 })
    const short = follow(fresh, 'Titre')
    expect(size(short)).toEqual([16, 6])
    // Texte long : 27 + 3 = 30 de large, autour du centre.
    const long = follow(short, 'Un titre vraiment très long')
    expect(long).toMatchObject({ x: -7, w: 30, h: 6 })
    // Texte raccourci : la largeur redescend à ce qu'il demande, puis à la taille par défaut,
    // pas en dessous ; le centre ne bouge pas.
    expect(follow(long, 'Un titre vraiment long')).toMatchObject({ x: -5, w: 26, h: 6 })
    expect(follow(long, 'Titre')).toMatchObject({ x: 0, w: 16, h: 6 })
    // Un sous-titre de plus tient dans la hauteur par défaut ; le retirer n'y change rien.
    const two = follow(short, 'Titre', '(sous-titre)')
    expect(size(two)).toEqual([16, 6])
    expect(size(follow(two, 'Titre'))).toEqual([16, 6])
    // Texte effacé : retour à la taille par défaut.
    expect(size(follow(long, ''))).toEqual([16, 6])
    // Ajusté au plus près (8 × 4 pour « Titre ») : il épouse encore son texte après.
    const hugging = node({ title: 'Titre', x: 4, y: 1, w: 8, h: 4 })
    expect(follow(hugging, 'Un titre')).toMatchObject({ x: 2, w: 12, h: 4 })
    expect(follow(hugging, 'Oui')).toMatchObject({ x: 5, w: 6, h: 4 })
    // Réglé à la main, plus grand qu'il ne faut : il garde sa taille, et ne fait que grandir.
    const manual = node({ title: 'Titre', w: 24, h: 10 })
    expect(size(follow(manual, 'Oui'))).toEqual([24, 10])
    expect(size(follow(manual, 'Un titre vraiment très long'))).toEqual([30, 10])
    // Largeur réglée à la main, hauteur par défaut : chacune suit sa règle.
    const wide = node({ title: 'Titre', w: 24, h: 6 })
    expect(size(follow(wide, 'Titre', '(sous-titre)'))).toEqual([24, 6])
    // Losange : sa taille par défaut est petite, il épouse toujours son texte.
    const diamond = follow(node({ shape: 'diamond', title: '', w: 4, h: 4 }), 'Titre')
    expect(size(diamond)).toEqual([16, 8])
    expect(size(follow(diamond, 'Oui'))).toEqual([12, 8])
    expect(size(follow(diamond, 'Un titre'))).toEqual([22, 8])
    // Une forme sans texte ne change pas.
    const start = node({ shape: 'start', title: '', w: 2, h: 2 })
    expect(nodeBoxFollowingText(start, { ...start, title: 'x' }, style, measure)).toBeNull()
    // Le style du texte compte comme le texte : ×3 grossit la boîte, ×1 la ramène.
    const big = { ...short, textScale: 3 }
    const grown = { ...big, ...(nodeBoxFollowingText(short, big, style, measure) ?? {}) }
    expect(grown.h).toBeGreaterThan(6)
    const back = { ...grown, textScale: 1 }
    expect(nodeBoxFollowingText(grown, back, style, measure)).toMatchObject({ w: 16, h: 6 })
  })

  it('ajuste la boîte autour de son centre, ou la fait seulement grandir', () => {
    const measure = (line: { text: string }): number => line.text.length
    const wide = node({ title: 'Un titre vraiment très long' })
    // 27 + 3 = 30 de large : la boîte de 16 grandit de 14, moitié de chaque côté.
    expect(nodeBoxForText(wide, style, measure, true)).toEqual({ x: -7, y: 0, w: 30, h: 6 })
    // Au plus près : la hauteur redescend à 4, d'une cellule en haut et en bas.
    expect(nodeBoxForText(wide, style, measure, false)).toEqual({ x: -7, y: 1, w: 30, h: 4 })
    // Le texte tient déjà : rien à faire pour grandir.
    expect(nodeBoxForText(node(), style, measure, true)).toBeNull()
    // Écart impair : une cellule de plus, pour que le centre reste sur la grille.
    expect(nodeBoxForText(node({ title: 'Abcdefgh' }), style, measure, false)).toEqual({
      x: 2,
      y: 1,
      w: 12,
      h: 4
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

  it('suit le contour des formes d’organigramme et de communication', () => {
    // Début / fin de 12 × 4 : bouts de rayon 2, donc le haut de x = 2 à 10, et les deux pointes.
    const terminal = nodeAnchors(node({ shape: 'terminal', w: 12, h: 4 }))
    expect(terminal).toHaveLength(20)
    expect(terminal).toContainEqual([2, 0])
    expect(terminal).toContainEqual([10, 4])
    expect(terminal).toContainEqual([0, 2])
    expect(terminal).not.toContainEqual([1, 0])
    expect(terminal).not.toContainEqual([0, 1])
    // Hexagone : pointes de 3, le haut de x = 3 à 13.
    const hexagon = nodeAnchors(node({ shape: 'preparation', w: 16, h: 6 }))
    expect(hexagon).toContainEqual([3, 0])
    expect(hexagon).toContainEqual([13, 6])
    expect(hexagon).not.toContainEqual([2, 0])
    expect(hexagon.filter((point) => point[0] === 0 || point[0] === 16)).toEqual([
      [0, 3],
      [16, 3]
    ])
    // Parallélogramme : haut décalé à droite, bas à gauche, milieu des côtés penchés.
    const parallelogram = nodeAnchors(node({ shape: 'io', w: 16, h: 6 }))
    expect(parallelogram).toContainEqual([2, 0])
    expect(parallelogram).toContainEqual([16, 0])
    expect(parallelogram).toContainEqual([0, 6])
    expect(parallelogram).toContainEqual([14, 6])
    expect(parallelogram).toContainEqual([1, 3])
    expect(parallelogram).toContainEqual([15, 3])
    expect(parallelogram).not.toContainEqual([0, 0])
    expect(parallelogram).not.toContainEqual([16, 6])
    // Cylindre : le sommet et le bas au milieu, les côtés droits entre les deux ellipses.
    const cylinder = nodeAnchors(node({ shape: 'database', w: 10, h: 8 }))
    expect(cylinder).toContainEqual([5, 0])
    expect(cylinder).toContainEqual([5, 8])
    expect(cylinder).toContainEqual([0, 1])
    expect(cylinder).toContainEqual([10, 7])
    expect(cylinder).not.toContainEqual([0, 0])
    // Renvoi et nuage : le milieu de leurs quatre côtés ; sous-programme : tout son tour.
    const tips = [
      [2, 0],
      [2, 4],
      [0, 2],
      [4, 2]
    ]
    expect(nodeAnchors(node({ shape: 'connector', w: 4, h: 4 }))).toEqual(tips)
    expect(nodeAnchors(node({ shape: 'cloud', w: 4, h: 4 }))).toEqual(tips)
    expect(nodeAnchors(node({ shape: 'subroutine', w: 4, h: 2 }))).toHaveLength(12)
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
  it('dessine une pointe pleine vers l’arrivée, un petit triangle équilatéral', () => {
    const head = linkArrowHead({ x: 0, y: 0 }, { x: 0, y: 5 }, 0.15)
    // Coin, pointe, coin : 0,7 de côté, donc 0,61 de haut.
    expect(head).toHaveLength(3)
    expect(head?.[1]).toEqual({ x: 0, y: 5 })
    expect(head?.[0]?.x).toBeCloseTo(-0.35)
    expect(head?.[0]?.y).toBeCloseTo(4.394)
    expect(head?.[2]?.x).toBeCloseTo(0.35)
    expect(head?.[2]?.y).toBeCloseTo(4.394)
    // Trois côtés égaux, dans n'importe quelle direction.
    const sides = (points: readonly { x: number; y: number }[]): number[] =>
      points.map((point, index) => {
        const next = points[(index + 1) % points.length] ?? point
        return Math.hypot(next.x - point.x, next.y - point.y)
      })
    for (const length of sides(head ?? [])) expect(length).toBeCloseTo(0.7)
    const sideways = linkArrowHead({ x: 9, y: 2 }, { x: 3, y: 2 }, 0.15)
    expect(sideways?.[1]).toEqual({ x: 3, y: 2 })
    for (const length of sides(sideways ?? [])) expect(length).toBeCloseTo(0.7)
    // Un trait épais a une pointe à sa mesure.
    for (const length of sides(linkArrowHead({ x: 0, y: 0 }, { x: 0, y: 5 }, 0.4) ?? [])) {
      expect(length).toBeCloseTo(1.8)
    }
    expect(linkArrowHead({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.15)).toBeNull()
  })

  it('arrête le trait dans sa pointe, et garde le bout visible pour la sélection', () => {
    const arriving = link([
      [4, 4],
      [4, 10]
    ])
    const shape = linkShape(arriving, [], 0.15)
    // La pointe finit 0,4 avant le sommet ; le trait s'arrête 0,35 plus tôt, dans la pointe.
    expect(shape.points.at(-1)).toEqual([4, 9.6])
    expect(shape.stroke.at(-1)?.[1]).toBeCloseTo(9.25)
    expect(shape.stroke[0]).toEqual([4, 4])
    expect(shape.heads).toHaveLength(1)
    expect(shape.heads[0]?.[1]).toEqual({ x: 4, y: 9.6 })
    // Sans pointe : rien à dessiner de plus, le trait va au bout.
    const plain = linkShape({ ...arriving, endArrow: false }, [], 0.15)
    expect(plain.heads).toEqual([])
    expect(plain.stroke).toEqual(arriving.points)
    // Deux pointes : une à chaque bout.
    expect(linkShape({ ...arriving, startArrow: true }, [], 0.15).heads).toHaveLength(2)
  })

  it('laisse un petit espace devant une pointe de flèche, au dessin seulement', () => {
    expect(linkArrowGap(0.15)).toBe(0.4)
    expect(linkArrowGap(0.4)).toBe(1)
    const arriving = link([
      [4, 4],
      [4, 10]
    ])
    // Flèche à l'arrivée : le trait s'arrête 0,4 cellule avant ; le départ, sans pointe, ne bouge pas.
    expect(linkRenderPoints(arriving, [], 0.15)).toEqual([
      [4, 4],
      [4, 9.6]
    ])
    // Les sommets du lien, eux, n'ont pas changé.
    expect(arriving.points.at(-1)).toEqual([4, 10])
    // Sans pointe, rien ne recule ; avec deux pointes, les deux bouts.
    expect(linkRenderPoints({ ...arriving, endArrow: false }, [], 0.15)).toEqual(arriving.points)
    expect(linkRenderPoints({ ...arriving, startArrow: true }, [], 0.15)).toEqual([
      [4, 4.4],
      [4, 9.6]
    ])
    // Un segment très court ne recule jamais de plus de sa moitié.
    const short = link([
      [0, 0],
      [0.5, 0]
    ])
    expect(linkRenderPoints(short, [], 0.15).at(-1)).toEqual([0.25, 0])
  })

  it('arrête au bord de la barre un lien qui arrive de face', () => {
    const bar = node({ id: 'b', shape: 'bar', x: 0, y: 10, w: 8, h: 0 })
    const arriving = link(
      [
        [4, 4],
        [4, 10]
      ],
      { endArrow: false }
    )
    expect(linkRenderPoints(arriving, [bar], 0.15).at(-1)).toEqual([4, 9.7])
    // Avec une pointe : le bord de la barre, puis l'espace devant la pointe.
    expect(linkRenderPoints({ ...arriving, endArrow: true }, [bar], 0.15).at(-1)?.[1]).toBeCloseTo(
      9.3
    )
    const leaving = link(
      [
        [2, 10],
        [2, 14]
      ],
      { endArrow: false }
    )
    expect(linkRenderPoints(leaving, [bar], 0.15)[0]).toEqual([2, 10.3])
    // Le long de la barre, ou sans barre : rien ne change.
    const along = link(
      [
        [8, 10],
        [12, 10]
      ],
      { endArrow: false }
    )
    expect(linkRenderPoints(along, [bar], 0.15)).toEqual(along.points)
    expect(linkRenderPoints(arriving, [], 0.15)).toEqual(arriving.points)
  })

  it('repère un point le long du tracé, et le point du tracé le plus proche d’un autre', () => {
    const points: [number, number][] = [
      [0, 0],
      [0, 4],
      [8, 4]
    ]
    // 12 de long : le milieu est à 6, donc 2 cellules après le coude, sur le segment horizontal.
    expect(pathMidpoint(points)).toEqual({ point: { x: 2, y: 4 }, horizontal: true })
    expect(pathPointAt(points, 0.25)).toEqual({ point: { x: 0, y: 3 }, horizontal: false })
    expect(pathPointAt(points, 0)).toEqual({ point: { x: 0, y: 0 }, horizontal: false })
    expect(pathPointAt(points, 1)).toEqual({ point: { x: 8, y: 4 }, horizontal: true })
    // Au-dessus du segment horizontal, à 3 cellules du coude : 7 sur 12, côté « au-dessus ».
    expect(nearestOnPath(points, { x: 3, y: 3 })).toEqual({ at: 7 / 12, side: -1 })
    // À droite du segment vertical.
    expect(nearestOnPath(points, { x: 1, y: 2 })).toEqual({ at: 2 / 12, side: 1 })
    // La position se cale sur la demi-cellule ; au-delà du bout, elle s'y arrête.
    expect(nearestOnPath(points, { x: 5.3, y: 6 })).toEqual({ at: 9.5 / 12, side: 1 })
    expect(nearestOnPath(points, { x: 20, y: 4.5 })).toEqual({ at: 1, side: 1 })
  })

  it('tient l’étiquette à distance fixe du trait, d’un côté ou de l’autre', () => {
    const vertical = link(
      [
        [0, 0],
        [0, 10]
      ],
      { label: 'vrai' }
    )
    // À droite d'un lien vertical : le texte part du trait, 0,6 cellule plus la demi-épaisseur.
    const right = linkLabelPlacement(vertical, style)
    expect(right?.anchor).toBe('start')
    expect(right?.box.x).toBeCloseTo(0.675)
    expect(right?.box.y).toBeCloseTo(5 - 0.72)
    // À gauche : il finit au trait, à la même distance.
    const left = linkLabelPlacement({ ...vertical, labelSide: -1 }, style)
    expect(left?.anchor).toBe('end')
    expect((left?.box.x ?? 0) + (left?.box.w ?? 0)).toBeCloseTo(-0.675)
    // Le long du lien : même distance, plus haut.
    expect(linkLabelPlacement({ ...vertical, labelAt: 0.2 }, style)?.box.y).toBeCloseTo(2 - 0.72)
    const horizontal = link(
      [
        [0, 0],
        [10, 0]
      ],
      { label: 'oui', labelSide: -1 }
    )
    // Au-dessus d'un lien horizontal : centrée, le bas du texte à distance du trait.
    const above = linkLabelPlacement(horizontal, style)
    expect(above?.anchor).toBe('middle')
    expect((above?.box.x ?? 0) + (above?.box.w ?? 0) / 2).toBeCloseTo(5)
    expect((above?.box.y ?? 0) + (above?.box.h ?? 0)).toBeCloseTo(-0.675)
    expect(linkLabelPlacement({ ...horizontal, labelSide: 1 }, style)?.box.y).toBeCloseTo(0.675)
    expect(linkLabelPlacement({ ...horizontal, label: '' }, style)).toBeNull()
    // Une nouvelle étiquette : au-dessus d'un segment horizontal, à droite d'un vertical.
    expect(defaultLabelSide(horizontal.points, 0.5)).toBe(-1)
    expect(defaultLabelSide(vertical.points, 0.5)).toBe(1)
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

describe('diagramme : départ et arrivée de face', () => {
  const box = node({ id: 'a', w: 16, h: 6 })
  const right = { point: [16, 3] as [number, number], normals: anchorNormals(box, [16, 3]) }
  const free = (x: number, y: number): { point: [number, number]; normals: never[] } => ({
    point: [x, y],
    normals: []
  })

  it('dit par où un lien quitte une accroche : le côté, les deux d’un coin, les faces d’une barre', () => {
    expect(anchorNormals(box, [16, 3])).toEqual([[1, 0]])
    expect(anchorNormals(box, [5, 0])).toEqual([[0, -1]])
    expect(anchorNormals(box, [0, 6])).toEqual([
      [0, 1],
      [-1, 0]
    ])
    expect(anchorNormals(node({ shape: 'bar', w: 8, h: 0 }), [3, 0])).toEqual([
      [0, -1],
      [0, 1]
    ])
    // Accroche en retrait de la boîte : l'encoche d'une réception regarde à gauche.
    expect(anchorNormals(node({ shape: 'receive' }), [3, 3])).toEqual([[-1, 0]])
    expect(linkEndAt([box], [16, 3])).toEqual(right)
    expect(linkEndAt([box], [20, 3]).normals).toEqual([])
  })

  it('entre deux points libres, trace le L de toujours ; Maj donne l’autre', () => {
    expect(routeLink(free(0, 0), free(8, 3))).toEqual([
      [0, 0],
      [8, 0],
      [8, 3]
    ])
    expect(routeLink(free(0, 0), free(8, 3), true)).toEqual([
      [0, 0],
      [0, 3],
      [8, 3]
    ])
    expect(routeLink(free(0, 0), free(8, 0))).toEqual([
      [0, 0],
      [8, 0]
    ])
  })

  it('quitte une forme à angle droit, même quand la cible est surtout plus bas', () => {
    // À droite de la boîte, cible loin en dessous : le lien sort quand même vers la droite.
    expect(routeLink(right, free(20, 30))).toEqual([
      [16, 3],
      [20, 3],
      [20, 30]
    ])
    // Maj : sortie droite de deux cellules, puis l'autre coude.
    expect(routeLink(right, free(20, 30), true)).toEqual([
      [16, 3],
      [18, 3],
      [18, 30],
      [20, 30]
    ])
    // Cible derrière la forme : le lien sort, puis revient, sans jamais longer le bord.
    expect(routeLink(right, free(0, 20))).toEqual([
      [16, 3],
      [18, 3],
      [18, 20],
      [0, 20]
    ])
  })

  it('arrive de face : un Z entre deux côtés qui se regardent, un L vers un côté d’équerre, un U', () => {
    const other = node({ id: 'b', x: 30, y: 10, w: 16, h: 6 })
    const left = linkEndAt([other], [30, 13])
    expect(routeLink(right, left)).toEqual([
      [16, 3],
      [23, 3],
      [23, 13],
      [30, 13]
    ])
    const top = linkEndAt([other], [40, 10])
    expect(routeLink(right, top)).toEqual([
      [16, 3],
      [40, 3],
      [40, 10]
    ])
    // Du côté droit d'une forme au côté droit d'une autre, juste en dessous.
    const below = node({ id: 'c', x: 0, y: 10, w: 16, h: 6 })
    expect(routeLink(right, linkEndAt([below], [16, 13]))).toEqual([
      [16, 3],
      [18, 3],
      [18, 13],
      [16, 13]
    ])
    // D'un point libre vers le dessus d'une forme, en venant de côté : un coude de plus.
    expect(routeLink(free(20, 13), linkEndAt([other], [40, 10]))).toEqual([
      [20, 13],
      [20, 8],
      [40, 8],
      [40, 10]
    ])
  })

  it('fait glisser l’attache d’un segment le long du côté de sa forme, jusqu’au bout du côté', () => {
    const points: [number, number][] = [
      [16, 3],
      [30, 3],
      [30, 20]
    ]
    // Le segment qui sort à droite, glissé vers le bas : son départ suit, sans coude le long du bord.
    expect(moveLinkSegment(points, 0, 5, [box])).toEqual([
      [16, 5],
      [30, 5],
      [30, 20]
    ])
    // Plus bas que la forme : il s'arrête au coin.
    expect(moveLinkSegment(points, 0, 40, [box])).toEqual([
      [16, 6],
      [30, 6],
      [30, 20]
    ])
    // Sans forme sous le départ : le bout reste en place, un coude le relie.
    expect(moveLinkSegment(points, 0, 5, [])).toEqual([
      [16, 3],
      [16, 5],
      [30, 5],
      [30, 20]
    ])
    // Un losange n'a qu'une accroche par côté : rien ne bouge.
    const diamond = node({ shape: 'diamond', w: 8, h: 6, x: 8, y: 0 })
    expect(moveLinkSegment(points, 0, 5, [diamond])).toEqual(points)
    // L'arrivée glisse de même, le long du dessus de la forme d'arrivée.
    const target = node({ id: 't', x: 24, y: 20, w: 16, h: 6 })
    expect(moveLinkSegment(points, 1, 33, [box, target])).toEqual([
      [16, 3],
      [33, 3],
      [33, 20]
    ])
  })

  it('reconnaît un lien attaché à une note', () => {
    const note = node({ shape: 'note', id: 'n', x: 0, y: 10 })
    expect(
      touchesNote(
        [box, note],
        [
          [8, 16],
          [8, 22]
        ]
      )
    ).toBe(true)
    expect(
      touchesNote(
        [box, note],
        [
          [24, 13],
          [16, 13]
        ]
      )
    ).toBe(true)
    expect(
      touchesNote(
        [box, note],
        [
          [16, 3],
          [24, 3]
        ]
      )
    ).toBe(false)
  })
})
