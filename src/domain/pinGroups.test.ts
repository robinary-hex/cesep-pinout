import { describe, expect, it } from 'vitest'
import type { Pin, PinGroup } from './component'
import { arrangedPins, nextPinGroupId, nextPinGroupName, pinSections, placedPin } from './pinGroups'

function pin(id: string, pinGroup?: string): Pin {
  return { id, name: id, kind: 'io', x: 0, y: 0, ...(pinGroup ? { pinGroup } : {}) }
}

const groups: PinGroup[] = [
  { id: 'pg1', name: 'Alimentation' },
  { id: 'pg2', name: 'Signaux' }
]
const ids = (pins: readonly Pin[]): string[] => pins.map((entry) => entry.id)

describe('groupes de broches', () => {
  it('range les broches groupe par groupe, les sans-groupe à la fin, ordre gardé', () => {
    const pins = [pin('a'), pin('b', 'pg2'), pin('c', 'pg1'), pin('d', 'pg2'), pin('e', 'disparu')]
    const arranged = arrangedPins(pins, groups)
    expect(ids(arranged)).toEqual(['c', 'b', 'd', 'a', 'e'])
    // Un groupe qui n'existe plus : la broche redevient sans groupe.
    expect('pinGroup' in (arranged[4] ?? {})).toBe(false)
  })

  it('donne une section par groupe, même vide, puis les broches sans groupe', () => {
    const sections = pinSections([pin('c', 'pg1'), pin('a')], groups)
    expect(sections.map((section) => [section.group?.name ?? null, ids(section.pins)])).toEqual([
      ['Alimentation', ['c']],
      ['Signaux', []],
      [null, ['a']]
    ])
    // Sans groupe du tout : une seule section, la liste de toujours.
    expect(pinSections([pin('a')], [])).toEqual([{ group: null, pins: [pin('a')] }])
    // Toutes les broches rangées : pas de section « sans groupe ».
    expect(pinSections([pin('c', 'pg1')], groups)).toHaveLength(2)
  })

  it('range une broche dans un groupe, devant une autre ou à la fin', () => {
    const pins = [pin('c', 'pg1'), pin('d', 'pg1'), pin('a'), pin('b')]
    // À la fin d'un groupe.
    expect(ids(placedPin(pins, groups, 'a', 'pg1', null))).toEqual(['c', 'd', 'a', 'b'])
    expect(placedPin(pins, groups, 'a', 'pg1', null)[2]?.pinGroup).toBe('pg1')
    // Devant une broche du groupe.
    expect(ids(placedPin(pins, groups, 'b', 'pg1', 'c'))).toEqual(['b', 'c', 'd', 'a'])
    // Dans un groupe vide.
    expect(ids(placedPin(pins, groups, 'd', 'pg2', null))).toEqual(['c', 'd', 'a', 'b'])
    expect(placedPin(pins, groups, 'd', 'pg2', null)[1]?.pinGroup).toBe('pg2')
    // Hors de tout groupe, devant une broche libre.
    const out = placedPin(pins, groups, 'c', null, 'b')
    expect(ids(out)).toEqual(['d', 'a', 'c', 'b'])
    expect('pinGroup' in (out[2] ?? {})).toBe(false)
    // Simple changement d'ordre dans le même groupe.
    expect(ids(placedPin(pins, groups, 'd', 'pg1', 'c'))).toEqual(['d', 'c', 'a', 'b'])
  })

  it('propose un identifiant et un nom libres pour un nouveau groupe', () => {
    expect(nextPinGroupId([])).toBe('pg1')
    expect(nextPinGroupId(groups)).toBe('pg3')
    expect(nextPinGroupName([])).toBe('Groupe 1')
    expect(nextPinGroupName([{ id: 'pg1', name: 'Groupe 2' }])).toBe('Groupe 3')
  })
})
