import { describe, expect, it } from 'vitest'
import { boardFootprints, boardLoad, boardsCarry, loadOfBoards } from './boardCarry'
import { boardFace, boardFaces, NO_BOARD_FACES, OTHER_FACE_PIN, throughMarks } from './boardFaces'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, type ComponentDefinition } from './component'
import { computeConnectivity, projectPins, type Connectivity } from './connectivity'
import { wiresFollowingPins } from './elastic'
import type { GridPoint, Rotation } from './grid'
import {
  applyMatrix,
  facesGap,
  facesHinge,
  flippedInstance,
  instanceMatrix,
  invertMatrix,
  multiplyMatrices,
  projectBounds,
  rotatedInstance,
  spreadBoard,
  transformedInstance,
  transformedPoint,
  type Matrix
} from './placement'
import { DEFAULT_PROFILE } from './profile'
import {
  createEmptyProject,
  instanceDefinition,
  type ComponentInstance,
  type Project,
  type TextLabel,
  type Wire,
  type WireKind
} from './project'
import { parseProject, serializeProject } from './serialize'
import { DEFAULT_EXPORT } from './settings'
import { restretch } from './stretchPlacement'
import { buildProjectSvg } from './svg'

/** Une plaque de 8 × 6 cellules : 7 × 5 trous, à une cellule de ses bords. */
function board(): ComponentDefinition {
  const def = createEmptyComponent('plaque', 'Plaque')
  def.size = { widthCells: 8, heightCells: 6 }
  def.visual = {
    kind: 'drawing',
    primitives: [
      { kind: 'rect', x: 0, y: 0, w: 32, h: 24, rx: 0, style: DEFAULT_SHAPE_STYLE },
      { kind: 'holes', x: 4, y: 4, w: 24, h: 16, color: '#d5dbe0' }
    ]
  }
  return def
}

/** Un composant à deux pattes, à deux trous d'écart. */
function part(): ComponentDefinition {
  const def = createEmptyComponent('led', 'LED')
  def.size = { widthCells: 2, heightCells: 2 }
  def.pins = [
    { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
    { id: 'k', name: '2', kind: 'io', x: 2, y: 1 }
  ]
  return def
}

function placed(id: string, defId: string, x: number, y: number): ComponentInstance {
  return { id, defId, x, y, rotation: 0, mirror: false, label: '', fields: {}, behindWires: true }
}

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

/**
 * La plaque en (10, 10), ses deux faces montrées : le dessus de x = 10 à 18, le dessous de 20 à
 * 28, et x + x' = 38 d'une face à l'autre. La LED en (12, 11) : ses pattes dans les trous
 * (12, 12) et (14, 12), qui ressortent dessous en (26, 12) et (24, 12).
 */
function montage(wires: Wire[] = [], faces = true): Project {
  const doc = createEmptyProject('Plaque', DEFAULT_PROFILE)
  doc.embeddedDefs = { plaque: board(), led: part() }
  doc.components = [
    { ...placed('b', 'plaque', 10, 10), ...(faces ? { underside: true } : {}) },
    placed('c', 'led', 12, 11)
  ]
  doc.wires = wires
  return doc
}

function connectivity(doc: Project): Connectivity {
  const faces = boardFaces(doc)
  return computeConnectivity(doc.wires, projectPins(doc, faces), faces.twins)
}

describe('plaque à deux faces : le dessous à côté du dessus', () => {
  it('se dessine à droite, retourné comme une page qu’on tourne', () => {
    const doc = montage()
    const plate = doc.components[0]
    const def = plate ? instanceDefinition(doc, plate) : undefined
    if (!plate || !def) throw new Error('plaque absente')
    const face = boardFace(plate, def)
    expect(face).toMatchObject({
      id: 'b',
      top: { x: 10, y: 10, width: 8, height: 6 },
      bottom: { x: 20, y: 10, width: 8, height: 6 },
      flip: 38
    })
    expect(face?.holes).toHaveLength(35)
    // Le trou du coin haut gauche du dessus est au coin haut droit du dessous, et inversement.
    const { twins, boards } = boardFaces(doc)
    expect(boards.map((entry) => entry.id)).toEqual(['b'])
    expect(twins.get('11,11')).toEqual({ board: 'b', point: [27, 11] })
    expect(twins.get('27,11')).toEqual({ board: 'b', point: [11, 11] })
    expect(twins.get('17,15')).toEqual({ board: 'b', point: [21, 15] })
    // Hors des trous, rien.
    expect(twins.has('10,10')).toBe(false)
    // Le montage occupe aussi la place du dessous, et celle du pli, qui dépasse d'une
    // demi-cellule en haut et en bas.
    expect(projectBounds(doc)).toEqual({ x: 10, y: 9.5, width: 18, height: 7 })
  })

  it('un pli sépare les deux faces : un trait pointillé, et la flèche qui dit « retournée »', () => {
    const hinge = facesHinge({ x: 10, y: 10, width: 8, height: 6 })
    // Sur l'axe du miroir, au milieu de l'écart ; coupé à mi-hauteur par la flèche.
    expect(hinge.x).toBe(19)
    expect(hinge.spans).toEqual([
      [9.5, 12.3],
      [13.5, 16.5]
    ])
    // Un arc du dessus vers le dessous, la pointe au bout.
    expect(hinge.arc).toBe('M 18.4 13 Q 19 12.4 19.6 13')
    expect(hinge.head.split(' ')).toHaveLength(3)
    expect(hinge.head.startsWith('19.699,13.099')).toBe(true)
    const svg = buildProjectSvg(montage(), DEFAULT_EXPORT)?.svg ?? ''
    expect(svg).toContain('class="faces-hinge"')
    expect(svg).toContain('x1="19" y1="9.5" x2="19" y2="12.3"')
    expect(svg).toContain(`d="${hinge.arc}"`)
    // Avant les composants : sous tout le reste.
    expect(svg.indexOf('faces-hinge')).toBeLessThan(svg.indexOf('class="components'))
    expect(buildProjectSvg(montage([], false), DEFAULT_EXPORT)?.svg).not.toContain('faces-hinge')
  })

  it('ne se montre qu’à la demande, et s’enregistre avec le montage', () => {
    const plain = montage([], false)
    expect(boardFaces(plain)).toBe(NO_BOARD_FACES)
    expect(projectBounds(plain)).toEqual({ x: 10, y: 10, width: 8, height: 6 })
    const reread = parseProject(serializeProject(montage()))
    expect(reread.components.map((instance) => instance.underside)).toEqual([true, undefined])
    // Un composant qui n'est pas une plaque n'a pas de dessous, quoi que dise son champ.
    const odd = montage([], false)
    odd.components = odd.components.map((instance) =>
      instance.id === 'c' ? { ...instance, underside: true } : instance
    )
    expect(boardFaces(odd).boards).toEqual([])
  })

  it('exporte le dessous retourné et ce qui ressort sur ses pastilles', () => {
    const svg = buildProjectSvg(montage(), DEFAULT_EXPORT)
    expect(svg?.svg).toContain('class="underside" transform="matrix(-1 0 0 1 38 0)"')
    // Les deux pattes de la LED, vues de dessous.
    expect(svg?.svg).toContain('class="through"')
    expect(svg?.svg).toContain('cx="26" cy="12"')
    expect(svg?.svg).toContain('cx="24" cy="12"')
    expect(svg?.widthCells).toBe(18 + 2 * DEFAULT_EXPORT.marginCells)
    expect(buildProjectSvg(montage([], false), DEFAULT_EXPORT)?.svg).not.toContain('underside')
  })
})

describe('plaque à deux faces : ce qui relie les faces', () => {
  it('une broche enfichée dessus se soude dessous', () => {
    const doc = montage([
      wire('w', [
        [26, 12],
        [26, 14],
        [24, 14],
        [24, 12]
      ])
    ])
    const pins = projectPins(doc)
    expect(pins.map((pin) => [pin.key, pin.point, pin.of])).toEqual([
      ['c:a', [12, 12], undefined],
      ['c:k', [14, 12], undefined],
      [`c:a${OTHER_FACE_PIN}`, [26, 12], 'c:a'],
      [`c:k${OTHER_FACE_PIN}`, [24, 12], 'c:k']
    ])
    // Le fil du dessous relie les deux pattes : elles ne sont plus « reliées à rien ».
    const net = connectivity(doc)
    expect(net.pinNet.get('c:a')).toBe(net.pinNet.get('c:k'))
    expect(net.pinNet.get('c:a')).toBe(net.wireNet.get('w'))
    expect([...net.pinNet.keys()]).toEqual(['c:a', 'c:k'])
    expect(net.unconnectedPinKeys.size).toBe(0)
    expect(net.freeEnds).toEqual([])
    // Sans le dessous, le même fil ne touche rien.
    const plain = connectivity(montage(doc.wires, false))
    expect(plain.unconnectedPinKeys.size).toBe(2)
    expect(plain.freeEnds).toHaveLength(2)
  })

  it('deux bouts de fil dans le même trou, un par face, sont reliés', () => {
    const doc = montage([
      // Dessus : du trou (16, 14) vers l'extérieur de la plaque.
      wire('haut', [
        [16, 14],
        [16, 20]
      ]),
      // Dessous : le même trou, vu de dessous, est en (22, 14).
      wire('bas', [
        [22, 14],
        [22, 12]
      ]),
      // Un fil isolé qui passe sur la pastille sans s'y arrêter ne s'y soude pas.
      wire('passe', [
        [21, 15],
        [24, 15]
      ]),
      wire('haut2', [
        [15, 15],
        [15, 21]
      ])
    ])
    const net = connectivity(doc)
    expect(net.wireNet.get('haut')).toBe(net.wireNet.get('bas'))
    expect(net.wireNet.get('haut2')).not.toBe(net.wireNet.get('passe'))
    // Les bouts soudés au même trou ne sont pas libres ; les autres le restent.
    const free = net.freeEnds.map((end) => `${end.wireId}:${end.endIndex}`)
    expect(free).not.toContain('haut:0')
    expect(free).not.toContain('bas:0')
    expect(free).toContain('haut:1')
    expect(free).toContain('haut2:0')
  })

  it('un fil nu couché dessous est soudé aux pattes et aux bouts qui ressortent sur son trajet', () => {
    const doc = montage([
      // Sur la rangée des pattes de la LED, vues de dessous : (26, 12) et (24, 12).
      wire(
        'nu',
        [
          [27, 12],
          [23, 12]
        ],
        'bare'
      ),
      // Un fil du dessus enfiché en (16, 14), qui ressort en (22, 14) sous un autre fil nu.
      wire('haut', [
        [16, 14],
        [16, 20]
      ]),
      wire(
        'nu2',
        [
          [21, 14],
          [23, 14]
        ],
        'bare'
      )
    ])
    const net = connectivity(doc)
    expect(net.pinNet.get('c:a')).toBe(net.wireNet.get('nu'))
    expect(net.pinNet.get('c:k')).toBe(net.wireNet.get('nu'))
    expect(net.wireNet.get('haut')).toBe(net.wireNet.get('nu2'))
    expect(net.wireNet.get('nu')).not.toBe(net.wireNet.get('nu2'))
    // Une goutte de soudure sur chaque pastille occupée du trajet, une seule fois.
    const solders = net.solders.map((solder) => `${solder.wireId}:${solder.point.join(',')}`)
    expect(solders.sort()).toEqual(['nu2:22,14', 'nu:24,12', 'nu:26,12'])
    // Le même fil, isolé : il passe sur les pattes sans s'y souder.
    const insulated = connectivity(
      montage([
        wire('w', [
          [27, 12],
          [23, 12]
        ])
      ])
    )
    expect(insulated.unconnectedPinKeys.size).toBe(2)
  })

  it('marque sur chaque face les pastilles où ressort ce qui est enfiché de l’autre côté', () => {
    const doc = montage([
      // Dessus : un bout dans le trou (16, 14).
      wire('haut', [
        [16, 14],
        [16, 20]
      ]),
      // Dessous : un bout sur la patte de la LED, l'autre dans un trou vide.
      wire('bas', [
        [26, 12],
        [26, 15],
        [21, 15]
      ])
    ])
    const faces = boardFaces(doc)
    const marks = throughMarks(doc.wires, projectPins(doc, faces), faces)
    expect(marks.every((mark) => mark.board === 'b')).toBe(true)
    expect(marks.map((mark) => mark.point.join(',')).sort()).toEqual([
      // Le trou (21, 15) du dessous se voit dessus en (17, 15).
      '17,15',
      // Le bout du fil du dessus, vu de dessous.
      '22,14',
      // Les deux pattes de la LED, vues de dessous.
      '24,12',
      '26,12'
    ])
    // Rien là où le composant dessine lui-même sa patte : (12, 12), sous le bout de « bas ».
    expect(throughMarks(doc.wires, projectPins(montage([], false)), NO_BOARD_FACES)).toEqual([])
  })

  it('une patte qui change de trou emmène le fil soudé dessous, en sens inverse', () => {
    const doc = montage([
      wire('w', [
        [26, 12],
        [26, 14]
      ])
    ])
    // La LED avance d'un trou vers la droite : vue de dessous, sa patte recule d'un trou.
    const moved: Project = {
      ...doc,
      components: doc.components.map((instance) =>
        instance.id === 'c' ? { ...instance, x: instance.x + 1 } : instance
      )
    }
    const [followed] = wiresFollowingPins(doc.wires, projectPins(doc), projectPins(moved))
    expect(followed?.points[0]).toEqual([25, 12])
    // Sortie de la plaque, la patte ne ressort plus nulle part : le fil reste où il est.
    const away: Project = {
      ...doc,
      components: doc.components.map((instance) =>
        instance.id === 'c' ? { ...instance, x: 40 } : instance
      )
    }
    const [left] = wiresFollowingPins(doc.wires, projectPins(doc), projectPins(away))
    expect(left).toBe(doc.wires[0])
  })
})

describe('plaque à trous : ce qu’elle emmène', () => {
  function label(id: string, x: number, y: number): TextLabel {
    return {
      id,
      x,
      y,
      w: 3,
      h: 1,
      anchor: 'start',
      text: 'Entrée',
      size: 12,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      vertical: false,
      color: '#000000',
      background: false
    }
  }

  /** La plaque, la LED, un fil par face, un fil qui sort de la plaque, une étiquette dessus. */
  function loaded(): Project {
    const doc = montage([
      wire('dessous', [
        [26, 12],
        [26, 14],
        [24, 14],
        [24, 12]
      ]),
      wire('dessus', [
        [12, 14],
        [15, 14]
      ]),
      // Du trou (16, 15) vers un point hors de la plaque.
      wire('sortant', [
        [16, 15],
        [16, 20]
      ]),
      // Ailleurs sur le montage.
      wire('loin', [
        [0, 0],
        [4, 0]
      ])
    ])
    doc.embeddedDefs = { ...doc.embeddedDefs }
    doc.components = [...doc.components, placed('r', 'led', 0, 2)]
    doc.labels = [label('t1', 11, 15), label('t2', 0, 5)]
    return doc
  }

  function faceOf(doc: Project): NonNullable<ReturnType<typeof boardFace>> {
    const plate = doc.components.find((instance) => instance.id === 'b')
    const def = plate ? instanceDefinition(doc, plate) : undefined
    const face = plate && def ? boardFace(plate, def) : null
    if (!face) throw new Error('plaque absente')
    return face
  }

  const NOTHING = {
    instances: new Set<string>(),
    wires: new Set<string>(),
    labels: new Set<string>()
  }

  it('porte ce qui est enfiché dans ses trous ou posé sur elle, face par face', () => {
    const doc = loaded()
    const load = boardLoad(doc, faceOf(doc), NOTHING)
    expect(load.top).toEqual({
      instances: ['c'],
      wires: ['dessus'],
      labels: ['t1'],
      ends: [[16, 15]]
    })
    expect(load.bottom).toEqual({ instances: [], wires: ['dessous'], labels: [], ends: [] })
    // Ce qui bouge déjà de lui-même n'est pas emmené une seconde fois.
    const partly = boardLoad(doc, faceOf(doc), {
      instances: new Set(['c']),
      wires: new Set(['dessous']),
      labels: new Set(['t1'])
    })
    expect(partly.top.instances).toEqual([])
    expect(partly.top.labels).toEqual([])
    expect(partly.bottom.wires).toEqual([])
    // Tout ce qu'emmènent les plaques d'une sélection, faces confondues.
    const all = loadOfBoards(doc, { ...NOTHING, instances: new Set(['b']) })
    expect(all).toEqual({
      instances: ['c'],
      wires: ['dessus', 'dessous'],
      labels: ['t1'],
      ends: [[16, 15]]
    })
    // Une plaque qui ne montre pas son dessous ne porte rien dessous.
    const plain = montage(doc.wires, false)
    expect(boardLoad(plain, faceOf(plain), NOTHING).bottom.wires).toEqual([])
  })

  it('déplacée, elle emmène tout du même vecteur', () => {
    const before = loaded()
    const after: Project = {
      ...before,
      components: before.components.map((instance) =>
        instance.id === 'b' ? { ...instance, x: instance.x + 3, y: instance.y - 2 } : instance
      )
    }
    const carried = boardsCarry(before, after)
    expect([...(carried?.instances.keys() ?? [])]).toEqual(['c'])
    expect(carried?.instances.get('c')).toMatchObject({ x: 15, y: 9, rotation: 0, mirror: false })
    expect(carried?.wires.get('dessus')).toEqual([
      [15, 12],
      [18, 12]
    ])
    expect(carried?.wires.get('dessous')).toEqual([
      [29, 10],
      [29, 12],
      [27, 12],
      [27, 10]
    ])
    expect(carried?.wires.has('loin')).toBe(false)
    expect(carried?.wires.has('sortant')).toBe(false)
    expect(carried?.labels.get('t1')).toEqual({ x: 14, y: 13, w: 3, h: 1 })
    expect(carried?.ends).toEqual([{ from: [16, 15], to: [19, 13] }])
    // Rien à emmener quand aucune plaque n'a bougé.
    expect(boardsCarry(before, before)).toBeNull()
    const other: Project = {
      ...before,
      components: before.components.map((instance) =>
        instance.id === 'r' ? { ...instance, x: 1 } : instance
      )
    }
    expect(boardsCarry(before, other)).toBeNull()
  })

  /** Le montage après que la plaque a été changée et qu'elle a emmené sa charge. */
  function settled(
    before: Project,
    change: (plate: ComponentInstance) => ComponentInstance
  ): Project {
    const after: Project = {
      ...before,
      components: before.components.map((instance) =>
        instance.id === 'b' ? change(instance) : instance
      )
    }
    const carried = boardsCarry(before, after)
    if (!carried) throw new Error('rien d’emmené')
    const next: Project = {
      ...after,
      components: after.components.map(
        (instance) => carried.instances.get(instance.id) ?? instance
      ),
      labels: after.labels.map((entry) => ({ ...entry, ...(carried.labels.get(entry.id) ?? {}) }))
    }
    return {
      ...next,
      wires: wiresFollowingPins(
        before.wires,
        projectPins(before),
        projectPins(next),
        new Map(),
        carried.wires
      )
    }
  }

  it('tournée ou retournée, elle garde tout en place sur elle, et tout reste relié', () => {
    const before = loaded()
    const def = board()
    const changes: [string, (plate: ComponentInstance) => ComponentInstance][] = [
      ['quart de tour', (plate) => rotatedInstance(plate, def, 'cw')],
      ['quart de tour inverse', (plate) => rotatedInstance(plate, def, 'ccw')],
      ['miroir', (plate) => flippedInstance(plate, 'horizontal')],
      ['miroir vertical', (plate) => flippedInstance(plate, 'vertical')],
      [
        'demi-tour ailleurs',
        (plate) => ({
          ...rotatedInstance(rotatedInstance(plate, def, 'cw'), def, 'cw'),
          x: 3,
          y: 40
        })
      ]
    ]
    for (const [name, change] of changes) {
      const after = settled(before, change)
      // Les pattes de la LED sont toujours dans des trous de la plaque.
      const faces = boardFaces(after)
      const pins = projectPins(after, faces)
      const led = pins.filter((pin) => pin.instanceId === 'c')
      expect(led, name).toHaveLength(4)
      // Le fil du dessous relie toujours les deux pattes, par les pastilles où elles ressortent.
      const net = computeConnectivity(after.wires, pins, faces.twins)
      expect(net.pinNet.get('c:a'), name).toBe(net.wireNet.get('dessous'))
      expect(net.pinNet.get('c:k'), name).toBe(net.wireNet.get('dessous'))
      // Le fil du dessus et l'étiquette sont toujours sur la plaque.
      const top = faces.boards[0]?.top
      if (!top) throw new Error('plaque absente')
      const inside = (x: number, y: number): boolean =>
        x >= top.x && x <= top.x + top.width && y >= top.y && y <= top.y + top.height
      const upper = after.wires.find((entry) => entry.id === 'dessus')
      expect(
        upper?.points.every(([x, y]) => inside(x, y)),
        name
      ).toBe(true)
      const text = after.labels.find((entry) => entry.id === 't1')
      expect(text && inside(text.x, text.y) && inside(text.x + text.w, text.y + text.h), name).toBe(
        true
      )
      // Ce qui n'est pas sur la plaque n'a pas bougé.
      expect(
        after.wires.find((entry) => entry.id === 'loin'),
        name
      ).toBe(before.wires[3])
      expect(
        after.components.find((instance) => instance.id === 'r'),
        name
      ).toBe(before.components[2])
    }
  })

  it('mène un composant comme son dessin, pour toute isométrie de la grille', () => {
    const def = part()
    const sample = { x: 0.5, y: 1.75 }
    const turns: Matrix[] = [
      { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
      { a: -1, b: 0, c: 0, d: -1, e: 0, f: 0 },
      { a: 0, b: -1, c: 1, d: 0, e: 0, f: 0 }
    ]
    const mirror: Matrix = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const motions = turns.flatMap((turn) => [
      { ...turn, e: 7, f: -3 },
      { ...multiplyMatrices(turn, mirror), e: -4, f: 9 }
    ])
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      for (const mirrored of [false, true]) {
        const instance = { ...placed('c', 'led', 5, 8), rotation, mirror: mirrored }
        for (const motion of motions) {
          const moved = transformedInstance(instance, def, motion)
          const expected = applyMatrix(motion, applyMatrix(instanceMatrix(instance, def), sample))
          const actual = applyMatrix(instanceMatrix(moved, def), sample)
          expect(actual.x).toBeCloseTo(expected.x)
          expect(actual.y).toBeCloseTo(expected.y)
          // La réciproque ramène au point de départ.
          expect(transformedPoint(invertMatrix(motion), transformedPoint(motion, [3, 4]))).toEqual([
            3, 4
          ])
        }
      }
    }
  })

  it('étirée, elle laisse en place ce qu’elle porte dessus et emmène son dessous', () => {
    const doc = loaded()
    const stretchable = board()
    // Un motif d'une cellule, au milieu de la plaque : un trou de plus par motif.
    stretchable.stretch = { x: { from: 12, to: 16, initial: 1, min: 1, max: 6 } }
    doc.embeddedDefs = { ...doc.embeddedDefs, plaque: stretchable }
    doc.components = doc.components.map((instance) =>
      instance.id === 'b' ? { ...instance, countX: 1 } : instance
    )
    // Deux motifs de plus par la fin : le bord droit recule de deux cellules, le dessous de quatre.
    const change = restretch(doc, 'b', 3, 'start')
    if (!change) throw new Error('étirement refusé')
    const after: Project = {
      ...doc,
      components: doc.components.map((instance) =>
        instance.id === 'b' ? change.instance : instance
      )
    }
    const carried = boardsCarry(doc, after)
    expect([...(carried?.instances.keys() ?? [])]).toEqual([])
    expect(carried?.wires.has('dessus')).toBe(false)
    expect(carried?.wires.get('dessous')).toEqual([
      [30, 12],
      [30, 14],
      [28, 14],
      [28, 12]
    ])
    // Par le début, le bord droit ne bouge pas : rien à emmener.
    const fromStart = restretch(doc, 'b', 3, 'end')
    if (!fromStart) throw new Error('étirement refusé')
    expect(
      boardsCarry(doc, {
        ...doc,
        components: doc.components.map((instance) =>
          instance.id === 'b' ? fromStart.instance : instance
        )
      })
    ).toBeNull()
  })
})

describe('plaque à deux faces : l’écart entre les faces', () => {
  function plateOf(doc: Project): { plate: ComponentInstance; def: ComponentDefinition } {
    const plate = doc.components[0]
    const def = plate ? instanceDefinition(doc, plate) : undefined
    if (!plate || !def) throw new Error('plaque absente')
    return { plate, def }
  }

  it('écartée de son pli, la plaque s’en éloigne, et son dessous autant de l’autre côté', () => {
    const doc = montage()
    const { plate, def } = plateOf(doc)
    // Deux cellules vers la gauche, une vers le bas : l'écart passe de 2 à 6.
    const moved = spreadBoard(plate, def, -2, 1)
    if (!moved) throw new Error('plaque immobile')
    expect(moved).toMatchObject({ x: 8, y: 11, facesGap: 6 })
    expect(facesGap(plate)).toBe(2)
    expect(facesGap(moved)).toBe(6)
    // Le pli n'a pas bougé (x + x' = 38 comme avant) ; le dessous est allé de deux cellules à
    // droite, et d'une vers le bas.
    const face = boardFace(moved, def)
    expect(face).toMatchObject({
      top: { x: 8, y: 11, width: 8, height: 6 },
      bottom: { x: 22, y: 11, width: 8, height: 6 },
      flip: 38
    })
    expect(facesHinge({ x: 8, y: 11, width: 8, height: 6 }, 6).x).toBe(19)
    // Le montage tient compte de l'écart, et l'enregistre.
    const spread: Project = { ...doc, components: [moved, ...doc.components.slice(1)] }
    expect(projectBounds(spread)).toEqual({ x: 8, y: 10.5, width: 22, height: 7 })
    expect(parseProject(serializeProject(spread)).components[0]?.facesGap).toBe(6)
    const svg = buildProjectSvg(spread, DEFAULT_EXPORT)?.svg ?? ''
    expect(svg).toContain('class="underside" transform="matrix(-1 0 0 1 38 0)"')
    expect(svg).toContain('x1="19" y1="10.5"')
  })

  it('ne se rapproche pas du pli plus près que l’écart d’origine', () => {
    const doc = montage()
    const { plate, def } = plateOf(doc)
    // Vers le pli, à l'écart d'origine : rien ne bouge ; de haut en bas, elle glisse.
    expect(spreadBoard(plate, def, 1, 0)).toBeNull()
    const down = spreadBoard(plate, def, 3, 2)
    expect(down).toMatchObject({ x: 10, y: 12 })
    expect(down?.facesGap).toBeUndefined()
    // Écartée de 6, elle revient de deux cellules au plus, et retrouve l'écart d'origine.
    const wide: ComponentInstance = { ...plate, x: 8, facesGap: 6 }
    expect(spreadBoard(wide, def, 1, 0)).toMatchObject({ x: 9, facesGap: 4 })
    const back = spreadBoard(wide, def, 5, 0)
    expect(back).toMatchObject({ x: 10, y: 10 })
    expect(back?.facesGap).toBeUndefined()
    // Sans dessous montré, pas de pli.
    const plain = montage([], false).components[0]
    expect(plain ? spreadBoard(plain, def, -2, 0) : undefined).toBeNull()
  })

  it('poussée au-delà de son pli, elle passe de l’autre côté : son dessous prend sa place', () => {
    const doc = montage([
      wire('dessous', [
        [26, 12],
        [26, 14],
        [24, 14]
      ])
    ])
    const { plate, def } = plateOf(doc)
    // Le pli est en x = 19. Tant que le milieu de la plaque (x = 14) ne l'a pas franchi, elle
    // reste de son côté, au plus près.
    expect(spreadBoard(plate, def, 5, 0)).toBeNull()
    // Le milieu passé : le dessus est à droite du pli, au plus près, le dessous à gauche.
    const crossed = spreadBoard(plate, def, 6, 0)
    if (!crossed) throw new Error('plaque immobile')
    expect(crossed).toMatchObject({ x: 20, y: 10, facesGap: -2 })
    expect(facesGap(crossed)).toBe(-2)
    expect(boardFace(crossed, def)).toMatchObject({
      top: { x: 20, y: 10, width: 8, height: 6 },
      bottom: { x: 10, y: 10, width: 8, height: 6 },
      flip: 38
    })
    // Plus loin : elle s'écarte du pli de ce côté-là, son dessous autant de l'autre.
    const far = spreadBoard(plate, def, 12, 1)
    if (!far) throw new Error('plaque immobile')
    expect(far).toMatchObject({ x: 22, y: 11, facesGap: -6 })
    expect(boardFace(far, def)?.bottom).toMatchObject({ x: 8, y: 11 })
    // Le pli garde sa place ; sa flèche change de sens : du dessus, à droite, vers le dessous.
    const hinge = facesHinge({ x: 20, y: 10, width: 8, height: 6 }, -2)
    expect(hinge.x).toBe(19)
    expect(hinge.arc).toBe('M 19.6 13 Q 19 12.4 18.4 13')
    expect(hinge.head.startsWith('18.301,13.099')).toBe(true)
    // Ce que chaque face porte la suit : la LED avec le dessus, le fil avec le dessous.
    const turned: Project = {
      ...doc,
      components: doc.components.map((instance) => (instance.id === 'b' ? crossed : instance))
    }
    const carried = boardsCarry(doc, turned)
    expect(carried?.instances.get('c')).toMatchObject({ x: 22, y: 11 })
    expect(carried?.wires.get('dessous')).toEqual([
      [16, 12],
      [16, 14],
      [14, 14]
    ])
    // Le montage en tient compte, l'enregistre et l'exporte.
    expect(projectBounds({ ...turned, wires: [] })).toMatchObject({ x: 10, y: 9.5, height: 7 })
    expect(parseProject(serializeProject(turned)).components[0]?.facesGap).toBe(-2)
    const svg = buildProjectSvg(turned, DEFAULT_EXPORT)?.svg ?? ''
    expect(svg).toContain('class="underside" transform="matrix(-1 0 0 1 38 0)"')
    expect(svg).toContain(`d="${hinge.arc}"`)
    // Ramenée de l'autre côté, elle retrouve son écart d'origine, qui ne s'enregistre pas.
    const back = spreadBoard(crossed, def, -6, 0)
    expect(back).toMatchObject({ x: 10, y: 10 })
    expect(back?.facesGap).toBeUndefined()
    // De ce côté-là aussi, elle ne vient pas plus près du pli que l'écart d'origine.
    expect(spreadBoard(crossed, def, -1, 0)).toBeNull()
    expect(spreadBoard({ ...crossed, x: 22, facesGap: -6 }, def, -1, 0)).toMatchObject({
      x: 21,
      facesGap: -4
    })
    // Un écart trop petit, d'un côté comme de l'autre, est ramené à l'écart d'origine.
    expect(facesGap({ facesGap: -1 })).toBe(-2)
    expect(facesGap({ facesGap: 0 })).toBe(2)
  })

  it('ce que la plaque porte suit sa face : le dessus d’un côté, le dessous de l’autre', () => {
    const doc = montage([
      wire('dessous', [
        [26, 12],
        [26, 14],
        [24, 14]
      ])
    ])
    const { plate, def } = plateOf(doc)
    const moved = spreadBoard(plate, def, -2, 1)
    if (!moved) throw new Error('plaque immobile')
    const after: Project = {
      ...doc,
      components: doc.components.map((instance) => (instance.id === 'b' ? moved : instance))
    }
    const carried = boardsCarry(doc, after)
    // La LED, dessus, va avec le dessus ; le fil du dessous fait le geste en miroir.
    expect(carried?.instances.get('c')).toMatchObject({ x: 10, y: 12, rotation: 0, mirror: false })
    expect(carried?.wires.get('dessous')).toEqual([
      [28, 13],
      [28, 15],
      [26, 15]
    ])
  })
})

describe('empreinte d’un composant sur l’autre face de sa plaque', () => {
  /** La LED du montage, dessinée : son contour, et une empreinte plus étroite. */
  function withFootprint(doc: Project): Project {
    const led = part()
    led.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 0, y: 0, w: 8, h: 8, rx: 0, style: DEFAULT_SHAPE_STYLE },
        { kind: 'rect', x: 0, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE, footprint: true }
      ]
    }
    return { ...doc, embeddedDefs: { ...doc.embeddedDefs, led } }
  }

  const shownOn = (doc: Project): Map<string, { id: string; flip: number }> =>
    boardFootprints(doc, boardFaces(doc))

  it('se montre pour un composant enfiché dans une plaque à deux faces, pas ailleurs', () => {
    const doc = withFootprint(montage())
    expect([...shownOn(doc).keys()]).toEqual(['c'])
    expect(shownOn(doc).get('c')).toMatchObject({ id: 'b', flip: 38 })
    // Sans forme d'empreinte, sans dessous montré, ou hors de la plaque : rien.
    expect(shownOn(montage()).size).toBe(0)
    expect(shownOn(withFootprint(montage([], false))).size).toBe(0)
    const away: Project = {
      ...doc,
      components: doc.components.map((instance) =>
        instance.id === 'c' ? { ...instance, x: 40 } : instance
      )
    }
    expect(shownOn(away).size).toBe(0)
    // L'empreinte s'enregistre avec le composant.
    const reread = parseProject(serializeProject(doc))
    expect(reread.embeddedDefs['led']?.visual.primitives[1]).toMatchObject({ footprint: true })
  })

  it('s’exporte sur l’autre face, en une silhouette, et pas sur le composant', () => {
    const doc = withFootprint(montage())
    const svg = buildProjectSvg(doc, DEFAULT_EXPORT)
    expect(svg?.svg).toContain(
      '<g class="footprint" transform="matrix(-1 0 0 1 38 0)"><g transform="matrix(1 0 0 1 12 11)">'
    )
    // Une silhouette, dans l'allure des empreintes : son masque, ses tirets clairs.
    expect(svg?.svg).toContain('<mask id="empreinte-c" maskUnits="userSpaceOnUse"')
    expect(svg?.svg.match(/stroke-dasharray="0\.24 0\.18"/g)).toHaveLength(1)
    // Elle se dessine avec la plaque : sur son dessous, sous les pattes qui y ressortent.
    const text = svg?.svg ?? ''
    expect(text.indexOf('class="underside"')).toBeLessThan(text.indexOf('class="footprint"'))
    expect(text.indexOf('class="footprint"')).toBeLessThan(text.indexOf('class="through"'))
    expect(svg?.widthCells).toBe(18 + 2 * DEFAULT_EXPORT.marginCells)
    // Sans dessous montré, l'empreinte ne se dessine nulle part.
    const plain = buildProjectSvg(withFootprint(montage([], false)), DEFAULT_EXPORT)
    expect(plain?.svg).not.toContain('footprint')
    expect(plain?.svg).not.toContain('stroke-dasharray')
    // Un composant qui dépasse de la plaque : son empreinte dépasse d'autant de l'autre face, et
    // l'image lui garde sa place.
    const edge: Project = {
      ...doc,
      components: doc.components.map((instance) =>
        instance.id === 'c' ? { ...instance, x: 9 } : instance
      )
    }
    expect(shownOn(edge).has('c')).toBe(true)
    expect(buildProjectSvg(edge, DEFAULT_EXPORT)?.widthCells).toBe(
      20 + 2 * DEFAULT_EXPORT.marginCells
    )
  })
})
