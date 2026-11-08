import { describe, expect, it } from 'vitest'
import {
  computeCrossings,
  crossingPieces,
  crossingTop,
  nearestCrossing,
  pruneCrossingOverrides,
  toggledOverrides
} from './crossings'
import type { GridPoint } from './grid'
import type { Wire } from './project'

function wire(id: string, points: GridPoint[], stack: number): Wire {
  return {
    id,
    color: '#000000',
    points,
    stack,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' }
  }
}

const horizontal = wire(
  'h',
  [
    [0, 5],
    [20, 5]
  ],
  0
)
const vertical = wire(
  'v',
  [
    [10, 0],
    [10, 10]
  ],
  1
)
const stackOf = (id: string): number => (id === 'h' ? 0 : 1)

describe('croisements', () => {
  it('trouve un croisement strict et ignore les contacts aux sommets', () => {
    expect(computeCrossings([horizontal, vertical])).toEqual([
      { point: [10, 5], horizontalWireId: 'h', verticalWireId: 'v' }
    ])
    const touching = wire(
      't',
      [
        [10, 5],
        [10, 12]
      ],
      2
    )
    expect(computeCrossings([horizontal, touching])).toEqual([])
    const bent = wire(
      'b',
      [
        [10, 0],
        [10, 3],
        [14, 3]
      ],
      2
    )
    expect(computeCrossings([horizontal, bent])).toEqual([])
  })

  it('le fil du rang le plus élevé passe au-dessus, sauf exception', () => {
    const [crossing] = computeCrossings([horizontal, vertical])
    if (!crossing) throw new Error('croisement manquant')
    expect(crossingTop(crossing, [], stackOf)).toBe('v')
    expect(crossingTop(crossing, [{ x: 10, y: 5, topWireId: 'h' }], stackOf)).toBe('h')
    expect(crossingTop(crossing, [{ x: 10, y: 5, topWireId: 'autre' }], stackOf)).toBe('v')
  })

  it('Alt+clic bascule l’ordre et retire l’exception quand elle redevient inutile', () => {
    const [crossing] = computeCrossings([horizontal, vertical])
    if (!crossing) throw new Error('croisement manquant')
    const once = toggledOverrides([], crossing, stackOf)
    expect(once).toEqual([{ x: 10, y: 5, topWireId: 'h' }])
    const twice = toggledOverrides(once, crossing, stackOf)
    expect(twice).toEqual([])
  })

  it('élague les exceptions orphelines', () => {
    const crossings = computeCrossings([horizontal, vertical])
    const overrides = [
      { x: 10, y: 5, topWireId: 'h' },
      { x: 10, y: 5, topWireId: 'inconnu' },
      { x: 3, y: 3, topWireId: 'h' }
    ]
    expect(pruneCrossingOverrides(overrides, crossings)).toEqual([{ x: 10, y: 5, topWireId: 'h' }])
  })

  it('décrit le morceau à redessiner et retrouve le croisement proche', () => {
    expect(crossingPieces([horizontal, vertical], [])).toEqual([
      { point: [10, 5], topWireId: 'v', horizontal: false }
    ])
    expect(crossingPieces([horizontal, vertical], [{ x: 10, y: 5, topWireId: 'h' }])).toEqual([
      { point: [10, 5], topWireId: 'h', horizontal: true }
    ])
    const crossings = computeCrossings([horizontal, vertical])
    expect(nearestCrossing(crossings, 10.3, 5.2, 0.6)?.point).toEqual([10, 5])
    expect(nearestCrossing(crossings, 12, 5, 0.6)).toBeNull()
  })
})
