import { describe, expect, it } from 'vitest'
import { arrowHeadPoints, pointsAttribute } from './arrows'
import { DEFAULT_SHAPE_STYLE, NO_ARROWS, type Primitive } from './component'
import { dragHandle, nearestHandle, primitiveHandles } from './handles'

const style = DEFAULT_SHAPE_STYLE
const rect: Primitive = { kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style }

describe('poignées des formes', () => {
  it('donne huit poignées à un rectangle, quatre à une ellipse, deux à une ligne', () => {
    expect(primitiveHandles(rect).map((handle) => handle.id)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w'
    ])
    expect(primitiveHandles({ kind: 'ellipse', cx: 8, cy: 4, rx: 3, ry: 2, style })).toHaveLength(4)
    expect(
      primitiveHandles({ kind: 'line', x1: 0, y1: 0, x2: 4, y2: 0, arrows: NO_ARROWS, style })
    ).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 }
    ])
    expect(
      primitiveHandles({
        kind: 'text',
        w: 8,
        h: 2,
        x: 0,
        y: 0,
        text: 'R',
        size: 0.5,
        anchor: 'middle',
        color: '#000000',
        variable: false,
        defaultValue: '',
        unit: '',
        bold: false,
        followsRotation: false,
        italic: false,
        underline: false,
        strike: false,
        mono: false
      })
    ).toHaveLength(8)
  })

  it('redimensionne un rectangle par un coin ou un côté sans descendre sous une cellule', () => {
    expect(dragHandle(rect, 'se', [16, 8])).toMatchObject({ x: 4, y: 2, w: 12, h: 6 })
    expect(dragHandle(rect, 'nw', [2, 0])).toMatchObject({ x: 2, y: 0, w: 10, h: 6 })
    expect(dragHandle(rect, 'e', [20, 99])).toMatchObject({ x: 4, w: 16, h: 4 })
    expect(dragHandle(rect, 'w', [30, 0])).toMatchObject({ x: 11, w: 1 })
  })

  it('redimensionne une ellipse par ses extrémités et déplace les sommets d’une ligne ou d’une polyligne', () => {
    const ellipse: Primitive = { kind: 'ellipse', cx: 8, cy: 4, rx: 3, ry: 2, style }
    expect(dragHandle(ellipse, 'e', [14, 4])).toMatchObject({ rx: 6, ry: 2 })
    expect(dragHandle(ellipse, 'n', [8, 4])).toMatchObject({ ry: 1 })
    const line: Primitive = { kind: 'line', x1: 0, y1: 0, x2: 4, y2: 0, arrows: NO_ARROWS, style }
    expect(dragHandle(line, 'b', [6, 3])).toMatchObject({ x2: 6, y2: 3 })
    const poly: Primitive = {
      kind: 'polyline',
      points: [
        [0, 0],
        [4, 0],
        [4, 4]
      ],
      closed: false,
      arrows: NO_ARROWS,
      style
    }
    expect(
      dragHandle(poly, 'v1', [5, 1]).kind === 'polyline' && dragHandle(poly, 'v1', [5, 1])
    ).toMatchObject({
      points: [
        [0, 0],
        [5, 1],
        [4, 4]
      ]
    })
  })

  it('trouve la poignée la plus proche', () => {
    expect(nearestHandle(rect, 12.3, 5.8)?.id).toBe('se')
    expect(nearestHandle(rect, 8, 1.7)?.id).toBe('n')
  })
})

describe('pointes de flèche', () => {
  it('dessine un triangle orienté vers la pointe, de taille liée au trait', () => {
    const points = arrowHeadPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.1)
    expect(points?.[0]).toEqual({ x: 4, y: 0 })
    expect(points?.[1]?.x).toBeCloseTo(3.65)
    expect(points?.[1]?.y).toBeCloseTo(0.14)
    expect(points?.[2]?.y).toBeCloseTo(-0.14)
    expect(arrowHeadPoints({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.1)).toBeNull()
    expect(pointsAttribute(points ?? [])).toBe('4,0 3.65,0.14 3.65,-0.14')
  })
})
