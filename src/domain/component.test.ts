import { describe, expect, it } from 'vitest'
import {
  componentFields,
  componentIssues,
  createEmptyComponent,
  DEFAULT_SHAPE_STYLE,
  NO_ARROWS,
  primitiveBounds,
  textContent,
  translatePrimitive,
  type Primitive
} from './component'
import { nearestBorderPoint } from './grid'

const style = DEFAULT_SHAPE_STYLE

describe('formes du mini-éditeur', () => {
  it('calcule la boîte englobante de chaque forme', () => {
    expect(primitiveBounds({ kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style })).toEqual({
      x1: 4,
      y1: 2,
      x2: 12,
      y2: 6
    })
    expect(primitiveBounds({ kind: 'ellipse', cx: 8, cy: 4, rx: 3, ry: 2, style })).toEqual({
      x1: 5,
      y1: 2,
      x2: 11,
      y2: 6
    })
    expect(
      primitiveBounds({ kind: 'line', x1: 10, y1: 1, x2: 2, y2: 5, arrows: NO_ARROWS, style })
    ).toEqual({
      x1: 2,
      y1: 1,
      x2: 10,
      y2: 5
    })
    expect(
      primitiveBounds({
        kind: 'polyline',
        points: [
          [0, 0],
          [4, 6],
          [2, 3]
        ],
        closed: false,
        arrows: NO_ARROWS,
        style
      })
    ).toEqual({ x1: 0, y1: 0, x2: 4, y2: 6 })
  })

  it('déplace une forme sans en changer la nature', () => {
    const line: Primitive = { kind: 'line', x1: 0, y1: 0, x2: 4, y2: 0, arrows: NO_ARROWS, style }
    expect(translatePrimitive(line, 2, 3)).toEqual({ ...line, x1: 2, y1: 3, x2: 6, y2: 3 })
    const poly: Primitive = {
      kind: 'polyline',
      points: [
        [0, 0],
        [1, 1]
      ],
      closed: true,
      arrows: NO_ARROWS,
      style
    }
    expect(
      translatePrimitive(poly, -1, 0).kind === 'polyline' && translatePrimitive(poly, -1, 0)
    ).toMatchObject({
      points: [
        [-1, 0],
        [0, 1]
      ]
    })
  })

  it('crée un composant vide valide, avec un seul avertissement (pas de broche)', () => {
    const def = createEmptyComponent('nouveau', 'Nouveau')
    expect(def.size).toEqual({ widthCells: 4, heightCells: 2 })
    expect(componentIssues(def).map((issue) => issue.level)).toEqual(['warning'])
  })

  it('signale une forme qui dépasse la boîte', () => {
    const def = createEmptyComponent('x', 'X')
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'rect', x: 0, y: 0, w: 20, h: 2, rx: 0, style }]
    }
    expect(componentIssues(def).some((issue) => /dépasse/.test(issue.message))).toBe(true)
  })
})

describe('accrochage des broches au bord', () => {
  const size = { widthCells: 4, heightCells: 2 }

  it('choisit l’intersection du bord la plus proche', () => {
    expect(nearestBorderPoint({ x: 0.2, y: 1.1 }, size).point).toEqual({ x: 0, y: 1 })
    expect(nearestBorderPoint({ x: 3.9, y: 0.9 }, size).point).toEqual({ x: 4, y: 1 })
    expect(nearestBorderPoint({ x: 2.1, y: -0.3 }, size).point).toEqual({ x: 2, y: 0 })
    expect(nearestBorderPoint({ x: 2.4, y: 1.8 }, size).point).toEqual({ x: 2, y: 2 })
  })

  it('donne une distance utile pour refuser un clic trop loin', () => {
    expect(nearestBorderPoint({ x: 2, y: 1 }, size).distance).toBeCloseTo(1)
    expect(nearestBorderPoint({ x: 8, y: 1 }, size).distance).toBeCloseTo(4)
  })
})

describe('textes variables', () => {
  it('affiche la valeur, sinon la valeur par défaut, et colle l’unité à droite', () => {
    const base = {
      kind: 'text' as const,
      w: 8,
      h: 2,
      x: 0,
      y: 0,
      size: 0.5,
      anchor: 'middle' as const,
      color: '#000000',
      text: 'R',
      variable: true,
      defaultValue: '10',
      unit: 'kΩ',
      bold: false
    }
    const nbsp = String.fromCharCode(0xa0)
    expect(textContent(base, { R: '4,7' })).toBe(`4,7${nbsp}kΩ`)
    expect(textContent(base, {})).toBe(`10${nbsp}kΩ`)
    expect(textContent({ ...base, defaultValue: '', unit: '', bold: false })).toBe('{R}')
    expect(textContent({ ...base, variable: false })).toBe('R')
    expect(
      componentFields({
        ...createEmptyComponent('x', 'X'),
        visual: { kind: 'drawing', primitives: [base] }
      })
    ).toEqual([{ name: 'R', defaultValue: '10', unit: 'kΩ' }])
  })
})
