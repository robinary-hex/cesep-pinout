// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from './diagram'
import { buildDiagramSvg } from './diagramSvg'
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

  it('peint un nœud teinté sur une sous-couche de la couleur du fond, texte à l’encre noire', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: '#f6f7f9' })
    if (!result) throw new Error('export vide')
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
    const decision = parsed.querySelectorAll('g.nodes > g')[1]
    const paths = decision?.querySelectorAll('path') ?? []
    expect(paths).toHaveLength(2)
    expect(paths[0]?.getAttribute('fill')).toBe('#f6f7f9')
    expect(paths[1]?.getAttribute('fill')).toBe('#c2255c')
    expect(paths[1]?.getAttribute('fill-opacity')).toBe('0.16')
    expect(paths[1]?.getAttribute('stroke')).toBe('#c2255c')
    const text = decision?.querySelector('text')
    expect(text?.getAttribute('fill')).toBe('#000000')
    expect(text?.textContent).toBe('conditionbouton == HIGH')
    // Chasse fixe : le sous-titre est en italique, le titre reste maigre.
    const spans = text?.querySelectorAll('tspan') ?? []
    expect(spans[0]?.getAttribute('font-weight')).toBeNull()
    expect(spans[1]?.getAttribute('font-style')).toBe('italic')
    // Le disque de départ est plein, la barre aussi, sans contour.
    const start = parsed.querySelectorAll('g.nodes > g')[0]?.querySelector('path')
    expect(start?.getAttribute('fill')).toBe('#000000')
    expect(start?.getAttribute('stroke')).toBe('none')
  })

  it('n’a pas de fond en transparent et retourne null pour un diagramme vide', () => {
    const result = buildDiagramSvg(diagram, { ...DEFAULT_EXPORT, background: 'transparent' })
    expect(result?.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width=')).toBe(true)
    expect(result?.svg).not.toContain('<rect x="-6" y="-2"')
    expect(buildDiagramSvg(createEmptyDiagram('Vide'), DEFAULT_EXPORT)).toBeNull()
  })
})
