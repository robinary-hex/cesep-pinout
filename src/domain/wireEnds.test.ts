import { describe, expect, it } from 'vitest'
import type { GridPoint } from './grid'
import {
  splitFromEnd,
  wireEndLabelBounds,
  wireEndLabelPlacement,
  wireRenderParts
} from './wireEnds'

const elbow: GridPoint[] = [
  [0, 0],
  [4, 0],
  [4, 3]
]

describe('extrémités libres des fils', () => {
  it('coupe une ligne brisée à une distance du bout, même à travers un coude', () => {
    expect(splitFromEnd(elbow, 1)).toEqual([
      [
        [0, 0],
        [4, 0],
        [4, 2]
      ],
      [
        [4, 2],
        [4, 3]
      ]
    ])
    expect(splitFromEnd(elbow, 4.5)).toEqual([
      [
        [0, 0],
        [2.5, 0]
      ],
      [
        [2.5, 0],
        [4, 0],
        [4, 3]
      ]
    ])
    expect(splitFromEnd(elbow, 3)).toEqual([
      [
        [0, 0],
        [4, 0]
      ],
      [
        [4, 0],
        [4, 3]
      ]
    ])
    expect(splitFromEnd(elbow, 10)).toEqual([[], elbow])
  })

  it('une extrémité en flèche raccourcit le corps et met la pointe sur le bout du fil', () => {
    const parts = wireRenderParts(elbow, 'arrow', { start: false, end: true }, 0.15)
    expect(parts.body).toEqual([
      [0, 0],
      [4, 0],
      [4, 3 - 0.525]
    ])
    expect(parts.heads).toHaveLength(1)
    expect(parts.heads[0]?.[0]).toEqual({ x: 4, y: 3 })
    expect(parts.dotted).toEqual([])
  })

  it('une extrémité en pointillés détache une queue de 1,5 cellule, aux deux bouts si libres', () => {
    const parts = wireRenderParts(elbow, 'dotted', { start: true, end: true }, 0.15)
    expect(parts.body).toEqual([
      [1.5, 0],
      [4, 0],
      [4, 1.5]
    ])
    expect(parts.dotted).toEqual([
      [
        [4, 1.5],
        [4, 3]
      ],
      [
        [0, 0],
        [1.5, 0]
      ]
    ])
    expect(parts.heads).toEqual([])
  })

  it('une extrémité connectée ou un style net laissent le fil intact', () => {
    expect(wireRenderParts(elbow, 'arrow', { start: false, end: false }, 0.15).body).toEqual(elbow)
    expect(wireRenderParts(elbow, 'flat', { start: true, end: true }, 0.15).heads).toEqual([])
  })

  it('place l’étiquette d’extrémité à l’opposé du fil', () => {
    expect(wireEndLabelPlacement(elbow, 2)).toEqual({
      x: 4,
      y: 3.6,
      anchor: 'middle',
      baseline: 'hanging'
    })
    expect(wireEndLabelPlacement(elbow, 0)).toEqual({
      x: -0.6,
      y: 0,
      anchor: 'end',
      baseline: 'middle'
    })
    const up: GridPoint[] = [
      [2, 5],
      [2, 1]
    ]
    expect(wireEndLabelPlacement(up, 1)).toMatchObject({ y: 0.4, baseline: 'auto' })
    expect(wireEndLabelPlacement(up, 0)).toMatchObject({ y: 5.6, baseline: 'hanging' })
    // Arrivée en diagonale : l'étiquette part dans le coin opposé, à la même distance.
    const slanted: GridPoint[] = [
      [0, 0],
      [3, 3]
    ]
    const corner = wireEndLabelPlacement(slanted, 1)
    expect(corner).toMatchObject({ anchor: 'start', baseline: 'hanging' })
    expect(Math.hypot((corner?.x ?? 0) - 3, (corner?.y ?? 0) - 3)).toBeCloseTo(0.6)
    expect(wireEndLabelPlacement(slanted, 0)).toMatchObject({ anchor: 'end', baseline: 'auto' })
  })

  it('estime l’encombrement d’une étiquette d’extrémité en cellules entières', () => {
    const placement = wireEndLabelPlacement(elbow, 0)
    if (!placement) throw new Error('placement attendu')
    const bounds = wireEndLabelBounds('VCC', placement, 0.55)
    expect(bounds.x + bounds.width).toBe(0)
    expect(bounds.width).toBeGreaterThanOrEqual(1)
    expect(bounds.height).toBeGreaterThanOrEqual(1)
  })
})
