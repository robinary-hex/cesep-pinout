import { describe, expect, it } from 'vitest'
import { createEmptyComponent } from './component'
import { computeConnectivity, projectPins } from './connectivity'
import type { GridPoint } from './grid'
import { DEFAULT_PROFILE } from './profile'
import { createEmptyProject, wireGeometryProblem, type Wire } from './project'
import {
  dragVertex,
  horizontalFirstFor,
  locateOnWire,
  moveSegment,
  nearestSegmentIndex,
  normalizePoints,
  routeL,
  routeLAuto,
  simplifyPoints,
  wireIntersectsRect,
  wirePathData
} from './wires'

function wire(id: string, points: GridPoint[], stack = 0): Wire {
  return {
    id,
    color: '#000000',
    points,
    stack,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' }
  }
}

describe('forme des fils', () => {
  it('accepte un sommet dans un segment droit mais refuse un demi-tour', () => {
    expect(
      wireGeometryProblem([
        [0, 0],
        [4, 0],
        [8, 0]
      ])
    ).toBeNull()
    expect(
      wireGeometryProblem([
        [0, 0],
        [8, 0],
        [4, 0]
      ])
    ).toMatch(/revient/)
  })

  it('nettoie doublons et demi-tours sans toucher aux sommets droits', () => {
    expect(
      normalizePoints([
        [0, 0],
        [0, 0],
        [8, 0],
        [4, 0],
        [4, 6]
      ])
    ).toEqual([
      [0, 0],
      [4, 0],
      [4, 6]
    ])
    expect(
      normalizePoints([
        [0, 0],
        [4, 0],
        [8, 0]
      ])
    ).toEqual([
      [0, 0],
      [4, 0],
      [8, 0]
    ])
  })

  it('simplifie un fil tracé en fusionnant les segments alignés', () => {
    expect(
      simplifyPoints([
        [0, 0],
        [4, 0],
        [8, 0],
        [8, 3]
      ])
    ).toEqual([
      [0, 0],
      [8, 0],
      [8, 3]
    ])
  })

  it('trace un L dans l’ordre demandé', () => {
    expect(routeL([0, 0], [4, 3], true)).toEqual([
      [0, 0],
      [4, 0],
      [4, 3]
    ])
    expect(routeL([0, 0], [4, 3], false)).toEqual([
      [0, 0],
      [0, 3],
      [4, 3]
    ])
    expect(routeL([0, 0], [4, 0], false)).toEqual([
      [0, 0],
      [4, 0]
    ])
  })

  it('choisit l’axe dominant en premier, et l’autre avec Maj', () => {
    expect(routeLAuto([0, 0], [6, 2])).toEqual([
      [0, 0],
      [6, 0],
      [6, 2]
    ])
    expect(routeLAuto([0, 0], [2, 6])).toEqual([
      [0, 0],
      [0, 6],
      [2, 6]
    ])
    expect(routeLAuto([0, 0], [2, 6], true)).toEqual([
      [0, 0],
      [2, 0],
      [2, 6]
    ])
    expect(horizontalFirstFor([0, 0], [3, 3])).toBe(true)
  })

  it('situe un point sur un fil', () => {
    const points: GridPoint[] = [
      [0, 0],
      [4, 0],
      [4, 6]
    ]
    expect(locateOnWire(points, [0, 0])).toEqual({ kind: 'end', index: 0 })
    expect(locateOnWire(points, [4, 0])).toEqual({ kind: 'vertex', index: 1 })
    expect(locateOnWire(points, [4, 3])).toEqual({ kind: 'segment', index: 1 })
    expect(locateOnWire(points, [2, 1])).toBeNull()
  })
})

describe('tracé SVG', () => {
  it('arrondit les coins avec un arc borné à la moitié du plus court segment', () => {
    const d = wirePathData(
      [
        [0, 0],
        [4, 0],
        [4, 1]
      ],
      0.4
    )
    expect(d).toBe('M 0 0 L 3.6 0 A 0.4 0.4 0 0 1 4 0.4 L 4 1')
    const tight = wirePathData(
      [
        [0, 0],
        [1, 0],
        [1, 1]
      ],
      0.8
    )
    expect(tight).toContain('A 0.5 0.5')
  })

  it('tourne dans l’autre sens pour un virage à gauche et passe droit sur un sommet aligné', () => {
    const left = wirePathData(
      [
        [0, 0],
        [4, 0],
        [4, -2]
      ],
      0.4
    )
    expect(left).toContain('0 0 0 4 -0.4')
    const straight = wirePathData(
      [
        [0, 0],
        [2, 0],
        [4, 0]
      ],
      0.4
    )
    expect(straight).toBe('M 0 0 L 2 0 L 4 0')
  })
})

describe('édition des segments et des sommets', () => {
  const points: GridPoint[] = [
    [0, 0],
    [4, 0],
    [4, 6],
    [10, 6]
  ]

  it('déplace un segment du milieu, les voisins s’allongent', () => {
    expect(moveSegment(points, 1, 7)).toEqual([
      [0, 0],
      [7, 0],
      [7, 6],
      [10, 6]
    ])
  })

  it('déplacer un segment d’extrémité ajoute un coude pour garder l’extrémité', () => {
    expect(moveSegment(points, 0, 2)).toEqual([
      [0, 0],
      [0, 2],
      [4, 2],
      [4, 6],
      [10, 6]
    ])
    expect(moveSegment(points, 2, 9)).toEqual([
      [0, 0],
      [4, 0],
      [4, 9],
      [10, 9],
      [10, 6]
    ])
  })

  it('déplace un sommet intermédiaire en gardant l’orthogonalité', () => {
    const moved = dragVertex(points, 2, [6, 8])
    // Le sommet précédent glisse ; l'extrémité finale reste fixe et reçoit un coude.
    expect(moved).toEqual([
      [0, 0],
      [6, 0],
      [6, 8],
      [10, 8],
      [10, 6]
    ])
    expect(wireGeometryProblem(moved)).toBeNull()
  })

  it('déplace une extrémité en ajoutant un coude', () => {
    const moved = dragVertex(points, 0, [-2, 3])
    expect(moved).toEqual([
      [-2, 3],
      [4, 3],
      [4, 6],
      [10, 6]
    ])
    expect(wireGeometryProblem(moved)).toBeNull()
  })

  it('trouve le segment le plus proche', () => {
    expect(nearestSegmentIndex(points, { x: 2, y: 0.3 })).toBe(0)
    expect(nearestSegmentIndex(points, { x: 4.2, y: 3 })).toBe(1)
    expect(nearestSegmentIndex(points, { x: 8, y: 5 })).toBe(2)
  })

  it('détecte un fil dans un rectangle de sélection', () => {
    expect(wireIntersectsRect(points, { x: 3, y: 2, width: 2, height: 2 })).toBe(true)
    expect(wireIntersectsRect(points, { x: 5, y: 1, width: 3, height: 3 })).toBe(false)
  })
})

describe('jonctions et nets', () => {
  const trunk = wire('trunk', [
    [0, 5],
    [20, 5]
  ])

  it('un T : une extrémité sur un segment fait une jonction portée par le fil traversé', () => {
    const branch = wire('branch', [
      [10, 0],
      [10, 5]
    ])
    const result = computeConnectivity([trunk, branch], [])
    expect(result.junctions).toEqual([{ point: [10, 5], carrierWireId: 'trunk', branches: 3 }])
    expect(result.wireNet.get('trunk')).toBe(result.wireNet.get('branch'))
  })

  it('un croisement sans extrémité ne relie rien', () => {
    const crossing = wire('cross', [
      [10, 0],
      [10, 10]
    ])
    const result = computeConnectivity([trunk, crossing], [])
    expect(result.junctions).toEqual([])
    expect(result.wireNet.get('trunk')).not.toBe(result.wireNet.get('cross'))
  })

  it('deux extrémités bout à bout se relient sans point', () => {
    const next = wire('next', [
      [20, 5],
      [30, 5]
    ])
    const result = computeConnectivity([trunk, next], [])
    expect(result.junctions).toEqual([])
    expect(result.wireNet.get('trunk')).toBe(result.wireNet.get('next'))
  })

  it('une croix reliée compte quatre branches et une seule jonction', () => {
    const up = wire('up', [
      [10, 0],
      [10, 5]
    ])
    const down = wire('down', [
      [10, 5],
      [10, 10]
    ])
    const result = computeConnectivity([trunk, up, down], [])
    expect(result.junctions).toEqual([{ point: [10, 5], carrierWireId: 'trunk', branches: 4 }])
  })

  it('une extrémité sur un coude fait une jonction', () => {
    const bent = wire('bent', [
      [0, 0],
      [5, 0],
      [5, 5]
    ])
    const branch = wire('branch', [
      [5, 0],
      [5, -4]
    ])
    expect(computeConnectivity([bent, branch], []).junctions).toHaveLength(1)
  })

  it('repère les extrémités libres et relie les broches', () => {
    const project = createEmptyProject('p', DEFAULT_PROFILE)
    const def = createEmptyComponent('r', 'R')
    def.pins = [
      { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
      { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
    ]
    project.embeddedDefs = { r: def }
    project.components = [
      { id: 'r1', defId: 'r', x: 10, y: 10, rotation: 0, mirror: false, label: 'R1', fields: {} }
    ]
    const pins = projectPins(project)
    expect(pins.map((pin) => pin.point)).toEqual([
      [10, 11],
      [14, 11]
    ])
    const toPin = wire('w', [
      [0, 11],
      [10, 11]
    ])
    const result = computeConnectivity([toPin], pins)
    expect(result.freeEnds).toEqual([{ wireId: 'w', endIndex: 0, point: [0, 11] }])
    expect(result.wireNet.get('w')).toBe(result.pinNet.get('r1:a'))
    expect(result.pinNet.get('r1:a')).not.toBe(result.pinNet.get('r1:b'))
    expect(result.junctions).toEqual([])
    expect([...result.unconnectedPinKeys]).toEqual(['r1:b'])
  })
})
