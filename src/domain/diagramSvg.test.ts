// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from './diagram'
import { DARK_GROUND, LIGHT_GROUND, mixColors } from './diagramShapes'
import { buildDiagramSvg, exportGround } from './diagramSvg'
import fixture from './fixtures/v1/diagram.json?raw'
import styledFixture from './fixtures/v2/diagram.json?raw'
import { parseDiagram } from './serialize'
import { DEFAULT_EXPORT } from './settings'

describe('export SVG d’un diagramme', () => {
  const diagram = parseDiagram(fixture)

  it('produit un SVG autonome, bien formé, aux bonnes dimensions', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, scale: 2, marginCells: 2 })
    if (!result) throw new Error('export vide')
    // Contenu de x = -4 à 28 et de y = 0 à 30,3 ; marge de 2 cellules ; 20 px par cellule à 2×.
    expect(result.widthCells).toBe(36)
    expect(result.heightCells).toBeCloseTo(34.3)
    expect(result.widthPx).toBe(720)
    expect([result.originX, result.originY]).toEqual([-6, -2])
    expect(result.svg).toContain('viewBox="-6 -2 36 34.3"')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.documentElement.getAttribute('font-family')).toContain('Consolas')
    expect(parsed.querySelectorAll('g.nodes > g')).toHaveLength(4)
    expect(parsed.querySelectorAll('g.links > g')).toHaveLength(3)
  })

  it('dessine liens, pointes, pointillés, étiquette et textes comme l’éditeur', () => {
    const result = buildDiagramSvg(diagram, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    const links = parsed.querySelectorAll('g.links > g')
    // Chaque lien a une pointe pleine à l'arrivée ; le lien de retour est rouge et pointillé.
    expect(parsed.querySelectorAll('g.links polygon')).toHaveLength(3)
    expect(parsed.querySelector('g.links polygon')?.getAttribute('fill')).toBe('#000000')
    expect(links[2]?.getAttribute('stroke')).toBe('#d62828')
    expect(links[2]?.querySelector('path')?.getAttribute('stroke-dasharray')).toBe('0.6 0.45')
    expect(links[0]?.querySelector('path')?.getAttribute('stroke-dasharray')).toBeNull()
    // Le lien qui arrive sur le losange s'arrête à sa pointe ; l'étiquette « vrai » est posée à côté.
    expect(parsed.querySelector('g.link-labels text')?.textContent).toBe('vrai')
    // À droite d'un lien vertical : le texte part du trait.
    expect(parsed.querySelector('g.link-labels text')?.getAttribute('text-anchor')).toBe('start')
    expect(parsed.querySelector('g.texts text')?.getAttribute('font-style')).toBe('italic')
    expect(parsed.querySelector('g.texts text')?.textContent).toBe('tant que')
  })

  it('peint un nœud teinté d’un fond mêlé à la couleur de l’image, texte de la couleur de la forme', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: '#f6f7f9' })
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    const decision = parsed.querySelectorAll('g.nodes > g')[1]
    const paths = decision?.querySelectorAll('path') ?? []
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute('fill')).toBe(mixColors('#c2255c', '#f6f7f9', 0.2))
    expect(paths[0]?.getAttribute('stroke')).toBe('#c2255c')
    const text = decision?.querySelector('text')
    expect(text?.getAttribute('fill')).toBe('#c2255c')
    expect(text?.textContent).toBe('conditionbouton == HIGH')
    // Chasse fixe : le sous-titre est en italique, le titre reste maigre.
    const spans = text?.querySelectorAll('tspan') ?? []
    expect(spans[0]?.getAttribute('font-weight')).toBeNull()
    expect(spans[1]?.getAttribute('font-style')).toBe('italic')
    // Le disque de départ est plein, sans contour.
    const start = parsed.querySelectorAll('g.nodes > g')[0]?.querySelector('path')
    expect(start?.getAttribute('fill')).toBe('#000000')
    expect(start?.getAttribute('stroke')).toBe('none')
  })

  it('passe à l’encre claire sur un fond sombre, ou transparent pour une page sombre', () => {
    const dark = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: '#16181d' })
    if (!dark) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(dark.svg, 'image/svg+xml')
    // Liens noirs du document : dessinés à l'encre claire ; le rouge reste rouge.
    const links = parsed.querySelectorAll('g.links > g')
    expect(links[0]?.getAttribute('stroke')).toBe('#e6edf3')
    expect(links[2]?.getAttribute('stroke')).toBe('#d62828')
    const decision = parsed.querySelectorAll('g.nodes > g')[1]
    expect(decision?.querySelector('path')?.getAttribute('fill')).toBe(
      mixColors('#c2255c', '#16181d', 0.4)
    )
    // Le texte du nœud garde la couleur de sa forme ; celui d'un nœud noir passe à l'encre claire.
    expect(decision?.querySelector('text')?.getAttribute('fill')).toBe('#c2255c')
    const action = parsed.querySelectorAll('g.nodes > g')[2]
    expect(action?.querySelector('text')?.getAttribute('fill')).toBe(
      action?.querySelector('path')?.getAttribute('stroke')
    )
    expect(parsed.querySelector('g.texts text')?.getAttribute('fill')).toBe('#e6edf3')
    // Transparent : encre noire par défaut, claire si l'image va sur une page sombre.
    const transparent = { ...DEFAULT_EXPORT, background: 'transparent' as const }
    expect(exportGround(transparent, false)).toEqual(LIGHT_GROUND)
    expect(exportGround(transparent, true)).toEqual(DARK_GROUND)
    expect(buildDiagramSvg(diagram, transparent, true)?.svg).toContain('stroke="#e6edf3"')
    expect(buildDiagramSvg(diagram, transparent, false)?.svg).not.toContain('#e6edf3')
  })

  it('écrit le style de texte propre à un nœud : police, gras, souligné, taille', () => {
    const result = buildDiagramSvg(parseDiagram(styledFixture), DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    // Le diagramme est en chasse fixe ; ce nœud a choisi la police normale, en gras souligné, ×1,5.
    const text = parsed.querySelectorAll('g.nodes > g')[2]?.querySelector('text')
    expect(text?.getAttribute('font-family')).toContain('Segoe UI')
    const title = text?.querySelector('tspan')
    expect(title?.getAttribute('font-weight')).toBe('600')
    expect(title?.getAttribute('text-decoration')).toBe('underline')
    expect(title?.getAttribute('font-size')).toBe('2.1')
    // Un nœud qui suit le diagramme ne redit pas la police.
    const plain = parsed.querySelectorAll('g.nodes > g')[1]?.querySelector('text')
    expect(plain?.getAttribute('font-family')).toBeNull()
  })

  it('arrête le trait d’un lien un peu avant le nœud quand il porte une pointe', () => {
    const result = buildDiagramSvg(diagram, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    // Premier lien : de (8, 2) à (8, 6), pointe à l'arrivée. La pointe finit à y = 5,6, sans
    // toucher le nœud ; le trait s'arrête dedans, à 5,25.
    const first = parsed.querySelectorAll('g.links > g')[0]
    expect(first?.querySelector('path')?.getAttribute('d')).toBe('M 8 2 L 8 5.25')
    expect(first?.querySelector('polygon')?.getAttribute('points')).toContain('8,5.6')
  })

  it('ne met un fond sous une étiquette de lien ou un texte que s’il est demandé', () => {
    const read = (svg: string | undefined): Document =>
      new DOMParser().parseFromString(svg ?? '', 'image/svg+xml')
    const plain = read(buildDiagramSvg(diagram, DEFAULT_EXPORT)?.svg)
    expect(plain.querySelectorAll('g.link-labels rect, g.texts rect')).toHaveLength(0)
    const backed = read(
      buildDiagramSvg(
        {
          ...diagram,
          links: diagram.links.map((link) => ({ ...link, labelBackground: true })),
          texts: diagram.texts.map((text) => ({ ...text, background: true }))
        },
        DEFAULT_EXPORT
      )?.svg
    )
    // Un fond par étiquette écrite et par texte, de la couleur du fond de l'image.
    const labelled = diagram.links.filter((link) => link.label.length > 0).length
    expect(labelled).toBeGreaterThan(0)
    expect(backed.querySelectorAll('g.link-labels rect')).toHaveLength(labelled)
    expect(backed.querySelector('g.link-labels rect')?.getAttribute('fill')).toBe('#ffffff')
    expect(backed.querySelector('g.link-labels rect')?.hasAttribute('fill-opacity')).toBe(false)
    expect(backed.querySelectorAll('g.texts rect')).toHaveLength(diagram.texts.length)
  })

  it('n’a pas de fond en transparent et retourne null pour un diagramme vide', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: 'transparent' })
    expect(result?.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width=')).toBe(true)
    expect(result?.svg).not.toContain('<rect x="-6" y="-2"')
    expect(buildDiagramSvg(createEmptyDiagram('Vide'), DEFAULT_EXPORT)).toBeNull()
  })
})
