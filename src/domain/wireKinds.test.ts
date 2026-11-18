// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeConnectivity, type PinRef } from './connectivity'
import { computeCrossings } from './crossings'
import { wiresFollowingJunctions, wiresFollowingPins } from './elastic'
import type { GridPoint } from './grid'
import { DEFAULT_PROFILE } from './profile'
import { createEmptyComponent } from './component'
import { createEmptyProject, wireProblem, type Wire, type WireKind } from './project'
import { parseProject, serializeProject } from './serialize'
import { DEFAULT_EXPORT } from './settings'
import { buildProjectSvg } from './svg'
import { unsolderedMarks } from './boardFaces'
import {
  BARE_WIRE_COLOR,
  jumperControl,
  jumperPathData,
  movedWireVertex,
  solderMark,
  wireBorder,
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
      {
        ...wire(
          'b',
          [
            [0, 0],
            [4, 0]
          ],
          'bare'
        ),
        color: BARE_WIRE_COLOR
      },
      // Un fil nu d'une autre couleur : la sienne, sur le même liseré.
      {
        ...wire(
          'c',
          [
            [0, 2],
            [4, 2]
          ],
          'bare'
        ),
        color: '#b45309'
      },
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
    expect(reread.wires.map((entry) => entry.kind)).toEqual(['bare', 'bare', 'jumper', undefined])
    const svg = buildProjectSvg(project, DEFAULT_EXPORT)?.svg ?? ''
    // Le pont : une courbe ; le fil nu : sa couleur, l'étain au départ, sur un liseré sombre ;
    // le fil : sa couleur.
    expect(svg).toContain('d="M 0 4 Q ')
    expect(svg).toContain(`stroke="${BARE_WIRE_COLOR}"`)
    expect(svg).toContain('stroke="#b45309"')
    expect(svg.split('stroke="#59616a"')).toHaveLength(3)
    expect(svg).toContain('stroke="#d62828"')
    // Sans broche sur son trajet, pas de point de soudure.
    expect(svg).not.toContain('class="solders"')
  })
})

describe('bordure des fils', () => {
  it('vient du style quand il en a une ; sinon seul le fil nu garde son liseré', () => {
    const plain = wire('w', [])
    const bare = wire('b', [], 'bare')
    const jumper = wire('j', [], 'jumper')
    // Sans bordure dans le style : rien pour un fil ou un pont, le liseré sombre pour un fil nu.
    expect(wireBorder(DEFAULT_PROFILE, plain)).toBeNull()
    expect(wireBorder(DEFAULT_PROFILE, jumper)).toBeNull()
    const edge = wireBorder(DEFAULT_PROFILE, bare)
    expect(edge?.color).toBe('#59616a')
    // Le liseré fait 1,6 fois l'épaisseur du fil : 0,3 de chaque côté.
    expect(edge?.width).toBeCloseTo(DEFAULT_PROFILE.wireWidth * 0.3)
    // Avec une bordure : la même pour tous, fil nu compris.
    const style = { ...DEFAULT_PROFILE, wireBorder: 0.04, wireBorderColor: '#1d4ed8' }
    for (const entry of [plain, bare, jumper]) {
      expect(wireBorder(style, entry)).toEqual({ width: 0.04, color: '#1d4ed8' })
    }
  })

  /** Un fil en flèche, croisé par un autre, un troisième raccordé au premier, et un pont. */
  function crossed(profile = DEFAULT_PROFILE): Document {
    const project = createEmptyProject('Bordé', profile)
    project.wires = [
      {
        ...wire('a', [
          [0, 2],
          [8, 2]
        ]),
        freeEnds: 'arrow'
      },
      {
        ...wire('b', [
          [4, 0],
          [4, 4]
        ]),
        stack: 3
      },
      {
        ...wire('c', [
          [6, 2],
          [6, 5]
        ]),
        stack: 1
      },
      {
        ...wire(
          'j',
          [
            [0, 6],
            [5, 8]
          ],
          'jumper'
        ),
        stack: 2
      }
    ]
    const svg = buildProjectSvg(project, DEFAULT_EXPORT)?.svg ?? ''
    return new DOMParser().parseFromString(svg, 'image/svg+xml')
  }

  it('s’exporte sous chaque fil, dans l’ordre des fils : celui du dessus garde la sienne', () => {
    const document = crossed({ ...DEFAULT_PROFILE, wireBorder: 0.05, wireBorderColor: '#1d4ed8' })
    const wires = document.querySelector('g.wires')
    if (!wires) throw new Error('fils attendus')
    // Fil après fil, la bordure puis le trait : la bordure d'un fil passe sur le fil d'avant.
    const paths = [...wires.querySelectorAll(':scope > path')]
    expect(paths.map((path) => path.getAttribute('stroke'))).toEqual([
      '#1d4ed8',
      '#d62828',
      '#1d4ed8',
      '#d62828',
      '#1d4ed8',
      '#d62828',
      '#1d4ed8',
      '#d62828'
    ])
    // Plus large que le fil de deux bordures, aux bouts ronds comme lui.
    expect(paths.map((path) => Number(path.getAttribute('stroke-width')))).toEqual([
      0.25, 0.15, 0.25, 0.15, 0.25, 0.15, 0.25, 0.15
    ])
    expect(paths[0]?.getAttribute('stroke-linecap')).toBe('round')
    expect(paths[1]?.getAttribute('stroke-linecap')).toBe('round')
    // Le pont, troisième dans l'ordre, a la sienne comme les autres.
    expect(paths[4]?.getAttribute('d')).toMatch(/^M 0 6 Q /)
    expect(paths[5]?.getAttribute('d')).toBe(paths[4]?.getAttribute('d'))
    // Les pointes de flèche du premier fil : leur bordure avant son trait.
    const first = [...wires.children].slice(0, 6).map((element) => element.tagName)
    expect(first).toEqual(['path', 'polygon', 'polygon', 'path', 'polygon', 'polygon'])
    expect(wires.querySelector('polygon')?.getAttribute('stroke-width')).toBe('0.1')
    expect(document.querySelector('g.wire-borders')).toBeNull()
  })

  it('au raccord, les fils sont repeints dans un disque : leurs bordures ne font qu’un contour', () => {
    const document = crossed({ ...DEFAULT_PROFILE, wireBorder: 0.05, wireBorderColor: '#1d4ed8' })
    const joints = document.querySelector('g.wire-joints')
    if (!joints) throw new Error('raccord attendu')
    // Un seul raccord : le bout du troisième fil sur le premier. Le croisement n'en est pas un.
    const clips = [...joints.querySelectorAll('clipPath')]
    expect(clips).toHaveLength(1)
    const disc = clips[0]?.querySelector('circle')
    expect([disc?.getAttribute('cx'), disc?.getAttribute('cy')]).toEqual(['6', '2'])
    // Le disque contient le point de jonction (rayon 0,15) et sa bordure.
    expect(Number(disc?.getAttribute('r'))).toBeCloseTo(0.21)
    const ring = joints.querySelector(':scope > circle')
    expect(ring?.getAttribute('fill')).toBe('#1d4ed8')
    expect(Number(ring?.getAttribute('r'))).toBeCloseTo(0.2)
    // Dedans : les traits des deux fils, sans bordure.
    const patch = joints.querySelector('g')
    expect(patch?.getAttribute('clip-path')).toBe(`url(#${clips[0]?.getAttribute('id')})`)
    expect(
      [...(patch?.querySelectorAll('path') ?? [])].map((path) => path.getAttribute('stroke'))
    ).toEqual(['#d62828', '#d62828'])
    // Le point de jonction reste au-dessus, de la couleur du fil.
    expect(document.querySelector('g.junctions circle')?.getAttribute('fill')).toBe('#d62828')
    // Sans bordure, rien à repeindre.
    expect(crossed().querySelector('g.wire-joints')).toBeNull()
  })

  it('au croisement, le fil du dessus passe avec sa bordure ; sans bordure, avec son liseré', () => {
    const bordered = crossed({ ...DEFAULT_PROFILE, wireBorder: 0.05, wireBorderColor: '#1d4ed8' })
    const lines = [...(bordered.querySelector('g.crossings')?.querySelectorAll('line') ?? [])]
    // Pas de liseré de la couleur du fond : la bordure détache le fil, et celui du dessous va
    // jusqu'à elle.
    expect(lines.map((line) => line.getAttribute('stroke'))).toEqual(['#1d4ed8', '#d62828'])
    expect(lines.map((line) => Number(line.getAttribute('stroke-width')))).toEqual([0.25, 0.15])
    // Le fil dépasse un peu sa bordure à chaque bout : leurs bouts ne laissent pas de filet.
    expect(lines.map((line) => Number(line.getAttribute('y1')))).toEqual([1.5, 1.48])
    // Sans bordure : le liseré, comme toujours.
    const plain = [...(crossed().querySelector('g.crossings')?.querySelectorAll('line') ?? [])]
    expect(plain.map((line) => line.getAttribute('stroke'))).toEqual(['#ffffff', '#d62828'])
    expect(plain.map((line) => Number(line.getAttribute('stroke-width')))).toEqual([0.33, 0.15])
  })

  it('compte un raccord là où le bout d’un fil touche un autre fil, ou son bout', () => {
    const joined = computeConnectivity(
      [
        wire('a', [
          [0, 0],
          [4, 0]
        ]),
        // Bout sur le milieu d'un fil, bout sur un bout, et un croisement, qui n'en est pas un.
        wire('b', [
          [2, 0],
          [2, 3]
        ]),
        wire('c', [
          [4, 0],
          [4, 3]
        ]),
        wire('d', [
          [3, -1],
          [3, 2]
        ])
      ],
      []
    )
    expect(
      joined.joints.map((joint) => [joint.point.join(','), [...joint.wireIds].sort().join('')])
    ).toEqual([
      ['4,0', 'ac'],
      ['2,0', 'ab']
    ])
    // Un seul point de jonction s'y dessine, mais les deux sont des raccords.
    expect(joined.junctions.map((junction) => junction.point)).toEqual([[2, 0]])
  })
})

describe('goutte de soudure d’un fil nu', () => {
  it('a une ombre en bas à droite et un reflet en haut à gauche, dans son rayon', () => {
    const mark = solderMark(10, 20, 0.2)
    // Le reflet : un petit disque, vers le haut et la gauche du centre.
    expect(mark.glint.cx).toBeLessThan(10)
    expect(mark.glint.cy).toBeLessThan(20)
    expect(Math.hypot(mark.glint.cx - 10, mark.glint.cy - 20) + mark.glint.r).toBeLessThan(0.2)
    // L'ombre : un arc qui part de la droite et finit en bas à gauche.
    const numbers = (mark.shade.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    const [startX, startY] = numbers
    const [endX, endY] = numbers.slice(-2)
    expect(mark.shade).toMatch(/^M [\d. -]+ A /)
    expect(startX).toBeGreaterThan(10)
    expect(startY).toBeLessThan(20)
    expect(endX).toBeLessThan(10)
    expect(endY).toBeGreaterThan(20)
    expect(mark.shadeWidth).toBeGreaterThan(0)
  })

  it('s’exporte à la couleur du fil, cernée comme lui, et remplace la marque de la patte', () => {
    const project = createEmptyProject('Soudé', DEFAULT_PROFILE)
    const def = createEmptyComponent('r', 'R')
    def.size = { widthCells: 2, heightCells: 2 }
    def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }]
    project.embeddedDefs = { r: def }
    project.components = [
      {
        id: 'c1',
        defId: 'r',
        x: 1,
        y: 0,
        rotation: 0,
        mirror: false,
        label: '',
        fields: {},
        behindWires: true
      }
    ]
    project.wires = [
      {
        ...wire(
          'b',
          [
            [0, 1],
            [4, 1]
          ],
          'bare'
        ),
        color: '#b45309'
      }
    ]
    const svg = buildProjectSvg(project, DEFAULT_EXPORT)?.svg ?? ''
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const solders = document.querySelector('g.solders')
    if (!solders) throw new Error('soudure attendue')
    // La goutte : de la couleur du fil, avec son ombre et son reflet.
    const [drop, glint] = [...solders.querySelectorAll('circle')]
    expect(drop?.getAttribute('fill')).toBe('#b45309')
    expect(Number(drop?.getAttribute('r'))).toBeCloseTo(0.225)
    expect(drop?.hasAttribute('stroke')).toBe(false)
    expect(glint?.getAttribute('fill')).toBe('#ffffff')
    expect(solders.querySelector('path')?.getAttribute('stroke-opacity')).toBe('0.16')
    expect(svg).not.toContain('#f5a524')
    // Son cerne se dessine avec le liseré du fil, sous lui : ils ne font qu'un contour.
    const ring = document.querySelector('g.wires circle')
    expect(ring?.getAttribute('fill')).toBe('#59616a')
    expect(Number(ring?.getAttribute('r'))).toBeCloseTo(0.225 + 0.045)
  })

  it('une patte soudée ne montre plus sa marque sur la pastille', () => {
    const marks = [
      { board: 'b', point: [2, 2] as GridPoint },
      { board: 'b', point: [3, 2] as GridPoint }
    ]
    expect(unsolderedMarks(marks, [{ point: [3, 2] }])).toEqual([marks[0]])
    expect(unsolderedMarks(marks, [])).toEqual(marks)
  })
})
