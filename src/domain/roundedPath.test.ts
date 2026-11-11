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

  it('borne le recul d’une pointe : un angle aigu s’arrondit moins', () => {
    // Pointe à 53° : arrondie d'un rayon de 2, elle reculerait de 2 × (1 / sin 26,6° − 1) = 2,47.
    const tip = [p(0, 0), p(8, 4), p(0, 8)]
    expect(roundedPathData(tip, 2, false)).toContain('A 2 2 0 0 1')
    // Recul borné à 0,5 : le rayon tombe à 0,5 / 1,236 = 0,4045.
    expect(roundedPathData(tip, 2, false, 0.5)).toContain('A 0.4045 0.4045 0 0 1')
    // Un angle droit recule de 0,41 par unité de rayon : la borne ne le touche pas.
    expect(roundedPathData([p(0, 0), p(10, 0), p(10, 10)], 1, false, 0.5)).toBe(
      'M 0 0 L 9 0 A 1 1 0 0 1 10 1 L 10 10'
    )
    // Aucun recul permis : le sommet reste vif.
    expect(roundedPathData(tip, 2, false, 0)).toBe('M 0 0 L 8 4 L 0 8')
  })

  it('laisse tels quels un sommet aligné et un demi-tour', () => {
    expect(roundedPathData([p(0, 0), p(5, 0), p(10, 0)], 2, false)).toBe('M 0 0 L 5 0 L 10 0')
    expect(roundedPathData([p(0, 0), p(5, 0), p(0, 0)], 2, false)).toBe('M 0 0 L 5 0 L 0 0')
  })
})
