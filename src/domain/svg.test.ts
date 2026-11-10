import { describe, expect, it } from 'vitest'
import projectText from './fixtures/v1/project.json?raw'
import projectV10 from './fixtures/v10/project.json?raw'
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
    expect(result.svg).toContain('>Exemple</tspan>')
    expect(result.svg).not.toContain('free-end')
  })

  it('tourne avec le composant les textes qui le demandent, jamais en miroir', () => {
    // Moteur 4 × 2 en (0, 0), tourné de 90° et en miroir : le M garde sa boîte 2 × 1, centrée
    // sur la boîte transformée (0,5..1,5 × 1..3), tournée autour de (1, 2).
    const result = buildProjectSvg(parseProject(projectV10), DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    expect(result.svg).toContain('transform="rotate(90 1 2)"')
    expect(result.svg).toContain('>M</tspan>')
  })

  it('ajoute une flèche aux extrémités libres prolongées', () => {
    const result = buildProjectSvg(project, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    // w3 (extrémités prolongées) a une extrémité libre en (24, 6), direction +x.
    // Pointe sur le bout du fil, corps raccourci à sa base : rien ne dépasse du cadre.
    expect(result.svg).toContain('<polygon points="24,6 23.475,6.21 23.475,5.79" fill="#d62828"/>')
    expect(result.svg).toContain('L 23.475 6"')
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
          w: 8,
          h: 2,
          x: 4,
          y: 2,
          text: '<5>',
          size: 0.5,
          anchor: 'start',
          color: '#000000',
          variable: false,
          defaultValue: '',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false
        },
        0.1
      )
    ).toContain('>&lt;5&gt;</tspan>')
  })

  it('trace un polygone aux angles arrondis', () => {
    const polygon = primitiveSvg(
      {
        kind: 'polyline',
        points: [
          [0, 0],
          [16, 0],
          [16, 16],
          [0, 16]
        ],
        closed: true,
        radius: 4,
        arrows: { start: false, middle: false, end: false },
        style: { stroke: '#000000', weight: 1, fill: 'none', fillOpacity: 1 }
      },
      0.1
    )
    // Carré de 4 cellules, rayon d'une cellule : quatre arcs, tracé refermé.
    expect(polygon).toContain(
      '<path d="M 1 0 L 3 0 A 1 1 0 0 1 4 1 L 4 3 A 1 1 0 0 1 3 4 L 1 4 A 1 1 0 0 1 0 3 L 0 1 A 1 1 0 0 1 1 0 Z"'
    )
  })

  it('dessine un point en disque plein, de rayon un trait fois sa taille', () => {
    expect(primitiveSvg({ kind: 'dot', x: 4, y: 2, scale: 2, color: '#d62828' }, 0.1)).toBe(
      '<circle cx="1" cy="0.5" r="0.2" fill="#d62828"/>'
    )
  })

  it('substitue les textes variables et dessine les flèches des lignes', () => {
    const valeur = primitiveSvg(
      {
        kind: 'text',
        w: 8,
        h: 2,
        x: 4,
        y: 2,
        text: 'valeur',
        size: 0.5,
        anchor: 'start',
        color: '#000000',
        variable: true,
        defaultValue: '10 kΩ',
        unit: '',
        bold: false,
        followsRotation: false,
        italic: false,
        underline: false,
        strike: false
      },
      0.1
    )
    expect(valeur).toContain('>10 kΩ</tspan>')
    expect(
      primitiveSvg(
        {
          kind: 'text',
          w: 8,
          h: 2,
          x: 4,
          y: 2,
          text: 'valeur',
          size: 0.5,
          anchor: 'start',
          color: '#000000',
          variable: true,
          defaultValue: '10 kΩ',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false
        },
        0.1,
        { valeur: '4,7 kΩ' }
      )
    ).toContain('>4,7 kΩ</tspan>')
    const arrow = primitiveSvg(
      {
        kind: 'line',
        x1: 0,
        y1: 4,
        x2: 8,
        y2: 4,
        arrows: { start: false, middle: false, end: true },
        style: { stroke: '#000000', weight: 2, fill: 'none', fillOpacity: 1 }
      },
      0.1
    )
    expect(arrow).toContain('stroke-width="0.2"')
    // Le trait s'arrête à la base de la pointe (0,7 cellule avant le bout) pour ne pas la couvrir.
    expect(arrow).toContain('x2="1.3"')
    expect(arrow).toContain('<polygon points="2,1 1.3,1.28 1.3,0.72" fill="#000000"/>')
  })
})
