import { describe, expect, it } from 'vitest'
import {
  isOnBorder,
  ROTATIONS,
  rotateClockwise,
  rotateCounterClockwise,
  rotatedSize,
  snap,
  transformLocalPoint
} from './grid'

const nano = { widthCells: 6, heightCells: 14 }

describe('grille', () => {
  it('échange largeur et hauteur à 90° et 270°', () => {
    expect(rotatedSize(nano, 90)).toEqual({ widthCells: 14, heightCells: 6 })
    expect(rotatedSize(nano, 270)).toEqual({ widthCells: 14, heightCells: 6 })
    expect(rotatedSize(nano, 180)).toEqual(nano)
  })

  it('fait tourner une broche en gardant le coin supérieur gauche à l’origine', () => {
    const pin = { x: 6, y: 1 } // bord droit
    expect(transformLocalPoint(pin, nano, 0, false)).toEqual({ x: 6, y: 1 })
    expect(transformLocalPoint(pin, nano, 90, false)).toEqual({ x: 13, y: 6 }) // bord bas
    expect(transformLocalPoint(pin, nano, 180, false)).toEqual({ x: 0, y: 13 }) // bord gauche
    expect(transformLocalPoint(pin, nano, 270, false)).toEqual({ x: 1, y: 0 }) // bord haut
  })

  it('applique le miroir horizontal avant la rotation', () => {
    expect(transformLocalPoint({ x: 6, y: 1 }, nano, 0, true)).toEqual({ x: 0, y: 1 })
    expect(transformLocalPoint({ x: 6, y: 1 }, nano, 90, true)).toEqual({ x: 13, y: 0 })
  })

  it('garde les broches sur le bord quelle que soit la transformation', () => {
    const pins = [
      { x: 0, y: 3 },
      { x: 6, y: 1 },
      { x: 2, y: 0 },
      { x: 4, y: 14 }
    ]
    for (const rotation of ROTATIONS) {
      for (const mirror of [false, true]) {
        const size = rotatedSize(nano, rotation)
        for (const pin of pins) {
          expect(isOnBorder(transformLocalPoint(pin, nano, rotation, mirror), size)).toBe(true)
        }
      }
    }
  })

  it('tourne par pas de 90° dans les deux sens', () => {
    expect(rotateClockwise(0)).toBe(90)
    expect(rotateClockwise(270)).toBe(0)
    expect(rotateCounterClockwise(0)).toBe(270)
    expect(rotateCounterClockwise(90)).toBe(0)
  })

  it('arrondit à l’intersection la plus proche', () => {
    expect(snap(2.4)).toBe(2)
    expect(snap(2.5)).toBe(3)
    expect(snap(-0.6)).toBe(-1)
  })

  it('distingue bord, intérieur et extérieur', () => {
    const size = { widthCells: 4, heightCells: 2 }
    expect(isOnBorder({ x: 0, y: 1 }, size)).toBe(true)
    expect(isOnBorder({ x: 4, y: 2 }, size)).toBe(true)
    expect(isOnBorder({ x: 2, y: 1 }, size)).toBe(false)
    expect(isOnBorder({ x: 5, y: 1 }, size)).toBe(false)
  })
})
