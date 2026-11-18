import { describe, expect, it } from 'vitest'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE } from '@/domain'
import {
  canvasMargins,
  fittingCellPx,
  pinLabelOverhang,
  pinLabelParts,
  pinLabelSideAt,
  pinLabelText,
  pinNumberText
} from './pinLabelLayout'

describe('repères des broches : marges du canevas et ajustement', () => {
  it('sans broche, la marge est d’une cellule et l’ajustement compte deux cellules de plus', () => {
    const def = createEmptyComponent('x', 'X')
    expect(pinLabelOverhang(def, 50)).toEqual({ x: 0, y: 0 })
    expect(canvasMargins(def, 50)).toEqual({ x: 50, y: 50 })
    // 4 × 2 cellules dans 598 × 398 : 6 × 4 cellules avec les marges.
    expect(fittingCellPx(def, 598, 398, 20)).toBe(99)
  })

  it('nomme le repère par le rang, suivi du nom s’il diffère', () => {
    expect(pinLabelText({ id: 'a', name: '1', kind: 'io', x: 0, y: 1 }, 0)).toBe('1')
    expect(pinLabelText({ id: 'a', name: 'Anode', kind: 'io', x: 0, y: 1 }, 0)).toBe('1 · Anode')
  })

  it('sépare le numéro, plus discret, du nom de la broche', () => {
    const space = String.fromCharCode(0xa0)
    const named = { id: 'a', name: 'Anode', kind: 'io' as const, x: 0, y: 1 }
    expect(pinLabelParts(named, 0)).toEqual({ number: '1', name: 'Anode' })
    expect(pinNumberText(named, 0)).toBe(`1${space}·${space}`)
    // Un nom égal au rang ne se répète pas : le numéro seul, sans point médian.
    const plain = { ...named, name: '2' }
    expect(pinLabelParts(plain, 1)).toEqual({ number: '2', name: '' })
    expect(pinNumberText(plain, 1)).toBe('2')
  })

  it('élargit la marge pour un repère qui dépasse, à petite échelle', () => {
    const def = createEmptyComponent('led', 'LED')
    def.pins = [{ id: 'a', name: 'Anode', kind: 'io', x: 0, y: 1 }]
    // « 1 · Anode » : 9 caractères de 12,1 px, décalés de 16 px à gauche de la broche.
    const overhang = pinLabelOverhang(def, 20)
    expect(overhang.x).toBe(Math.ceil(16 + 9 * 0.55 * 22))
    // À 20 px la cellule ne suffit pas : la marge prend la largeur du repère, plus un jeu.
    expect(canvasMargins(def, 20).x).toBe(overhang.x + 8)
    // À 200 px la cellule suffit.
    expect(canvasMargins(def, 200).x).toBe(200)
  })

  it('ajuste en gardant la place des repères', () => {
    const def = createEmptyComponent('led', 'LED')
    def.size = { widthCells: 20, heightCells: 2 }
    def.pins = [{ id: 'a', name: 'Anode', kind: 'io', x: 0, y: 1 }]
    const fitted = fittingCellPx(def, 598, 398, 20)
    // 22 cellules donneraient 27 px ; les repères en demandent plus que deux cellules.
    expect(fitted).toBeLessThan(27)
    const margins = canvasMargins(def, fitted)
    expect(def.size.widthCells * fitted + 2 * margins.x).toBeLessThanOrEqual(598)
  })
})

describe('repères des broches : une file se lit d’un trait', () => {
  it('les repères d’une colonne sont tous du même côté, broches des coins comprises', () => {
    // Deux colonnes de huit broches, à une cellule des bords : un module à enficher.
    const def = createEmptyComponent('module', 'Module')
    def.size = { widthCells: 7, heightCells: 9 }
    def.pins = [1, 6].flatMap((x) =>
      Array.from({ length: 8 }, (_, row) => ({
        id: `p${x}-${row}`,
        name: 'BROCHE',
        kind: 'io' as const,
        x,
        y: row + 1
      }))
    )
    const sides = (): string[] =>
      def.pins.map((pin, index) => pinLabelSideAt(def, pin, index, pin, 40))
    // La broche du coin est aussi près du haut que du côté : elle suit sa colonne.
    expect(sides().slice(0, 8)).toEqual(Array(8).fill('left'))
    expect(sides().slice(8)).toEqual(Array(8).fill('right'))
    // Une empreinte autour du composant ne gêne pas les repères : elle n'est pas du dessin.
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'rect',
          x: 0,
          y: 0,
          w: 28,
          h: 36,
          rx: 0,
          style: DEFAULT_SHAPE_STYLE,
          footprint: true
        }
      ]
    }
    expect(sides().slice(0, 8)).toEqual(Array(8).fill('left'))
    // Le même contour, dans le dessin : les repères de gauche le croiseraient, ils passent à
    // droite de leur broche.
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'rect', x: 0, y: 0, w: 28, h: 36, rx: 0, style: DEFAULT_SHAPE_STYLE }]
    }
    expect(sides().slice(0, 8)).toEqual(Array(8).fill('right'))
  })
})
