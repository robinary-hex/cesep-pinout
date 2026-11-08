import { describe, expect, it } from 'vitest'
import { arrowHeadPoints, arrowSize, pointsAttribute, trimForArrows } from './arrows'

describe('pointes de flèche', () => {
  it('raccourcit le trait jusqu’à la base de la pointe, de chaque côté demandé', () => {
    const width = 0.2
    const size = arrowSize(width)
    expect(size).toBeCloseTo(0.7)
    const line = [
      { x: 0, y: 1 },
      { x: 4, y: 1 }
    ]
    expect(trimForArrows(line, { start: false, end: true }, width)).toEqual([
      { x: 0, y: 1 },
      { x: 4 - size, y: 1 }
    ])
    expect(trimForArrows(line, { start: true, end: true }, width)).toEqual([
      { x: size, y: 1 },
      { x: 4 - size, y: 1 }
    ])
    expect(trimForArrows(line, { start: false, end: false }, width)).toEqual(line)
  })

  it('ne dépasse jamais le sommet voisin sur un segment court', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 }
    ]
    expect(trimForArrows(short, { start: false, end: true }, 0.2)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ])
  })

  it('la base de la pointe coïncide avec le bout du trait raccourci', () => {
    const head = arrowHeadPoints({ x: 0, y: 1 }, { x: 4, y: 1 }, 0.2)
    const [trimmedEnd] = trimForArrows(
      [
        { x: 4, y: 1 },
        { x: 0, y: 1 }
      ],
      { start: true, end: false },
      0.2
    )
    expect(head?.[1]?.x).toBeCloseTo(trimmedEnd?.x ?? Number.NaN)
    expect(pointsAttribute(head ?? [])).toBe('4,1 3.3,1.28 3.3,0.72')
  })
})
