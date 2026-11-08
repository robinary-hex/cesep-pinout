import { describe, expect, it } from 'vitest'
import {
  arrowHeadPoints,
  arrowSize,
  middleArrowHead,
  pointsAttribute,
  trimForArrows
} from './arrows'

describe('pointes de flèche', () => {
  it('raccourcit le trait jusqu’à la base de la pointe, de chaque côté demandé', () => {
    const width = 0.2
    const size = arrowSize(width)
    expect(size).toBeCloseTo(0.7)
    const line = [
      { x: 0, y: 1 },
      { x: 4, y: 1 }
    ]
    expect(trimForArrows(line, { start: false, middle: false, end: true }, width)).toEqual([
      { x: 0, y: 1 },
      { x: 4 - size, y: 1 }
    ])
    expect(trimForArrows(line, { start: true, middle: false, end: true }, width)).toEqual([
      { x: size, y: 1 },
      { x: 4 - size, y: 1 }
    ])
    expect(trimForArrows(line, { start: false, middle: false, end: false }, width)).toEqual(line)
  })

  it('ne dépasse jamais le sommet voisin sur un segment court', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 }
    ]
    expect(trimForArrows(short, { start: false, middle: false, end: true }, 0.2)).toEqual([
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
      { start: true, middle: false, end: false },
      0.2
    )
    expect(head?.[1]?.x).toBeCloseTo(trimmedEnd?.x ?? Number.NaN)
    expect(pointsAttribute(head ?? [])).toBe('4,1 3.3,1.28 3.3,0.72')
  })

  it('place la pointe du milieu au centre du trait, dans le sens du tracé', () => {
    const head = middleArrowHead(
      [
        { x: 0, y: 1 },
        { x: 4, y: 1 }
      ],
      0.2
    )
    expect(head?.[0]?.x).toBeCloseTo(2.35)
    expect(head?.[0]?.y).toBeCloseTo(1)
    expect(head?.[1]?.x).toBeCloseTo(1.65)
    const elbow = middleArrowHead(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 }
      ],
      0.2
    )
    expect(elbow?.[0]?.x).toBeCloseTo(2.35)
    expect(elbow?.[0]?.y).toBeCloseTo(0)
    expect(middleArrowHead([{ x: 1, y: 1 }], 0.2)).toBeNull()
  })
})
