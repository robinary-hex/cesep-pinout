// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from './diagram'
import { DARK_GROUND, LIGHT_GROUND, mixColors } from './diagramShapes'
import { buildDiagramSvg, exportGround } from './diagramSvg'
import fixture from './fixtures/v1/diagram.json?raw'
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
    // Chaque lien a une pointe ouverte à l'arrivée ; le lien de retour est rouge et pointillé.
    expect(parsed.querySelectorAll('g.links polyline')).toHaveLength(3)
    expect(links[2]?.getAttribute('stroke')).toBe('#d62828')
    expect(links[2]?.querySelector('path')?.getAttribute('stroke-dasharray')).toBe('0.6 0.45')
    expect(links[0]?.querySelector('path')?.getAttribute('stroke-dasharray')).toBeNull()
    // Le lien qui arrive sur le losange s'arrête à sa pointe ; l'étiquette « vrai » est posée à côté.
    expect(parsed.querySelector('g.link-labels text')?.textContent).toBe('vrai')
    expect(parsed.querySelector('g.texts text')?.getAttribute('font-style')).toBe('italic')
    expect(parsed.querySelector('g.texts text')?.textContent).toBe('tant que')
  })

  it('peint un nœud teinté d’un fond mêlé à la couleur de l’image, texte à l’encre noire', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: '#f6f7f9' })
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    const decision = parsed.querySelectorAll('g.nodes > g')[1]
    const paths = decision?.querySelectorAll('path') ?? []
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute('fill')).toBe(mixColors('#c2255c', '#f6f7f9', 0.16))
    expect(paths[0]?.getAttribute('stroke')).toBe('#c2255c')
    const text = decision?.querySelector('text')
    expect(text?.getAttribute('fill')).toBe('#000000')
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
      mixColors('#c2255c', '#16181d', 0.38)
    )
    expect(decision?.querySelector('text')?.getAttribute('fill')).toBe('#e6edf3')
    expect(parsed.querySelector('g.texts text')?.getAttribute('fill')).toBe('#e6edf3')
    // Transparent : encre noire par défaut, claire si l'image va sur une page sombre.
    const transparent = { ...DEFAULT_EXPORT, background: 'transparent' as const }
    expect(exportGround(transparent, false)).toEqual(LIGHT_GROUND)
    expect(exportGround(transparent, true)).toEqual(DARK_GROUND)
    expect(buildDiagramSvg(diagram, transparent, true)?.svg).toContain('stroke="#e6edf3"')
    expect(buildDiagramSvg(diagram, transparent, false)?.svg).not.toContain('#e6edf3')
  })

  it('n’a pas de fond en transparent et retourne null pour un diagramme vide', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: 'transparent' })
    expect(result?.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width=')).toBe(true)
    expect(result?.svg).not.toContain('<rect x="-6" y="-2"')
    expect(buildDiagramSvg(createEmptyDiagram('Vide'), DEFAULT_EXPORT)).toBeNull()
  })
})
