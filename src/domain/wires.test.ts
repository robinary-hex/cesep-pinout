import { describe, expect, it } from 'vitest'
import { createEmptyComponent } from './component'
import { computeConnectivity, projectPins } from './connectivity'
import type { GridPoint } from './grid'
import { DEFAULT_PROFILE } from './profile'
import { createEmptyProject, wireGeometryProblem, type Wire } from './project'
import {
  dragVertex,
  horizontalFirstFor,
  insertVertex,
  locateOnWire,
  moveSegment,
  nearestSegmentIndex,
  nearestWirePoint,
  normalizePoints,
  pointOnSegment,
  removeVertex,
  routeDiagonal,
  routeL,
  routeLAuto,
  routeWire,
  segmentCoordinate,
  simplifyPoints,
  splitPoints,
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
      {
        id: 'r1',
        defId: 'r',
        x: 10,
        y: 10,
        rotation: 0,
        mirror: false,
        label: 'R1',
        fields: {},
        behindWires: false
      }
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

describe('fils en diagonale à 45°', () => {
  /** Horizontal, diagonale, horizontal : un décroché de deux cellules. */
  const jog: GridPoint[] = [
    [0, 0],
    [3, 0],
    [5, 2],
    [9, 2]
  ]

  it('accepte une diagonale à 45°, pas une autre pente ; un diagramme les refuse toutes', () => {
    expect(wireGeometryProblem(jog)).toBeNull()
    expect(
      wireGeometryProblem([
        [0, 0],
        [4, 2]
      ])
    ).toMatch(/ni à 45°/)
    // Un demi-tour sur une diagonale reste refusé.
    expect(
      wireGeometryProblem([
        [0, 0],
        [3, 3],
        [1, 1]
      ])
    ).toMatch(/revient/)
    expect(wireGeometryProblem(jog, true)).toMatch(/ni horizontal ni vertical/)
  })

  it('trace une diagonale puis un segment droit, ou l’inverse avec Maj', () => {
    expect(routeDiagonal([0, 0], [5, 2])).toEqual([
      [0, 0],
      [2, 2],
      [5, 2]
    ])
    expect(routeDiagonal([0, 0], [5, 2], true)).toEqual([
      [0, 0],
      [3, 0],
      [5, 2]
    ])
    expect(routeDiagonal([0, 0], [-2, -6])).toEqual([
      [0, 0],
      [-2, -2],
      [-2, -6]
    ])
    // Deux points en diagonale exacte, ou alignés : un seul segment.
    expect(routeDiagonal([0, 0], [3, -3])).toEqual([
      [0, 0],
      [3, -3]
    ])
    expect(routeDiagonal([0, 0], [4, 0])).toEqual([
      [0, 0],
      [4, 0]
    ])
    // `routeWire` : en L sans Alt, à 45° avec.
    expect(routeWire([0, 0], [5, 2])).toEqual(routeLAuto([0, 0], [5, 2]))
    expect(routeWire([0, 0], [5, 2], { diagonal: true, invert: true })).toEqual(
      routeDiagonal([0, 0], [5, 2], true)
    )
  })

  it('situe un point sur une diagonale et fusionne les diagonales alignées', () => {
    expect(pointOnSegment([4, 1], [3, 0], [5, 2])).toBe(true)
    expect(pointOnSegment([4, 2], [3, 0], [5, 2])).toBe(false)
    expect(pointOnSegment([6, 3], [3, 0], [5, 2])).toBe(false)
    expect(locateOnWire(jog, [4, 1])).toEqual({ kind: 'segment', index: 1 })
    expect(
      simplifyPoints([
        [0, 0],
        [2, 2],
        [5, 5],
        [5, 8]
      ])
    ).toEqual([
      [0, 0],
      [5, 5],
      [5, 8]
    ])
  })

  it('arrondit un coude à 45° ou à 135° par un arc tangent aux deux segments', () => {
    // Déviation de 45° : les points de tangence sont à 0,4 × tan(22,5°) du sommet.
    expect(
      wirePathData(
        [
          [0, 0],
          [4, 0],
          [8, 4]
        ],
        0.4
      )
    ).toBe('M 0 0 L 3.834 0 A 0.4 0.4 0 0 1 4.117 0.117 L 8 4')
    // Angle aigu (déviation de 135°) : à 0,4 × tan(67,5°).
    expect(
      wirePathData(
        [
          [0, 0],
          [4, 0],
          [0, 4]
        ],
        0.4
      )
    ).toBe('M 0 0 L 3.034 0 A 0.4 0.4 0 0 1 3.317 0.683 L 0 4')
    // Un sommet au milieu d'une diagonale ne s'arrondit pas.
    expect(
      wirePathData(
        [
          [0, 0],
          [2, 2],
          [5, 5]
        ],
        0.4
      )
    ).toBe('M 0 0 L 2 2 L 5 5')
  })

  it('déplace un segment : le sommet commun glisse le long de la diagonale voisine', () => {
    const wire: GridPoint[] = [
      [0, 0],
      [2, 2],
      [6, 2],
      [6, 5]
    ]
    expect(moveSegment(wire, 1, 4)).toEqual([
      [0, 0],
      [4, 4],
      [6, 4],
      [6, 5]
    ])
    expect(moveSegment(wire, 1, 1)).toEqual([
      [0, 0],
      [1, 1],
      [6, 1],
      [6, 5]
    ])
  })

  it('déplace une diagonale parallèlement à elle-même, sous le pointeur', () => {
    // Pointeur en (6,2 ; 1,1) : la diagonale passe par (5, 0) sur la rangée de son premier sommet.
    expect(segmentCoordinate(jog, 1, { x: 6.2, y: 1.1 })).toBe(5)
    expect(moveSegment(jog, 1, 5)).toEqual([
      [0, 0],
      [5, 0],
      [7, 2],
      [9, 2]
    ])
    // Diagonale d'extrémité : l'extrémité reste, un coude la relie.
    expect(
      moveSegment(
        [
          [0, 0],
          [3, 3],
          [8, 3]
        ],
        0,
        2
      )
    ).toEqual([
      [0, 0],
      [2, 0],
      [5, 3],
      [8, 3]
    ])
    expect(segmentCoordinate(jog, 0, { x: 1.4, y: 2.6 })).toBe(3)
    expect(segmentCoordinate(jog, 2, { x: 7.7, y: 0.2 })).toBe(0)
  })

  it('déplace un sommet ou une extrémité : les diagonales gardent leur pente', () => {
    // Extrémité d'un segment horizontal : le coude suivant glisse sur la diagonale.
    expect(dragVertex(jog, 0, [0, 1])).toEqual([
      [0, 1],
      [4, 1],
      [5, 2],
      [9, 2]
    ])
    // Extrémité d'une diagonale : son autre bout glisse sur le segment suivant.
    expect(
      dragVertex(
        [
          [0, 0],
          [3, 3],
          [8, 3]
        ],
        0,
        [1, 0]
      )
    ).toEqual([
      [1, 0],
      [4, 3],
      [8, 3]
    ])
    // Fil d'une seule diagonale : l'autre extrémité reste, un segment droit complète.
    expect(
      dragVertex(
        [
          [0, 0],
          [3, 3]
        ],
        0,
        [-2, 0]
      )
    ).toEqual([
      [-2, 0],
      [1, 3],
      [3, 3]
    ])
    // Sommet entre un horizontal et une diagonale.
    expect(dragVertex(jog, 1, [4, 0])).toEqual([
      [0, 0],
      [4, 0],
      [6, 2],
      [9, 2]
    ])
    expect(dragVertex(jog, 2, [5, 3])).toEqual([
      [0, 0],
      [2, 0],
      [5, 3],
      [9, 3],
      [9, 2]
    ])
  })

  it('ne sélectionne une diagonale que si le lasso la touche vraiment', () => {
    const diagonal: GridPoint[] = [
      [0, 0],
      [6, 6]
    ]
    expect(wireIntersectsRect(diagonal, { x: 4, y: 0, width: 2, height: 1 })).toBe(false)
    expect(wireIntersectsRect(diagonal, { x: 2, y: 2.5, width: 1, height: 1 })).toBe(true)
    expect(nearestSegmentIndex(jog, { x: 4.4, y: 0.9 })).toBe(1)
  })

  it('une extrémité posée sur une diagonale s’y relie, avec un point de jonction', () => {
    const carrier = wire('carrier', jog, 0)
    const branch = wire(
      'branch',
      [
        [4, 1],
        [4, 6]
      ],
      1
    )
    const result = computeConnectivity([carrier, branch], [])
    expect(result.wireNet.get('carrier')).toBe(result.wireNet.get('branch'))
    expect(result.junctions).toEqual([{ point: [4, 1], carrierWireId: 'carrier', branches: 3 }])
  })
})

describe('sommets d’un fil, au clic droit', () => {
  const corner: GridPoint[] = [
    [0, 0],
    [4, 0],
    [4, 3]
  ]

  it('trouve le point de grille le plus proche d’un clic et dit où il est sur le fil', () => {
    expect(nearestWirePoint(corner, { x: 2.2, y: 0.3 })).toEqual({
      point: [2, 0],
      location: { kind: 'segment', index: 0 }
    })
    expect(nearestWirePoint(corner, { x: 3.8, y: 0.2 })).toEqual({
      point: [4, 0],
      location: { kind: 'vertex', index: 1 }
    })
    expect(nearestWirePoint(corner, { x: -0.3, y: 0.1 })?.location).toEqual({
      kind: 'end',
      index: 0
    })
    // Sur une diagonale, le pas de grille le plus proche le long d'elle.
    expect(
      nearestWirePoint(
        [
          [0, 0],
          [3, 3]
        ],
        { x: 1.2, y: 0.9 }
      )?.point
    ).toEqual([1, 1])
  })

  it('ajoute un sommet au milieu d’un segment, nulle part ailleurs', () => {
    expect(insertVertex(corner, [2, 0])).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 3]
    ])
    expect(insertVertex(corner, [4, 0])).toBeNull()
    expect(insertVertex(corner, [2, 1])).toBeNull()
  })

  it('retire un sommet : ses voisins se rejoignent, ce qui n’est pas toujours un fil valide', () => {
    expect(
      removeVertex(
        [
          [0, 0],
          [2, 0],
          [4, 0],
          [4, 3]
        ],
        1
      )
    ).toEqual(corner)
    // Un coin retiré donne un biais : valide seulement à 45°.
    expect(wireGeometryProblem(removeVertex(corner, 1) ?? [])).toMatch(/ni à 45°/)
    expect(
      wireGeometryProblem(
        removeVertex(
          [
            [0, 0],
            [3, 0],
            [3, 3]
          ],
          1
        ) ?? []
      )
    ).toBeNull()
    // Une extrémité retirée raccourcit le fil ; il garde toujours deux sommets.
    expect(removeVertex(corner, 0)).toEqual([
      [4, 0],
      [4, 3]
    ])
    expect(
      removeVertex(
        [
          [0, 0],
          [4, 0]
        ],
        0
      )
    ).toBeNull()
  })

  it('coupe un fil en deux morceaux qui se touchent', () => {
    expect(splitPoints(corner, [2, 0])).toEqual([
      [
        [0, 0],
        [2, 0]
      ],
      [
        [2, 0],
        [4, 0],
        [4, 3]
      ]
    ])
    expect(splitPoints(corner, [4, 0])).toEqual([
      [
        [0, 0],
        [4, 0]
      ],
      [
        [4, 0],
        [4, 3]
      ]
    ])
    expect(splitPoints(corner, [0, 0])).toBeNull()
    expect(splitPoints(corner, [9, 9])).toBeNull()
  })
})
