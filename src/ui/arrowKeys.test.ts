import { describe, expect, it } from 'vitest'
import { arrowNudge, SHIFT_ARROW_STEPS } from './arrowKeys'

describe('flèches du clavier', () => {
  const press = (key: string, shiftKey = false): readonly [number, number] | null =>
    arrowNudge({ key, shiftKey })

  it('déplacent d’un pas dans leur direction, y vers le bas', () => {
    expect(press('ArrowLeft')).toEqual([-1, 0])
    expect(press('ArrowRight')).toEqual([1, 0])
    expect(press('ArrowUp')).toEqual([0, -1])
    expect(press('ArrowDown')).toEqual([0, 1])
  })

  it('déplacent de cinq pas avec Maj', () => {
    expect(SHIFT_ARROW_STEPS).toBe(5)
    expect(press('ArrowLeft', true)).toEqual([-5, 0])
    expect(press('ArrowRight', true)).toEqual([5, 0])
    expect(press('ArrowUp', true)).toEqual([0, -5])
    expect(press('ArrowDown', true)).toEqual([0, 5])
  })

  it('ne disent rien des autres touches', () => {
    expect(press('a')).toBeNull()
    expect(press('Enter', true)).toBeNull()
    expect(press('PageUp')).toBeNull()
  })
})
