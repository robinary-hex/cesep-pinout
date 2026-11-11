import { describe, expect, it } from 'vitest'
import { roundedPathData } from './roundedPath'

const p = (x: number, y: number): { x: number; y: number } => ({ x, y })

describe('tracé aux angles arrondis', () => {
  it('sans rayon, relie les points par des segments', () => {
    expect(roundedPathData([p(0, 0), p(10, 0), p(10, 10)], 0, false)).toBe('M 0 0 L 10 0 L 10 10')
    expect(roundedPathData([p(0, 0), p(4, 0), p(4, 4)], 0, true)).toBe('M 0 0 L 4 0 L 4 4 Z')
  })

  it('arrondit un angle droit par un arc du rayon demandé', () => {
    expect(roundedPathData([p(0, 0), p(10, 0), p(10, 10)], 2, false)).toBe(
      'M 0 0 L 8 0 A 2 2 0 0 1 10 2 L 10 10'
    )
    // Dans l'autre sens, l'arc tourne dans l'autre sens.
    expect(roundedPathData([p(0, 0), p(10, 0), p(10, -10)], 2, false)).toContain(
      'A 2 2 0 0 0 10 -2'
    )
  })

  it('ne prend jamais plus de la moitié d’un côté', () => {
    expect(roundedPathData([p(0, 0), p(2, 0), p(2, 2)], 5, false)).toBe(
      'M 0 0 L 1 0 A 1 1 0 0 1 2 1 L 2 2'
    )
  })

  it('arrondit tous les sommets d’un polygone et se referme', () => {
    expect(roundedPathData([p(0, 0), p(4, 0), p(4, 4), p(0, 4)], 1, true)).toBe(
      'M 1 0 L 3 0 A 1 1 0 0 1 4 1 L 4 3 A 1 1 0 0 1 3 4 L 1 4 A 1 1 0 0 1 0 3 L 0 1 A 1 1 0 0 1 1 0 Z'
    )
  })

  it('arrondit un angle quelconque en gardant le rayon', () => {
    // Le tracé tourne de 45° : la longueur prise vaut rayon × tan(22,5°).
    expect(roundedPathData([p(0, 0), p(10, 0), p(20, 10)], 2, false)).toBe(
      'M 0 0 L 9.1716 0 A 2 2 0 0 1 10.5858 0.5858 L 20 10'
    )
  })

  it('laisse tels quels un sommet aligné et un demi-tour', () => {
    expect(roundedPathData([p(0, 0), p(5, 0), p(10, 0)], 2, false)).toBe('M 0 0 L 5 0 L 10 0')
    expect(roundedPathData([p(0, 0), p(5, 0), p(0, 0)], 2, false)).toBe('M 0 0 L 5 0 L 0 0')
  })
})
