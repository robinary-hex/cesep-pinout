import { describe, expect, it } from 'vitest'
import { groupIds, groupOutline, nextGroupId, regroupedCopies, withGroup } from './groups'

describe('groupes', () => {
  it('un groupe existe dès que deux éléments portent le même identifiant', () => {
    expect(groupIds([{ group: 'g1' }, {}, { group: 'g2' }, { group: 'g1' }])).toEqual(['g1'])
    expect(groupIds([])).toEqual([])
  })

  it('un nouvel identifiant n’est jamais déjà porté, même par un élément seul', () => {
    expect(nextGroupId([])).toBe('g1')
    expect(nextGroupId([{ group: 'g1' }, { group: 'g3' }])).toBe('g2')
    expect(nextGroupId([{ group: 'g1' }], ['g2'])).toBe('g3')
  })

  it('change ou retire le groupe d’un élément sans toucher à l’original', () => {
    const element = { id: 'a', group: 'g1' }
    expect(withGroup(element, 'g2')).toEqual({ id: 'a', group: 'g2' })
    expect('group' in withGroup(element, undefined)).toBe(false)
    expect(element.group).toBe('g1')
  })

  it('les copies d’un groupe forment un nouveau groupe ; une copie seule n’en a plus', () => {
    const existing = [{ group: 'g1' }, { group: 'g1' }, { group: 'g2' }, { group: 'g2' }]
    const copies: { id: string; group?: string }[] = [
      { id: 'a', group: 'g1' },
      { id: 'b', group: 'g1' },
      { id: 'c', group: 'g2' },
      { id: 'd' },
      { id: 'e', group: 'g7' },
      { id: 'f', group: 'g7' }
    ]
    expect(regroupedCopies(copies, existing)).toEqual([
      { id: 'a', group: 'g3' },
      { id: 'b', group: 'g3' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e', group: 'g4' },
      { id: 'f', group: 'g4' }
    ])
    // Les copies données ne changent pas.
    expect(copies[0]).toEqual({ id: 'a', group: 'g1' })
  })

  it('entoure les membres d’un groupe, avec une marge', () => {
    expect(groupOutline([], 1)).toBeNull()
    expect(
      groupOutline(
        [
          { x: 2, y: 3, width: 4, height: 1 },
          { x: 0, y: 4, width: 1, height: 5 }
        ],
        0.5
      )
    ).toEqual({ x: -0.5, y: 2.5, width: 7, height: 7 })
  })
})
