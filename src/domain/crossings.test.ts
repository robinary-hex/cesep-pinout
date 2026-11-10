import { describe, expect, it } from 'vitest'
import {
  computeCrossings,
  crossingPieceEnds,
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
      {
        point: [10, 5],
        wireIds: ['h', 'v'],
        steps: [
          [1, 0],
          [0, 1]
        ]
      }
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
      { point: [10, 5], topWireId: 'v', step: [0, 1] }
    ])
    expect(crossingPieces([horizontal, vertical], [{ x: 10, y: 5, topWireId: 'h' }])).toEqual([
      { point: [10, 5], topWireId: 'h', step: [1, 0] }
    ])
    const crossings = computeCrossings([horizontal, vertical])
    expect(nearestCrossing(crossings, 10.3, 5.2, 0.6)?.point).toEqual([10, 5])
    expect(nearestCrossing(crossings, 12, 5, 0.6)).toBeNull()
  })

  it('trouve les croisements avec une diagonale, et entre deux diagonales au milieu d’une cellule', () => {
    const rising = wire(
      'd1',
      [
        [0, 0],
        [4, 4]
      ],
      0
    )
    const falling = wire(
      'd2',
      [
        [3, 0],
        [0, 3]
      ],
      1
    )
    const flat = wire(
      'f',
      [
        [0, 3],
        [6, 3]
      ],
      2
    )
    // `falling` finit sur le départ de `flat` : un contact, pas un croisement.
    expect(computeCrossings([rising, falling, flat])).toEqual([
      {
        point: [1.5, 1.5],
        wireIds: ['d1', 'd2'],
        steps: [
          [1, 1],
          [1, -1]
        ]
      },
      {
        point: [3, 3],
        wireIds: ['f', 'd1'],
        steps: [
          [1, 0],
          [1, 1]
        ]
      }
    ])
    // Le morceau redessiné suit la direction du fil du dessus, sur une cellule de long.
    const [between, onFlat] = crossingPieces([rising, falling, flat], [])
    expect(between).toEqual({ point: [1.5, 1.5], topWireId: 'd2', step: [1, -1] })
    if (!between || !onFlat) throw new Error('morceaux manquants')
    const [from, to] = crossingPieceEnds(between)
    expect(Math.hypot(to[0] - from[0], to[1] - from[1])).toBeCloseTo(1)
    expect(to[0] - from[0]).toBeCloseTo(-(to[1] - from[1]))
    expect(crossingPieceEnds(onFlat)).toEqual([
      [2.5, 3],
      [3.5, 3]
    ])
    // Une exception se pose aussi sur un croisement au demi-pas.
    const [crossing] = computeCrossings([rising, falling])
    if (!crossing) throw new Error('croisement manquant')
    const stacks = (id: string): number => (id === 'd1' ? 0 : 1)
    expect(toggledOverrides([], crossing, stacks)).toEqual([{ x: 1.5, y: 1.5, topWireId: 'd1' }])
  })
})
