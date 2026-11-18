import { describe, expect, it } from 'vitest'
import { boardsCarry } from './boardCarry'
import { boardFaces } from './boardFaces'
import {
  projectConnectivity,
  stowedCount,
  stowUnderside,
  unstowUnderside,
  withoutStowed
} from './boardStow'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, type ComponentDefinition } from './component'
import { computeConnectivity, projectPins } from './connectivity'
import type { GridPoint } from './grid'
import { FileFormatError } from './migrations'
import { projectBounds, rotatedInstance } from './placement'
import { DEFAULT_PROFILE } from './profile'
import {
  createEmptyProject,
  instanceDefinition,
  type ComponentInstance,
  type Project,
  type TextLabel,
  type Wire
} from './project'
import { parseProject, serializeProject } from './serialize'
import { prunedStyles } from './styles'

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

function wire(id: string, points: GridPoint[]): Wire {
  return {
    id,
    color: '#d62828',
    points,
    stack: 0,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' }
  }
}

function label(id: string, x: number, y: number): TextLabel {
  return {
    id,
    x,
    y,
    w: 3,
    h: 1,
    anchor: 'start',
    text: 'GND',
    size: 11,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false,
    color: '#000000',
    background: false
  }
}

/**
 * La plaque en (10, 10), ses deux faces montrées : le dessus de x = 10 à 18, le dessous de 20 à
 * 28, et x + x' = 38 d'une face à l'autre. Dessus, deux LED : `c` dans les trous (12, 12) et
 * (14, 12), `e` dans (12, 14) et (14, 14). Dessous : un fil soudé de la patte de droite de
 * l'une à celle de l'autre, (24, 12) à (24, 14) ; une LED `d` posée sur le dessous ; une
 * étiquette. Un fil part d'un trou du dessous et s'en va hors de la plaque.
 */
function montage(): Project {
  const doc = createEmptyProject('Plaque', DEFAULT_PROFILE)
  doc.embeddedDefs = { plaque: board(), led: part() }
  doc.components = [
    { ...placed('b', 'plaque', 10, 10), underside: true },
    placed('c', 'led', 12, 11),
    placed('e', 'led', 12, 13),
    placed('d', 'led', 21, 10)
  ]
  doc.wires = [
    wire('w1', [
      [24, 12],
      [24, 14]
    ]),
    wire('w2', [
      [26, 15],
      [26, 20]
    ])
  ]
  doc.labels = [label('t1', 21, 14)]
  return doc
}

const ids = (doc: Pick<Project, 'components' | 'wires' | 'labels'>): string[][] => [
  doc.components.map((entry) => entry.id).sort(),
  doc.wires.map((entry) => entry.id).sort(),
  doc.labels.map((entry) => entry.id).sort()
]

const byId = <T extends { id: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => a.id.localeCompare(b.id))

describe('dessous masqué d’une plaque : ce qu’il porte se range avec lui', () => {
  it('masqué, le dessous emporte ses composants, ses fils et ses étiquettes', () => {
    const doc = montage()
    const hidden = stowUnderside(doc, 'b')
    if (!hidden) throw new Error('plaque attendue')
    // Restent la plaque, ce qu'elle porte dessus, et le fil qui s'en va hors d'elle.
    expect(ids(hidden)).toEqual([['b', 'c', 'e'], ['w2'], []])
    const plate = hidden.components[0]
    expect(plate?.underside).toBeUndefined()
    expect(stowedCount(plate ?? {})).toBe(3)
    // Rangés dans le repère de la plaque : le fil est noté là où ses trous sont sur son dessin.
    expect(plate?.stowed?.wires[0]?.points).toEqual([
      [4, 2],
      [4, 4]
    ])
    expect(plate?.stowed?.labels[0]).toMatchObject({ id: 't1', x: 4, y: 4, w: 3, h: 1 })
    // Plus rien du dessous ne compte dans la boîte du montage.
    expect(projectBounds({ ...doc, ...hidden })).toEqual({ x: 10, y: 10, width: 16, height: 10 })
    // Une plaque qui ne montre pas son dessous, ou un composant ordinaire : rien à masquer.
    expect(stowUnderside({ ...doc, ...hidden }, 'b')).toBeNull()
    expect(stowUnderside(doc, 'c')).toBeNull()
  })

  it('remontré, il rend tout à sa place', () => {
    const doc = montage()
    const hidden = { ...doc, ...stowUnderside(doc, 'b') }
    const shown = unstowUnderside(hidden, 'b')
    if (!shown) throw new Error('plaque attendue')
    expect(byId(shown.components)).toEqual(byId(doc.components))
    expect(byId(shown.wires)).toEqual(byId(doc.wires))
    expect(shown.labels).toEqual(doc.labels)
    // Une plaque dont le dessous est déjà montré : rien à remontrer.
    expect(unstowUnderside({ ...hidden, ...shown }, 'b')).toBeNull()
    // Un dessous sans rien dessus se masque et se remontre sans rien ranger.
    const bare = { ...doc, components: doc.components.slice(0, 1), wires: [], labels: [] }
    const emptied = stowUnderside(bare, 'b')
    expect(emptied?.components[0]).not.toHaveProperty('stowed')
    expect(unstowUnderside({ ...bare, ...emptied }, 'b')?.components[0]?.underside).toBe(true)
  })

  it('la plaque bouge pendant que son dessous est masqué : il revient sous elle', () => {
    const doc = montage()
    const plate = doc.components[0]
    const def = plate ? instanceDefinition(doc, plate) : undefined
    if (!plate || !def) throw new Error('plaque absente')
    // La plaque tournée d'un quart de tour, puis poussée plus loin.
    const turned = rotatedInstance(plate, def, 'cw')
    const moved = { ...turned, x: turned.x + 5, y: turned.y + 3 }
    const replace = (project: Project, next: ComponentInstance): Project => ({
      ...project,
      components: project.components.map((entry) =>
        entry.id === 'b' ? { ...entry, ...next } : entry
      )
    })
    // Dessous montré, la plaque emmène ce qu'il porte.
    const after = replace(doc, moved)
    const carried = boardsCarry(doc, after)
    if (!carried) throw new Error('plaque immobile')
    // Dessous masqué pendant le voyage, puis remontré : tout est au même endroit.
    const hidden = { ...doc, ...stowUnderside(doc, 'b') }
    const plateHidden = hidden.components[0]
    if (!plateHidden) throw new Error('plaque absente')
    const place = { x: moved.x, y: moved.y, rotation: moved.rotation, mirror: moved.mirror }
    const shown = unstowUnderside(replace(hidden, { ...plateHidden, ...place }), 'b')
    if (!shown) throw new Error('plaque attendue')
    expect(shown.wires.find((entry) => entry.id === 'w1')?.points).toEqual(carried.wires.get('w1'))
    expect(shown.components.find((entry) => entry.id === 'd')).toEqual(carried.instances.get('d'))
    expect(shown.labels.find((entry) => entry.id === 't1')).toMatchObject(
      carried.labels.get('t1') ?? {}
    )
  })

  it('un identifiant pris pendant ce temps : l’élément rangé en reçoit un libre', () => {
    const doc = montage()
    const hidden = { ...doc, ...stowUnderside(doc, 'b') }
    const busy = {
      ...hidden,
      wires: [
        ...hidden.wires,
        wire('w1', [
          [0, 0],
          [4, 0]
        ])
      ],
      components: [...hidden.components, placed('d', 'led', 0, 2)]
    }
    const shown = unstowUnderside(busy, 'b')
    expect(shown?.wires.map((entry) => entry.id)).toEqual(['w2', 'w1', 'w3'])
    expect(shown?.components.map((entry) => entry.id)).toEqual(['b', 'c', 'e', 'd', 'c1'])
  })

  it('une copie de la plaque ne copie pas ce qu’elle a rangé', () => {
    const doc = montage()
    const plate = stowUnderside(doc, 'b')?.components[0]
    if (!plate) throw new Error('plaque absente')
    expect(stowedCount(plate)).toBe(3)
    expect(withoutStowed(plate)).not.toHaveProperty('stowed')
    expect(withoutStowed(plate)).toMatchObject({ id: 'b', x: 10, y: 10 })
    const plain = placed('x', 'led', 0, 0)
    expect(withoutStowed(plain)).toBe(plain)
  })
})

describe('dessous masqué d’une plaque : ce qu’il relie reste relié', () => {
  it('les broches soudées dessous restent reliées, et rien de masqué ne ressort', () => {
    const doc = montage()
    const pinNet = (project: Project, key: string): number | undefined =>
      projectConnectivity(project).pinNet.get(key)
    // Dessous montré : le fil relie la patte de droite des deux LED.
    expect(pinNet(doc, 'c:k')).toBe(pinNet(doc, 'e:k'))
    expect(pinNet(doc, 'c:a')).not.toBe(pinNet(doc, 'e:a'))
    const hidden = { ...doc, ...stowUnderside(doc, 'b') }
    // Dessous masqué : il les relie toujours.
    const wired = projectConnectivity(hidden)
    expect(wired.pinNet.get('c:k')).toBe(wired.pinNet.get('e:k'))
    expect(wired.unconnectedPinKeys.has('c:k')).toBe(false)
    expect(wired.unconnectedPinKeys.has('c:a')).toBe(true)
    // À ne regarder que ce qu'on voit, elles sembleraient reliées à rien.
    const faces = boardFaces(hidden)
    const seen = computeConnectivity(hidden.wires, projectPins(hidden, faces), faces.twins)
    expect(seen.unconnectedPinKeys.has('c:k')).toBe(true)
    // Rien de ce qui est rangé ne ressort : ni fil, ni broche, ni bout libre.
    expect([...wired.wireNet.keys()]).toEqual(['w2'])
    expect([...wired.pinNet.keys()].sort()).toEqual(['c:a', 'c:k', 'e:a', 'e:k'])
    expect(wired.freeEnds.map((end) => end.wireId)).toEqual(['w2', 'w2'])
    expect(wired.junctions).toEqual([])
    expect(wired.joints).toEqual([])
  })

  it('sans rien de rangé, c’est la connectivité de toujours', () => {
    const doc = montage()
    const faces = boardFaces(doc)
    const pins = projectPins(doc, faces)
    expect(projectConnectivity(doc, pins, faces)).toEqual(
      computeConnectivity(doc.wires, pins, faces.twins)
    )
  })
})

describe('dessous masqué d’une plaque : dans le fichier', () => {
  it('s’enregistre avec le montage et se relit', () => {
    const doc = montage()
    const hidden: Project = { ...doc, ...stowUnderside(doc, 'b') }
    const reread = parseProject(serializeProject(hidden))
    expect(reread).toEqual(hidden)
    expect(stowedCount(reread.components[0] ?? {})).toBe(3)
    // Ce qui est rangé reviendra : il lui faut sa définition.
    const orphan = JSON.parse(serializeProject(hidden)) as { embeddedDefs: Record<string, unknown> }
    delete orphan.embeddedDefs['led']
    const lone = { ...orphan, components: [hidden.components[0]] }
    let issues = ''
    try {
      parseProject(JSON.stringify(lone))
    } catch (error) {
      issues = error instanceof FileFormatError ? error.issues.join(' ; ') : String(error)
    }
    expect(issues).toMatch(/Composant rangé d : définition led absente/)
  })

  it('le style propre d’un élément rangé reste dans le montage', () => {
    const doc = montage()
    const thick = { ...DEFAULT_PROFILE, name: 'Épais', wireWidth: 0.3 }
    const styled: Project = {
      ...doc,
      styles: [thick],
      wires: doc.wires.map((entry) => (entry.id === 'w1' ? { ...entry, style: 'Épais' } : entry))
    }
    const hidden: Project = { ...styled, ...stowUnderside(styled, 'b') }
    expect(hidden.wires.some((entry) => entry.style === 'Épais')).toBe(false)
    expect(prunedStyles(hidden)).toBe(hidden.styles)
    // Sans élément rangé pour le porter, il partirait.
    const emptied = {
      ...hidden,
      components: hidden.components.map((entry) => withoutStowed(entry))
    }
    expect(prunedStyles(emptied)).toEqual([])
  })
})
