import { describe, expect, it } from 'vitest'
import type { PinRef } from './connectivity'
import { wiresFollowingPins } from './elastic'
import type { Wire } from './project'

function wire(id: string, points: [number, number][]): Wire {
  return { id, color: '#000000', points, stack: 0, freeEnds: 'flat' }
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
