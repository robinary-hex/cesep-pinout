import { describe, expect, it } from 'vitest'
import { NO_ARROWS, type Primitive } from './component'
import type { Box } from './handles'
import {
  pinLabelAxis,
  pinLabelSide,
  primitiveTouchesBox,
  segmentTouchesBox,
  sidesByNearestBorder,
  type LabelSide
} from './pinLabels'

const size = { widthCells: 4, heightCells: 2 }
const stroke = { stroke: '#000000', fill: 'none', weight: 1, fillOpacity: 1 }

/** Contour du composant : rectangle vide 4 × 2 cellules (16 × 8 quarts). */
const outline: Primitive = { kind: 'rect', x: 0, y: 0, w: 16, h: 8, rx: 0, style: stroke }
const filled: Primitive = { ...outline, style: { ...stroke, fill: '#000000' } }
/** Ligne horizontale au milieu, à y = 1 cellule. */
const midline: Primitive = {
  kind: 'line',
  x1: 0,
  y1: 4,
  x2: 16,
  y2: 4,
  arrows: { ...NO_ARROWS },
  style: stroke
}

function text(x: number, y: number): Primitive {
  return {
    kind: 'text',
    x,
    y,
    w: 8,
    h: 4,
    text: 'T',
    size: 0.5,
    anchor: 'middle',
    color: '#000000',
    variable: false,
    defaultValue: '',
    unit: '',
    bold: false,
    followsRotation: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false
  }
}

describe('repères des broches', () => {
  it('classe les côtés du bord le plus proche au plus lointain, haut puis bas à égalité', () => {
    expect(sidesByNearestBorder({ x: 0, y: 1 }, size)).toEqual(['left', 'top', 'bottom', 'right'])
    expect(sidesByNearestBorder({ x: 2, y: 0 }, size)).toEqual(['top', 'bottom', 'left', 'right'])
    expect(sidesByNearestBorder({ x: 3, y: 1 }, size)).toEqual(['top', 'bottom', 'right', 'left'])
  })

  it('un rectangle vide ne gêne que par son contour, un plein partout', () => {
    expect(primitiveTouchesBox(outline, { x: 1, y: 0.5, w: 1, h: 0.5 })).toBe(false)
    expect(primitiveTouchesBox(outline, { x: -0.5, y: 0.5, w: 1, h: 0.5 })).toBe(true)
    expect(primitiveTouchesBox(outline, { x: 5, y: 0.5, w: 1, h: 0.5 })).toBe(false)
    expect(primitiveTouchesBox(filled, { x: 1, y: 0.5, w: 1, h: 0.5 })).toBe(true)
  })

  it('une ligne gêne là où elle passe, avec une petite marge', () => {
    expect(primitiveTouchesBox(midline, { x: 1, y: 0.8, w: 1, h: 0.4 })).toBe(true)
    expect(primitiveTouchesBox(midline, { x: 1, y: 1.3, w: 1, h: 0.4 })).toBe(false)
    expect(segmentTouchesBox({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0.5, y: 0.5, w: 1, h: 1 })).toBe(
      true
    )
    expect(segmentTouchesBox({ x: 0, y: 3 }, { x: 2, y: 3 }, { x: 0.5, y: 0.5, w: 1, h: 1 })).toBe(
      false
    )
  })

  it('choisit le côté libre le plus proche du bord, sinon le bord le plus proche', () => {
    // Broche au centre (2, 1), sur la ligne médiane.
    const boxes: Record<LabelSide, Box> = {
      top: { x: 1.5, y: 0.3, w: 1, h: 0.4 },
      bottom: { x: 1.5, y: 1.3, w: 1, h: 0.4 },
      left: { x: 0.6, y: 0.8, w: 1, h: 0.4 },
      right: { x: 2.4, y: 0.8, w: 1, h: 0.4 }
    }
    const boxFor = (side: LabelSide): Box => boxes[side]
    const point = { x: 2, y: 1 }
    // Rien au-dessus : le haut, premier côté à égalité, est libre.
    expect(pinLabelSide(point, size, [outline, midline], boxFor)).toBe('top')
    // Un texte occupe le haut (cellules 1..3 × 0..1) : le bas.
    expect(pinLabelSide(point, size, [outline, midline, text(4, 0)], boxFor)).toBe('bottom')
    // Haut et bas pris, gauche et droite sur la ligne : retour au bord le plus proche.
    expect(pinLabelSide(point, size, [outline, midline, text(4, 0), text(4, 4)], boxFor)).toBe(
      'top'
    )
  })
})

describe('repères des broches : le sens d’une file', () => {
  it('une colonne veut ses repères sur le côté, une rangée au bout', () => {
    const column = [
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 }
    ]
    expect(pinLabelAxis({ x: 1, y: 1 }, column)).toBe('sides')
    expect(pinLabelAxis({ x: 0, y: 2 }, [{ x: 3, y: 2 }])).toBe('ends')
    // D'une colonne et d'une rangée : la plus longue ; à égalité, ou seule : pas de préférence.
    expect(pinLabelAxis({ x: 1, y: 1 }, [...column, { x: 6, y: 1 }])).toBe('sides')
    expect(
      pinLabelAxis({ x: 1, y: 1 }, [
        { x: 1, y: 2 },
        { x: 6, y: 1 }
      ])
    ).toBeNull()
    expect(pinLabelAxis({ x: 1, y: 1 }, [])).toBeNull()
  })

  it('le sens voulu passe avant le bord le plus proche', () => {
    // Broche en (1, 0) d'un composant plein : aucun côté n'est libre.
    const boxFor = (): Box => ({ x: 0.5, y: 0.2, w: 1, h: 0.4 })
    const point = { x: 1, y: 0 }
    // Sans file : le bord le plus proche, le haut.
    expect(pinLabelSide(point, size, [filled], boxFor)).toBe('top')
    // D'une colonne : sur le côté, le plus proche d'abord ; d'une rangée : au bout.
    expect(pinLabelSide(point, size, [filled], boxFor, 'sides')).toBe('left')
    expect(pinLabelSide(point, size, [filled], boxFor, 'ends')).toBe('top')
    // Un côté libre du sens voulu l'emporte sur un côté libre plus proche du bord.
    expect(pinLabelSide({ x: 3, y: 1 }, size, [], boxFor)).toBe('top')
    expect(pinLabelSide({ x: 3, y: 1 }, size, [], boxFor, 'sides')).toBe('right')
  })
})
