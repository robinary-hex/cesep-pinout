import { describe, expect, it } from 'vitest'
import { createEmptyComponent, type ComponentDefinition } from './component'
import { ROTATIONS } from './grid'
import {
  applyMatrix,
  flippedInstance,
  instanceBounds,
  instanceMatrix,
  nextLabel,
  nextNumberedId,
  projectBounds,
  rectsIntersect,
  rotatedInstance
} from './placement'
import { DEFAULT_PROFILE } from './profile'
import { absolutePinPosition, createEmptyProject, type ComponentInstance } from './project'

function nano(): ComponentDefinition {
  const def = createEmptyComponent('nano', 'Nano')
  def.size = { widthCells: 6, heightCells: 14 }
  def.pins = [
    { id: 'd2', name: 'D2', kind: 'io', x: 0, y: 3 },
    { id: 'gnd', name: 'GND', kind: 'power', x: 6, y: 1 },
    { id: 'top', name: 'T', kind: 'io', x: 2, y: 0 }
  ]
  return def
}

const base: ComponentInstance = {
  id: 'u1',
  defId: 'nano',
  x: 10,
  y: 20,
  rotation: 0,
  mirror: false,
  label: 'U1'
}

describe('boîtes et matrices des instances', () => {
  it('donne la boîte tournée', () => {
    expect(instanceBounds(base, nano())).toEqual({ x: 10, y: 20, width: 6, height: 14 })
    expect(instanceBounds({ ...base, rotation: 90 }, nano())).toEqual({
      x: 10,
      y: 20,
      width: 14,
      height: 6
    })
  })

  it('la matrice SVG place les broches exactement comme absolutePinPosition', () => {
    const def = nano()
    for (const rotation of ROTATIONS) {
      for (const mirror of [false, true]) {
        const instance = { ...base, rotation, mirror }
        const matrix = instanceMatrix(instance, def)
        for (const pin of def.pins) {
          expect(applyMatrix(matrix, { x: pin.x, y: pin.y })).toEqual(
            absolutePinPosition(instance, def, pin)
          )
        }
      }
    }
  })

  it('détecte les intersections de rectangles', () => {
    const a = { x: 0, y: 0, width: 4, height: 2 }
    expect(rectsIntersect(a, { x: 3, y: 1, width: 2, height: 2 })).toBe(true)
    expect(rectsIntersect(a, { x: 4, y: 0, width: 2, height: 2 })).toBe(false)
  })

  it('calcule l’étendue d’un projet', () => {
    const project = createEmptyProject('p', DEFAULT_PROFILE)
    expect(projectBounds(project)).toBeNull()
    project.embeddedDefs = { nano: nano() }
    project.components = [base, { ...base, id: 'u2', x: -4, y: 30, rotation: 90 }]
    expect(projectBounds(project)).toEqual({ x: -4, y: 20, width: 20, height: 16 })
  })
})

describe('rotation et miroir à l’écran', () => {
  it('tourne d’un quart de tour en gardant le centre', () => {
    const def = nano()
    const turned = rotatedInstance(base, def, 'cw')
    expect(turned.rotation).toBe(90)
    const before = instanceBounds(base, def)
    const after = instanceBounds(turned, def)
    expect(before.x + before.width / 2).toBe(after.x + after.width / 2)
    expect(before.y + before.height / 2).toBe(after.y + after.height / 2)
    expect(rotatedInstance(turned, def, 'ccw')).toEqual(base)
  })

  it('un miroir horizontal renvoie chaque broche de l’autre côté de la boîte', () => {
    const def = nano()
    for (const rotation of ROTATIONS) {
      const instance = { ...base, rotation }
      const flipped = flippedInstance(instance, 'horizontal')
      const box = instanceBounds(instance, def)
      expect(instanceBounds(flipped, def)).toEqual(box)
      for (const pin of def.pins) {
        const p = absolutePinPosition(instance, def, pin)
        const q = absolutePinPosition(flipped, def, pin)
        expect(q.x).toBe(box.x + box.width - (p.x - box.x))
        expect(q.y).toBe(p.y)
      }
    }
  })

  it('un miroir vertical renvoie chaque broche de haut en bas', () => {
    const def = nano()
    for (const rotation of ROTATIONS) {
      const instance = { ...base, rotation }
      const flipped = flippedInstance(instance, 'vertical')
      const box = instanceBounds(instance, def)
      for (const pin of def.pins) {
        const p = absolutePinPosition(instance, def, pin)
        const q = absolutePinPosition(flipped, def, pin)
        expect(q.x).toBe(p.x)
        expect(q.y).toBe(box.y + box.height - (p.y - box.y))
      }
    }
  })

  it('deux miroirs identiques se compensent', () => {
    const twice = flippedInstance(
      flippedInstance({ ...base, rotation: 90 }, 'vertical'),
      'vertical'
    )
    expect(twice).toEqual({ ...base, rotation: 90 })
  })
})

describe('repères et identifiants', () => {
  it('numérote les repères par préfixe', () => {
    expect(nextLabel('R', ['R1', 'R3'])).toBe('R2')
    expect(nextLabel('', ['R1'])).toBe('')
  })

  it('numérote les identifiants', () => {
    expect(nextNumberedId('c', ['c1', 'c2'])).toBe('c3')
    expect(nextNumberedId('c', [])).toBe('c1')
  })
})
