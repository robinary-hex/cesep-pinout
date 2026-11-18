import { describe, expect, it } from 'vitest'
import { DEFAULT_SHAPE_STYLE, NO_ARROWS, type Primitive } from './component'
import { FOOTPRINT_STYLE, footprintDashArray, footprintDrawing, footprintPath } from './footprint'
import { footprintSvg } from './svg'

const style = DEFAULT_SHAPE_STYLE

/** Un rectangle du dessin, puis deux empreintes bord à bord (de x = 1 à 3, puis de 3 à 5). */
const primitives: Primitive[] = [
  { kind: 'rect', x: 0, y: 0, w: 8, h: 8, rx: 0, style },
  { kind: 'rect', x: 4, y: 0, w: 8, h: 8, rx: 0, style, footprint: true },
  { kind: 'rect', x: 12, y: 0, w: 8, h: 8, rx: 0, style, footprint: true }
]

describe('empreinte d’un composant : son tracé', () => {
  it('trace chaque sorte de forme, sans son style', () => {
    expect(footprintPath({ kind: 'rect', x: 0, y: 4, w: 8, h: 8, rx: 0, style })).toEqual({
      d: 'M 0 1 H 2 V 3 H 0 Z',
      closed: true
    })
    // Des coins arrondis comme ceux du rectangle : jamais plus que la moitié d'un côté.
    expect(footprintPath({ kind: 'rect', x: 0, y: 0, w: 8, h: 4, rx: 4, style }).d).toBe(
      'M 0.5 0 H 1.5 A 0.5 0.5 0 0 1 2 0.5 V 0.5 A 0.5 0.5 0 0 1 1.5 1 H 0.5 A 0.5 0.5 0 0 1 0 0.5 V 0.5 A 0.5 0.5 0 0 1 0.5 0 Z'
    )
    expect(footprintPath({ kind: 'ellipse', cx: 8, cy: 4, rx: 4, ry: 2, style })).toEqual({
      d: 'M 1 1 A 1 0.5 0 1 0 3 1 A 1 0.5 0 1 0 1 1 Z',
      closed: true
    })
    // Une ligne n'entoure rien.
    expect(
      footprintPath({ kind: 'line', x1: 0, y1: 0, x2: 8, y2: 4, arrows: NO_ARROWS, style })
    ).toEqual({ d: 'M 0 0 L 2 1', closed: false })
    expect(
      footprintPath({
        kind: 'polyline',
        points: [
          [0, 0],
          [8, 0],
          [8, 8]
        ],
        closed: true,
        radius: 0,
        arrows: NO_ARROWS,
        style
      })
    ).toEqual({ d: 'M 0 0 L 2 0 L 2 2 Z', closed: true })
    // Dans l'éditeur, à la taille d'une cellule : en pixels.
    expect(footprintPath({ kind: 'rect', x: 0, y: 4, w: 8, h: 8, rx: 0, style }, 40).d).toBe(
      'M 0 40 H 80 V 120 H 0 Z'
    )
    expect(footprintDashArray()).toBe('0.24 0.18')
    expect(footprintDashArray(100)).toBe('24 18')
  })

  it('ne garde d’un dessin que ses formes d’empreinte, dans une boîte large d’une cellule de plus', () => {
    const drawing = footprintDrawing(primitives)
    expect(drawing?.shapes.map((shape) => shape.d)).toEqual([
      'M 1 0 H 3 V 2 H 1 Z',
      'M 3 0 H 5 V 2 H 3 Z'
    ])
    expect(drawing?.box).toEqual({ x: 0, y: -1, width: 6, height: 4 })
    expect(footprintDrawing(primitives.slice(0, 1))).toBeNull()
  })

  it('s’exporte en une silhouette : un voile, et le contour que le masque laisse des traits', () => {
    const svg = footprintSvg(primitives, 'm1')
    // Le voile : les formes pleines, dans un groupe à opacité unique.
    expect(svg.startsWith(`<g opacity="${FOOTPRINT_STYLE.shadowOpacity}">`)).toBe(true)
    // Le masque : tout se voit, sauf l'intérieur des formes.
    expect(svg).toContain(
      '<mask id="m1" maskUnits="userSpaceOnUse" x="0" y="-1" width="6" height="4">'
    )
    expect(svg.match(/fill="#000000"/g)).toHaveLength(2)
    // Le contour : par forme, un filet sombre puis des tirets clairs, deux fois trop épais sous
    // le masque. Le côté que les deux formes partagent tombe dans l'une et dans l'autre.
    expect(svg).toContain('<g mask="url(#m1)" fill="none">')
    expect(svg.match(/stroke-dasharray="0\.24 0\.18"/g)).toHaveLength(2)
    expect(svg.match(/stroke-width="0\.14"/g)).toHaveLength(4)
    // Une ligne garde son trait entier.
    const line: Primitive = {
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 8,
      y2: 0,
      arrows: NO_ARROWS,
      style,
      footprint: true
    }
    expect(footprintSvg([line], 'm2').match(/stroke-width="0\.07"/g)).toHaveLength(2)
    expect(footprintSvg(primitives.slice(0, 1), 'm1')).toBe('')
  })
})
