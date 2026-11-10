import { describe, expect, it } from 'vitest'
import type { PinRef } from './connectivity'
import { movedJunction, wiresFollowingJunctions, wiresFollowingPins } from './elastic'
import type { Wire } from './project'

function wire(id: string, points: [number, number][]): Wire {
  return {
    id,
    color: '#000000',
    points,
    stack: 0,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' }
  }
}

function pin(key: string, x: number, y: number): PinRef {
  const [instanceId = '', pinId = ''] = key.split(':')
  return { key, instanceId, pinId, point: [x, y] }
}

describe('élasticité des fils', () => {
  const a1 = pin('a:1', 0, 1)
  const a2 = pin('a:2', 4, 1)
  const b1 = pin('b:1', 10, 1)
  const b2 = pin('b:2', 14, 1)
  const before = [a1, a2, b1, b2]

  it('une extrémité posée sur une broche déplacée la suit, avec un coude', () => {
    const after = [a1, a2, pin('b:1', 10, 4), pin('b:2', 14, 4)]
    const [result] = wiresFollowingPins(
      [
        wire('w1', [
          [4, 1],
          [10, 1]
        ])
      ],
      before,
      after
    )
    expect(result?.points).toEqual([
      [4, 1],
      [4, 4],
      [10, 4]
    ])
  })

  it('un fil déplacé en bloc garde son autre extrémité sur la broche immobile', () => {
    const after = [pin('a:1', 0, 4), pin('a:2', 4, 4), b1, b2]
    const translated = new Map<string, [number, number]>([['w1', [0, 3]]])
    const [result] = wiresFollowingPins(
      [
        wire('w1', [
          [4, 1],
          [10, 1]
        ])
      ],
      before,
      after,
      translated
    )
    expect(result?.points).toEqual([
      [4, 4],
      [4, 1],
      [10, 1]
    ])
  })

  it('un fil sans extrémité sur une broche concernée ne change pas (même objet)', () => {
    const free = wire('w2', [
      [20, 0],
      [20, 5]
    ])
    const after = [a1, a2, pin('b:1', 10, 4), pin('b:2', 14, 4)]
    const [result] = wiresFollowingPins([free], before, after)
    expect(result).toBe(free)
  })

  it('les deux extrémités suivent une rotation qui déplace deux broches', () => {
    // Le composant b tourne : ses broches passent de (10,1)/(14,1) à (12,-1)/(12,3).
    const after = [a1, a2, pin('b:1', 12, -1), pin('b:2', 12, 3)]
    const [result] = wiresFollowingPins(
      [
        wire('w1', [
          [10, 1],
          [14, 1]
        ])
      ],
      before,
      after
    )
    expect(result?.points[0]).toEqual([12, -1])
    expect(result?.points.at(-1)).toEqual([12, 3])
  })

  it('une extrémité qui arriverait sur l’autre laisse le fil en place', () => {
    const after = [a1, a2, pin('b:1', 4, 1), pin('b:2', 8, 1)]
    const original = wire('w1', [
      [4, 1],
      [10, 1]
    ])
    const [result] = wiresFollowingPins([original], before, after)
    expect(result).toBe(original)
  })
})

describe('jonctions qui suivent le fil porteur', () => {
  // y : fil horizontal ; x : fil vertical dont le départ est posé sur y ; z : départ posé sur x.
  const y = wire('y', [
    [0, 0],
    [10, 0]
  ])
  const x = wire('x', [
    [5, 0],
    [5, 6]
  ])
  const z = wire('z', [
    [5, 3],
    [9, 3]
  ])
  const shifted = (source: Wire, dx: number, dy: number): Wire => ({
    ...source,
    points: source.points.map(([px, py]): [number, number] => [px + dx, py + dy])
  })

  it('un fil déplacé en bloc emmène la jonction ; le fil attaché reçoit un coude', () => {
    const result = wiresFollowingJunctions([y, x], [shifted(y, 2, -3), x])
    expect(result[1]?.points).toEqual([
      [7, -3],
      [7, 6],
      [5, 6]
    ])
  })

  it('un segment glissé emmène la jonction ; le fil attaché s’allonge', () => {
    const bent = wire('y', [
      [0, 0],
      [10, 0],
      [10, 5]
    ])
    const dragged = wire('y', [
      [0, 0],
      [0, -3],
      [10, -3],
      [10, 5]
    ])
    expect(movedJunction(bent.points, dragged.points, [5, 0])).toEqual([5, -3])
    // Au coin, le fil passe toujours : la jonction reste.
    expect(movedJunction(bent.points, dragged.points, [10, 0])).toEqual([10, 0])
    const result = wiresFollowingJunctions([bent, x], [dragged, x])
    expect(result[1]?.points).toEqual([
      [5, -3],
      [5, 6]
    ])
  })

  it('se propage au fil attaché au fil qui suit', () => {
    const result = wiresFollowingJunctions([y, x, z], [shifted(y, 2, -3), x, z])
    expect(result[2]?.points).toEqual([
      [7, 3],
      [9, 3]
    ])
  })

  it('laisse en place une extrémité posée sur une broche, ou déplacée par la commande', () => {
    const moved = shifted(y, 2, -3)
    expect(wiresFollowingJunctions([y, x], [moved, x], [pin('a:1', 5, 0)])[1]).toBe(x)
    const dragged = shifted(x, 0, 1)
    expect(wiresFollowingJunctions([y, x], [moved, dragged])[1]).toBe(dragged)
  })

  it('ne touche à rien quand aucun tracé ne change', () => {
    const wires = [y, x, z]
    expect(wiresFollowingJunctions(wires, wires)).toEqual(wires)
  })
})

describe('élasticité des fils en diagonale', () => {
  it('une extrémité en diagonale suit sa broche en gardant sa pente', () => {
    const [moved] = wiresFollowingPins(
      [
        wire('w', [
          [0, 0],
          [3, 3],
          [8, 3]
        ])
      ],
      [pin('a:1', 0, 0)],
      [pin('a:1', 1, -2)]
    )
    expect(moved?.points).toEqual([
      [1, -2],
      [6, 3],
      [8, 3]
    ])
  })

  it('une jonction posée sur une diagonale la suit quand elle glisse', () => {
    expect(
      movedJunction(
        [
          [0, 0],
          [4, 4],
          [8, 4]
        ],
        [
          [0, 2],
          [2, 4],
          [8, 4]
        ],
        [2, 2]
      )
    ).toEqual([1, 3])
  })
})
