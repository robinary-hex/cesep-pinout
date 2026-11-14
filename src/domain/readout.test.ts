import { describe, expect, it } from 'vitest'
import { DEFAULT_SHAPE_STYLE, type Primitive } from './component'
import { formatCells, formatReadout, placeReadout, primitiveReadout, spanReadout } from './readout'

const NO_ARROWS = { start: false, middle: false, end: false }

describe('barre d’état : coordonnées de la sélection', () => {
  it('écrit les cellules à la française : virgule, deux décimales au plus, vrai signe moins', () => {
    expect(formatCells(3)).toBe('3')
    expect(formatCells(1.25)).toBe('1,25')
    expect(formatCells(0.5)).toBe('0,5')
    expect(formatCells(-2)).toBe('−2')
    expect(formatCells(-0.75)).toBe('−0,75')
    expect(formatCells(1 / 3)).toBe('0,33')
    // Zéro n'a pas de signe, même arrivé par le négatif.
    expect(formatCells(-0)).toBe('0')
    expect(formatCells(-0.001)).toBe('0')
  })

  it('donne x et y d’un élément', () => {
    expect(formatReadout(placeReadout(2, 3))).toBe('x 2   y 3')
    expect(formatReadout(placeReadout(-4, 0))).toBe('x −4   y 0')
  })

  it('donne le départ, l’arrivée et l’écart d’un fil, pas sa longueur', () => {
    // Un fil coudé de (6, 4) à (12, 9) : seuls comptent son premier et son dernier sommet.
    const wire = spanReadout([
      [6, 4],
      [12, 4],
      [12, 9]
    ])
    expect(formatReadout(wire)).toBe('départ (6 ; 4)   arrivée (12 ; 9)   Δx 6   Δy 5')
    // L'écart a un sens : négatif vers la gauche ou vers le haut.
    const back = spanReadout([
      [12, 9],
      [6, 4]
    ])
    expect(formatReadout(back)).toBe('départ (12 ; 9)   arrivée (6 ; 4)   Δx −6   Δy −5')
    // Un fil qui revient à l'aplomb de son départ : écart nul sur cet axe.
    const loop = spanReadout([
      [0, 0],
      [0, 3],
      [4, 3],
      [4, 0]
    ])
    expect(formatReadout(loop)).toBe('départ (0 ; 0)   arrivée (4 ; 0)   Δx 4   Δy 0')
    expect(spanReadout([[1, 1]])).toBeNull()
  })

  it('compte les éléments d’une sélection à plusieurs, et se tait sans sélection', () => {
    expect(formatReadout({ kind: 'many', count: 3 })).toBe('3 éléments')
    expect(formatReadout(null)).toBe('')
  })

  it('lit les formes d’un composant en cellules, depuis leurs quarts', () => {
    const read = (primitive: Primitive): string => formatReadout(primitiveReadout(primitive))
    // Rectangle : le coin supérieur gauche de sa boîte.
    expect(read({ kind: 'rect', x: 5, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE })).toBe(
      'x 1,25   y 0,5'
    )
    // Ellipse : le coin de sa boîte, pas son centre.
    expect(read({ kind: 'ellipse', cx: 8, cy: 4, rx: 4, ry: 2, style: DEFAULT_SHAPE_STYLE })).toBe(
      'x 1   y 0,5'
    )
    // Point : son centre.
    expect(read({ kind: 'dot', x: 6, y: 6, scale: 1, color: '#000000' })).toBe('x 1,5   y 1,5')
    // Ligne : départ, arrivée, écart.
    expect(
      read({
        kind: 'line',
        x1: 0,
        y1: 4,
        x2: 10,
        y2: 2,
        arrows: NO_ARROWS,
        style: DEFAULT_SHAPE_STYLE
      })
    ).toBe('départ (0 ; 1)   arrivée (2,5 ; 0,5)   Δx 2,5   Δy −0,5')
    const path = (closed: boolean): Primitive => ({
      kind: 'polyline',
      points: [
        [4, 8],
        [12, 8],
        [12, 0]
      ],
      closed,
      radius: 0,
      arrows: NO_ARROWS,
      style: DEFAULT_SHAPE_STYLE
    })
    // Polyligne ouverte : comme un fil. Fermée, c'est une forme : le coin de sa boîte.
    expect(read(path(false))).toBe('départ (1 ; 2)   arrivée (3 ; 0)   Δx 2   Δy −2')
    expect(read(path(true))).toBe('x 1   y 0')
  })
})
