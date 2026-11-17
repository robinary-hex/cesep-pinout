import { describe, expect, it } from 'vitest'
import { computeConnectivity, type PinRef } from './connectivity'
import { computeCrossings } from './crossings'
import { wiresFollowingJunctions, wiresFollowingPins } from './elastic'
import type { GridPoint } from './grid'
import { DEFAULT_PROFILE } from './profile'
import { createEmptyProject, wireProblem, type Wire, type WireKind } from './project'
import { parseProject, serializeProject } from './serialize'
import { DEFAULT_EXPORT } from './settings'
import { buildProjectSvg } from './svg'
import {
  BARE_WIRE_COLOR,
  jumperControl,
  jumperPathData,
  movedWireVertex,
  wireInk,
  wireKindLabel,
  wireShapeData
} from './wireKinds'

function wire(id: string, points: GridPoint[], kind?: WireKind): Wire {
  return {
    id,
    color: '#d62828',
    points,
    stack: 0,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' },
    ...(kind ? { kind } : {})
  }
}

function pin(id: string, x: number, y: number): PinRef {
  return { key: `c:${id}`, instanceId: 'c', pinId: id, point: [x, y] }
}

describe('sortes de fils : tracé', () => {
  it('un pont a deux bouts distincts, où qu’ils soient ; les autres fils suivent la grille', () => {
    // Ni horizontal, ni vertical, ni à 45° : refusé pour un fil, permis pour un pont.
    const slanted: GridPoint[] = [
      [0, 0],
      [5, 2]
    ]
    expect(wireProblem({ points: slanted })).not.toBeNull()
    expect(wireProblem({ points: slanted, kind: 'bare' })).not.toBeNull()
    expect(wireProblem({ points: slanted, kind: 'jumper' })).toBeNull()
    expect(
      wireProblem({
        points: [
          [0, 0],
          [0, 0]
        ],
        kind: 'jumper'
      })
    ).toBe('Les deux bouts du pont sont confondus')
    expect(wireProblem({ points: [...slanted, [9, 9]], kind: 'jumper' })).toBe(
      'Un pont a deux bouts, et rien entre eux'
    )
    expect(wireKindLabel(undefined)).toBe('Fil')
    expect(wireKindLabel('bare')).toBe('Fil nu')
    expect(wireKindLabel('jumper')).toBe('Pont')
  })

  it('un pont se dessine en courbe, bombée à gauche de son sens de tracé', () => {
    // De gauche à droite : vers le haut. Corde de 10 : bombé de 1,8, point de contrôle à 3,6.
    expect(jumperControl([0, 0], [10, 0])).toEqual({ x: 5, y: -3.6 })
    // Retourné : de l'autre côté.
    expect(jumperControl([10, 0], [0, 0])).toEqual({ x: 5, y: 3.6 })
    // De haut en bas : vers la droite. Un pont court garde un bombé d'une demi-cellule.
    expect(jumperControl([0, 0], [0, 2])).toEqual({ x: 1, y: 1 })
    expect(
      jumperPathData([
        [0, 0],
        [10, 0]
      ])
    ).toBe('M 0 0 Q 5 -3.6 10 0')
    // Selon la sorte : la courbe d'un pont, sinon les segments du fil.
    const points: GridPoint[] = [
      [0, 0],
      [4, 0]
    ]
    expect(wireShapeData('jumper', points, 0)).toContain(' Q ')
    expect(wireShapeData('bare', points, 0)).not.toContain(' Q ')
    expect(wireShapeData(undefined, points, 0)).toBe(wireShapeData('bare', points, 0))
  })

  it('un fil nu se dessine en métal ; les autres dans leur couleur', () => {
    expect(wireInk(wire('a', [], 'bare'))).toBe(BARE_WIRE_COLOR)
    expect(wireInk(wire('a', [], 'jumper'))).toBe('#d62828')
    expect(wireInk(wire('a', []))).toBe('#d62828')
  })

  it('le bout d’un pont va où on le pose ; celui d’un fil ajoute un coude', () => {
    const points: GridPoint[] = [
      [0, 0],
      [6, 0]
    ]
    expect(movedWireVertex('jumper', points, 1, [5, 3])).toEqual([
      [0, 0],
      [5, 3]
    ])
    const bent = movedWireVertex(undefined, points, 1, [6, 3])
    expect(bent.length).toBeGreaterThan(2)
    expect(bent.at(-1)).toEqual([6, 3])
  })
})

describe('sortes de fils : ce qu’ils relient', () => {
  it('un fil nu est soudé à toutes les broches sur son trajet, pas un fil isolé', () => {
    const pins = [pin('a', 0, 0), pin('b', 2, 0), pin('c', 4, 0), pin('d', 2, 3)]
    const line: GridPoint[] = [
      [0, 0],
      [4, 0]
    ]
    // Isolé : ses deux bouts seulement ; la broche du milieu n'est reliée à rien.
    const insulated = computeConnectivity([wire('w', line)], pins)
    expect(insulated.pinNet.get('c:a')).toBe(insulated.pinNet.get('c:c'))
    expect(insulated.pinNet.get('c:b')).not.toBe(insulated.pinNet.get('c:a'))
    expect(insulated.solders).toEqual([])
    expect([...insulated.unconnectedPinKeys].sort()).toEqual(['c:b', 'c:d'])
    // Nu : les trois broches de la rangée, avec un point de soudure sur chacune.
    const bare = computeConnectivity([wire('w', line, 'bare')], pins)
    expect(bare.pinNet.get('c:b')).toBe(bare.pinNet.get('c:a'))
    expect(bare.pinNet.get('c:c')).toBe(bare.pinNet.get('c:a'))
    expect(bare.pinNet.get('c:d')).not.toBe(bare.pinNet.get('c:a'))
    expect(bare.solders.map((solder) => solder.point)).toEqual([
      [0, 0],
      [2, 0],
      [4, 0]
    ])
    expect([...bare.unconnectedPinKeys]).toEqual(['c:d'])
  })

  it('deux fils nus qui se croisent ne se touchent pas pour autant', () => {
    const crossing = computeConnectivity(
      [
        wire(
          'h',
          [
            [0, 2],
            [4, 2]
          ],
          'bare'
        ),
        wire(
          'v',
          [
            [2, 0],
            [2, 4]
          ],
          'bare'
        )
      ],
      []
    )
    expect(crossing.wireNet.get('h')).not.toBe(crossing.wireNet.get('v'))
    // Le bout d'un fil posé sur un fil nu, lui, s'y raccorde, comme sur tout fil.
    const joined = computeConnectivity(
      [
        wire(
          'h',
          [
            [0, 2],
            [4, 2]
          ],
          'bare'
        ),
        wire('t', [
          [2, 2],
          [2, 6]
        ])
      ],
      []
    )
    expect(joined.wireNet.get('h')).toBe(joined.wireNet.get('t'))
  })

  it('un pont n’est relié que par ses bouts : rien ne s’accroche à sa corde', () => {
    const jumper = wire(
      'j',
      [
        [0, 0],
        [6, 0]
      ],
      'jumper'
    )
    const pins = [pin('a', 0, 0), pin('b', 6, 0), pin('m', 3, 0)]
    const net = computeConnectivity(
      [
        jumper,
        // Un fil dont le bout tombe au milieu de la corde du pont : pas de jonction.
        wire('w', [
          [3, 0],
          [3, 4]
        ])
      ],
      pins
    )
    expect(net.pinNet.get('c:a')).toBe(net.pinNet.get('c:b'))
    expect(net.wireNet.get('w')).not.toBe(net.wireNet.get('j'))
    expect(net.pinNet.get('c:m')).not.toBe(net.pinNet.get('c:a'))
    // Au bout du pont, un autre fil se raccorde.
    const joined = computeConnectivity(
      [
        jumper,
        wire('w', [
          [6, 0],
          [6, 4]
        ])
      ],
      []
    )
    expect(joined.wireNet.get('w')).toBe(joined.wireNet.get('j'))
    // Un pont passe par-dessus tout : il n'a pas de croisement à redessiner.
    expect(
      computeCrossings([
        jumper,
        wire('v', [
          [3, -2],
          [3, 2]
        ])
      ])
    ).toEqual([])
  })
})

describe('sortes de fils : élasticité', () => {
  it('le bout d’un pont suit sa broche, sans coude', () => {
    const jumper = wire(
      'j',
      [
        [0, 0],
        [6, 0]
      ],
      'jumper'
    )
    const [moved] = wiresFollowingPins([jumper], [pin('b', 6, 0)], [pin('b', 8, 3)])
    expect(moved?.points).toEqual([
      [0, 0],
      [8, 3]
    ])
    // Le même fil, isolé : un coude s'ajoute pour rester sur la grille.
    const [bent] = wiresFollowingPins(
      [wire('w', jumper.points)],
      [pin('b', 6, 0)],
      [pin('b', 8, 3)]
    )
    expect(bent?.points.length).toBeGreaterThan(2)
  })

  it('le bout d’un pont posé sur un fil suit ce fil', () => {
    const carrier = wire('w', [
      [0, 0],
      [8, 0]
    ])
    const jumper = wire(
      'j',
      [
        [4, 0],
        [9, 5]
      ],
      'jumper'
    )
    const lower = { ...carrier, points: [...carrier.points].map(([x, y]): GridPoint => [x, y + 2]) }
    const after = wiresFollowingJunctions([carrier, jumper], [lower, jumper])
    expect(after.find((entry) => entry.id === 'j')?.points).toEqual([
      [4, 2],
      [9, 5]
    ])
  })
})

describe('sortes de fils : fichier et export', () => {
  it('s’enregistrent avec le montage et s’exportent chacun à sa façon', () => {
    const project = createEmptyProject('Plaque', DEFAULT_PROFILE)
    project.wires = [
      wire(
        'b',
        [
          [0, 0],
          [4, 0]
        ],
        'bare'
      ),
      wire(
        'j',
        [
          [0, 4],
          [5, 6]
        ],
        'jumper'
      ),
      wire('w', [
        [0, 8],
        [4, 8]
      ])
    ]
    const reread = parseProject(serializeProject(project))
    expect(reread.wires.map((entry) => entry.kind)).toEqual(['bare', 'jumper', undefined])
    const svg = buildProjectSvg(project, DEFAULT_EXPORT)?.svg ?? ''
    // Le pont : une courbe ; le fil nu : en métal sur un liseré sombre ; le fil : sa couleur.
    expect(svg).toContain('d="M 0 4 Q ')
    expect(svg).toContain(`stroke="${BARE_WIRE_COLOR}"`)
    expect(svg).toContain('stroke="#59616a"')
    expect(svg).toContain('stroke="#d62828"')
    // Sans broche sur son trajet, pas de point de soudure.
    expect(svg).not.toContain('class="solders"')
  })
})
