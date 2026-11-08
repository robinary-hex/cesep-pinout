import { describe, expect, it } from 'vitest'
import projectText from './fixtures/v1/project.json?raw'
import { parseProject } from './serialize'
import { DEFAULT_EXPORT } from './settings'
import { buildProjectSvg, escapeXml, primitiveSvg } from './svg'

describe('export SVG', () => {
  const project = parseProject(projectText)

  it('produit un SVG autonome aux bonnes dimensions', () => {
    const result = buildProjectSvg(project, { ...DEFAULT_EXPORT, scale: 2, marginCells: 2 })
    if (!result) throw new Error('export vide')
    // Contenu : Nano en (2, 2) de 6 × 14, résistance, fils jusqu'en x = 24 ; étiquette en (2, 0).
    expect(result.widthCells).toBe(24 - 2 + 4)
    // L'étiquette « Exemple » en (2, 0) réserve la cellule au-dessus : y de -1 à 16.
    expect(result.heightCells).toBe(16 + 1 + 4)
    expect(result.widthPx).toBe(result.widthCells * 40)
    expect(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(result.svg).toContain('viewBox="0 -3 26 21"')
    expect(result.svg).toContain('width="1040"')
  })

  it('dessine fond, fils, jonction, composants et repères, sans marqueurs d’édition', () => {
    const result = buildProjectSvg(project, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    expect(result.svg).toContain('fill="#ffffff"')
    expect(result.svg.match(/<path /g)?.length).toBe(3)
    expect(result.svg).toContain('stroke="#d62828"')
    // Jonction de w3 sur w2 en (20, 6), portée par w2 (rouge), diamètre 2 × 0,15.
    expect(result.svg).toContain('<circle cx="20" cy="6" r="0.15" fill="#d62828"/>')
    expect(result.svg).toContain('<image href="data:image/png;base64,')
    expect(result.svg).toContain('>U1</text>')
    expect(result.svg).toContain('>R1</text>')
    expect(result.svg).toContain('>Exemple</text>')
    expect(result.svg).not.toContain('free-end')
  })

  it('ajoute une flèche aux extrémités libres prolongées', () => {
    const result = buildProjectSvg(project, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    // w3 (extrémités prolongées) a une extrémité libre en (24, 6), direction +x.
    expect(result.svg).toContain('<polygon points="24,6.225 24,5.775 24.45,6" fill="#d62828"/>')
  })

  it('respecte fond transparent, grille et repères masqués', () => {
    const result = buildProjectSvg(project, {
      scale: 1,
      background: 'transparent',
      marginCells: 0,
      grid: true,
      labels: false
    })
    if (!result) throw new Error('export vide')
    expect(result.svg).not.toContain('fill="#ffffff"')
    expect(result.svg).toContain('stroke="#d8dee4"')
    expect(result.svg).not.toContain('>U1</text>')
    expect(result.svg).toContain('viewBox="2 -1 22 17"')
  })

  it('retourne null pour un montage vide et échappe le texte', () => {
    expect(
      buildProjectSvg({ ...project, components: [], wires: [], labels: [] }, DEFAULT_EXPORT)
    ).toBeNull()
    expect(escapeXml('R < 10 & "ok"')).toBe('R &lt; 10 &amp; &quot;ok&quot;')
    expect(
      primitiveSvg(
        {
          kind: 'text',
          x: 4,
          y: 2,
          text: '<5>',
          size: 0.5,
          anchor: 'start',
          color: '#000000',
          variable: false,
          defaultValue: '',
          unit: ''
        },
        0.1
      )
    ).toContain('>&lt;5&gt;</text>')
  })

  it('substitue les textes variables et dessine les flèches des lignes', () => {
    const valeur = primitiveSvg(
      {
        kind: 'text',
        x: 4,
        y: 2,
        text: 'valeur',
        size: 0.5,
        anchor: 'start',
        color: '#000000',
        variable: true,
        defaultValue: '10 kΩ',
        unit: ''
      },
      0.1
    )
    expect(valeur).toContain('>10 kΩ</text>')
    expect(
      primitiveSvg(
        {
          kind: 'text',
          x: 4,
          y: 2,
          text: 'valeur',
          size: 0.5,
          anchor: 'start',
          color: '#000000',
          variable: true,
          defaultValue: '10 kΩ',
          unit: ''
        },
        0.1,
        { valeur: '4,7 kΩ' }
      )
    ).toContain('>4,7 kΩ</text>')
    const arrow = primitiveSvg(
      {
        kind: 'line',
        x1: 0,
        y1: 4,
        x2: 8,
        y2: 4,
        arrows: { start: false, end: true },
        style: { stroke: '#000000', weight: 2, fill: 'none' }
      },
      0.1
    )
    expect(arrow).toContain('stroke-width="0.2"')
    expect(arrow).toContain('<polygon points="2,1 1.3,1.28 1.3,0.72" fill="#000000"/>')
  })
})
