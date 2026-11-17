import { describe, expect, it } from 'vitest'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, type ComponentDefinition } from './component'
import { projectPins } from './connectivity'
import { wiresFollowingPins } from './elastic'
import type { GridPoint, Rotation } from './grid'
import { instanceBounds } from './placement'
import { DEFAULT_PROFILE } from './profile'
import {
  createEmptyProject,
  instanceDefinition,
  type ComponentInstance,
  type Project,
  type Wire
} from './project'
import { parseProject, serializeProject } from './serialize'
import { instanceCount, pulledCount, restretch, stretchHandles } from './stretchPlacement'

/** Un connecteur d'un contact par cellule : 2 × 2 cellules, sa broche au milieu, motif d'une cellule. */
function header(): ComponentDefinition {
  const def = createEmptyComponent('dupont', 'Dupont')
  def.size = { widthCells: 2, heightCells: 2 }
  def.visual = {
    kind: 'drawing',
    primitives: [{ kind: 'rect', x: 2, y: 2, w: 4, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE }]
  }
  def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }]
  def.stretch = { from: 2, to: 6, initial: 1, min: 1, max: 8 }
  return def
}

function instance(patch: Partial<ComponentInstance> = {}): ComponentInstance {
  return {
    id: 'c1',
    defId: 'dupont',
    x: 10,
    y: 10,
    rotation: 0,
    mirror: false,
    label: '',
    fields: {},
    behindWires: true,
    count: 3,
    ...patch
  }
}

function wire(id: string, points: GridPoint[]): Wire {
  return {
    id,
    color: '#000000',
    points,
    stack: 0,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' }
  }
}

function project(placed: ComponentInstance, wires: Wire[] = []): Project {
  const doc = createEmptyProject('Essai', DEFAULT_PROFILE)
  doc.embeddedDefs = { dupont: header() }
  doc.components = [placed]
  doc.wires = wires
  return doc
}

/** Position des broches d'un exemplaire, dans l'ordre de leur numéro. */
function pinPoints(doc: Project, placed: ComponentInstance): GridPoint[] {
  return projectPins({ ...doc, components: [placed] }).map((pin) => pin.point)
}

describe('composant extensible posé', () => {
  it('se dessine à son nombre de motifs, et s’enregistre avec lui', () => {
    const doc = project(instance())
    const placed = doc.components[0] as ComponentInstance
    const def = instanceDefinition(doc, placed)
    expect(def?.size.widthCells).toBe(4)
    expect(instanceCount(doc, placed)).toBe(3)
    expect(pinPoints(doc, placed)).toEqual([
      [11, 11],
      [12, 11],
      [13, 11]
    ])
    // Sans nombre : celui de départ ; hors bornes : la borne.
    expect(instanceCount(doc, instance({ count: undefined }))).toBe(1)
    expect(instanceCount(doc, instance({ count: 50 }))).toBe(8)
    // Le fichier garde le nombre.
    const reread = parseProject(serializeProject(doc))
    expect(reread.components[0]?.count).toBe(3)
    expect(reread).toEqual(doc)
  })

  it('a une poignée à chaque bout, dans le sens où le composant s’allonge', () => {
    const at = (rotation: Rotation, mirror = false): unknown[] => {
      const doc = project(instance({ rotation, mirror }))
      const placed = doc.components[0] as ComponentInstance
      const def = instanceDefinition(doc, placed)
      if (!def) throw new Error('définition attendue')
      return stretchHandles(placed, def).map((handle) => [
        handle.end,
        handle.x,
        handle.y,
        handle.dx,
        handle.dy
      ])
    }
    // À l'endroit : le début à gauche, la fin à droite, au milieu de la hauteur.
    expect(at(0)).toEqual([
      ['start', 10, 11, -1, 0],
      ['end', 14, 11, 1, 0]
    ])
    // Tourné d'un quart de tour : le début en haut, la fin en bas.
    expect(at(90)).toEqual([
      ['start', 11, 10, 0, -1],
      ['end', 11, 14, 0, 1]
    ])
    // Demi-tour, ou miroir : le début est à droite.
    expect(at(180)).toEqual([
      ['start', 14, 11, 1, 0],
      ['end', 10, 11, -1, 0]
    ])
    expect(at(0, true)).toEqual([
      ['start', 14, 11, 1, 0],
      ['end', 10, 11, -1, 0]
    ])
    expect(at(270)).toEqual([
      ['start', 11, 14, 0, 1],
      ['end', 11, 10, 0, -1]
    ])
    // Un composant ordinaire n'a pas de poignée.
    const plain = createEmptyComponent('r', 'R')
    expect(stretchHandles(instance(), plain)).toEqual([])
  })

  it('compte un motif de plus à chaque largeur de motif tirée', () => {
    const def = header()
    expect(pulledCount(def, 3, 0.4)).toBe(3)
    expect(pulledCount(def, 3, 0.6)).toBe(4)
    expect(pulledCount(def, 3, 2.2)).toBe(5)
    expect(pulledCount(def, 3, -1.4)).toBe(2)
    // Jamais hors des bornes du composant.
    expect(pulledCount(def, 3, -10)).toBe(1)
    expect(pulledCount(def, 3, 40)).toBe(8)
  })

  it('s’étire par la fin : le début reste en place, les fils restent soudés', () => {
    // Un fil sur la deuxième broche, un autre sur la troisième.
    const doc = project(instance(), [
      wire('w2', [
        [12, 11],
        [12, 16]
      ]),
      wire('w3', [
        [13, 11],
        [13, 16]
      ])
    ])
    const longer = restretch(doc, 'c1', 5, 'start')
    if (!longer) throw new Error('étirement attendu')
    expect(longer.instance).toMatchObject({ x: 10, y: 10, count: 5 })
    expect(pinPoints(doc, longer.instance)).toHaveLength(5)
    // Les broches qui existaient n'ont pas bougé : les fils non plus.
    const kept = wiresFollowingPins(doc.wires, longer.pinsBefore, longer.pinsAfter)
    expect(kept.map((entry) => entry.points)).toEqual(doc.wires.map((entry) => entry.points))
    // En raccourcissant à deux, la troisième broche disparaît : son fil reste où il est.
    const shorter = restretch(doc, 'c1', 2, 'start')
    if (!shorter) throw new Error('étirement attendu')
    expect(shorter.pinsBefore.filter((pin) => pin.instanceId === 'c1')).toHaveLength(2)
    const after = wiresFollowingPins(doc.wires, shorter.pinsBefore, shorter.pinsAfter)
    expect(after.map((entry) => entry.points)).toEqual(doc.wires.map((entry) => entry.points))
  })

  it('s’étire par le début : la fin reste en place, les fils aussi', () => {
    const doc = project(instance(), [
      wire('w1', [
        [11, 11],
        [11, 16]
      ]),
      wire('w3', [
        [13, 11],
        [13, 16]
      ])
    ])
    const longer = restretch(doc, 'c1', 5, 'end')
    if (!longer) throw new Error('étirement attendu')
    // Deux motifs de plus du côté du début : le composant part deux cellules plus à gauche.
    expect(longer.instance).toMatchObject({ x: 8, y: 10, count: 5 })
    const def = instanceDefinition(doc, longer.instance)
    if (!def) throw new Error('définition attendue')
    expect(instanceBounds(longer.instance, def)).toEqual({ x: 8, y: 10, width: 6, height: 2 })
    // Les broches d'avant sont les trois dernières d'après, aux mêmes endroits.
    expect(pinPoints(doc, longer.instance).slice(2)).toEqual([
      [11, 11],
      [12, 11],
      [13, 11]
    ])
    const kept = wiresFollowingPins(doc.wires, longer.pinsBefore, longer.pinsAfter)
    expect(kept.map((entry) => entry.points)).toEqual(doc.wires.map((entry) => entry.points))
  })

  it('garde le bon bout en place quand le composant est tourné ou retourné', () => {
    const grown = (rotation: Rotation, mirror: boolean, fixed: 'start' | 'end'): number[] => {
      const doc = project(instance({ rotation, mirror }))
      const change = restretch(doc, 'c1', 5, fixed)
      if (!change) throw new Error('étirement attendu')
      const def = instanceDefinition(doc, change.instance)
      if (!def) throw new Error('définition attendue')
      const box = instanceBounds(change.instance, def)
      return [box.x, box.y, box.width, box.height]
    }
    // Au départ : la boîte va de (10, 10) à (14, 12), ou de (10, 10) à (12, 14) tournée.
    expect(grown(0, false, 'start')).toEqual([10, 10, 6, 2])
    expect(grown(0, false, 'end')).toEqual([8, 10, 6, 2])
    // Quart de tour : le début est en haut.
    expect(grown(90, false, 'start')).toEqual([10, 10, 2, 6])
    expect(grown(90, false, 'end')).toEqual([10, 8, 2, 6])
    // Demi-tour et miroir : le début est à droite, il y reste.
    expect(grown(180, false, 'start')).toEqual([8, 10, 6, 2])
    expect(grown(180, false, 'end')).toEqual([10, 10, 6, 2])
    expect(grown(0, true, 'start')).toEqual([8, 10, 6, 2])
    expect(grown(270, false, 'start')).toEqual([10, 8, 2, 6])
  })

  it('ne change rien quand le nombre est déjà atteint, hors bornes ou sans composant extensible', () => {
    const doc = project(instance())
    expect(restretch(doc, 'c1', 3, 'start')).toBeNull()
    expect(restretch(doc, 'absent', 5, 'start')).toBeNull()
    // Au maximum déjà : demander plus ne fait rien.
    const full = project(instance({ count: 8 }))
    expect(restretch(full, 'c1', 20, 'start')).toBeNull()
    const plain = project(instance())
    plain.embeddedDefs = { dupont: { ...header(), stretch: undefined } }
    expect(restretch(plain, 'c1', 5, 'start')).toBeNull()
  })
})
