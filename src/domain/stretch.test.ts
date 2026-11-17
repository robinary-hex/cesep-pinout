import { describe, expect, it } from 'vitest'
import {
  componentIssues,
  createEmptyComponent,
  DEFAULT_SHAPE_STYLE,
  imagesWithRightNeighbour,
  variantDefinition,
  type ComponentDefinition,
  type ImagePrimitive,
  type Primitive,
  type Stretch
} from './component'
import { pngHeaderDataUrl } from './testing/pngHeader'
import {
  defaultStretch,
  motifCells,
  normalizedStretch,
  STRETCH_MAX_COUNT,
  stretchCount,
  stretchedDefinition,
  stretchPinId,
  stretchPinMap,
  stretchPinSource
} from './stretch'

const style = DEFAULT_SHAPE_STYLE

/**
 * Un bornier dessiné, à un point : un contour arrondi sur toute la largeur (4 cellules), une vis
 * et un trait de séparation dans le motif (2 cellules, de 1 à 3), un autre trait pile sur la fin
 * du motif. Sa broche est au milieu du motif.
 */
function terminal(stretch: Partial<Stretch> = {}): ComponentDefinition {
  const def = createEmptyComponent('bornier', 'Bornier')
  def.size = { widthCells: 4, heightCells: 2 }
  def.visual = {
    kind: 'drawing',
    primitives: [
      { kind: 'rect', x: 0, y: 0, w: 16, h: 8, rx: 2, style },
      { kind: 'ellipse', cx: 8, cy: 4, rx: 2, ry: 2, style },
      { kind: 'line', x1: 4, y1: 0, x2: 4, y2: 8, arrows: noArrows, style },
      { kind: 'line', x1: 12, y1: 0, x2: 12, y2: 8, arrows: noArrows, style }
    ]
  }
  def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 2, y: 2 }]
  def.stretch = { from: 4, to: 12, initial: 2, min: 1, max: 6, ...stretch }
  return def
}

const noArrows = { start: false, middle: false, end: false }

function shapes(def: ComponentDefinition, kind: Primitive['kind']): Primitive[] {
  return def.visual.primitives.filter((primitive) => primitive.kind === kind)
}

describe('composant extensible : nombre de motifs', () => {
  it('reste entre le minimum et le maximum, et part du nombre de départ', () => {
    const def = terminal()
    expect(stretchCount(def, undefined)).toBe(2)
    expect(stretchCount(def, null)).toBe(2)
    expect(stretchCount(def, 4)).toBe(4)
    expect(stretchCount(def, 0)).toBe(1)
    expect(stretchCount(def, 99)).toBe(6)
    // Un composant ordinaire n'a qu'un motif, quoi qu'on demande.
    expect(stretchCount(createEmptyComponent('r', 'R'), 5)).toBe(1)
    // Aucune définition ne dépasse le plafond de l'application.
    expect(stretchCount(terminal({ max: 500 }), 500)).toBe(STRETCH_MAX_COUNT)
    expect(motifCells(def.stretch as Stretch)).toBe(2)
  })

  it('ramène des réglages à ce qui est permis', () => {
    // Un motif d'un nombre entier de cellules, dans la boîte ; il garde son début au quart.
    expect(normalizedStretch({ from: 2, to: 9, initial: 1, min: 1, max: 4 }, 4)).toEqual({
      from: 2,
      to: 10,
      initial: 1,
      min: 1,
      max: 4
    })
    // Trop large pour la boîte : toute la largeur ; trop à droite : il revient dedans.
    expect(normalizedStretch({ from: 0, to: 80, initial: 1, min: 1, max: 4 }, 3)).toMatchObject({
      from: 0,
      to: 12
    })
    expect(normalizedStretch({ from: 14, to: 18, initial: 1, min: 1, max: 4 }, 4)).toMatchObject({
      from: 12,
      to: 16
    })
    // Jamais moins d'une cellule ; le maximum ne passe pas sous le minimum, le départ est entre eux.
    expect(normalizedStretch({ from: 4, to: 4, initial: 9, min: 3, max: 2 }, 4)).toEqual({
      from: 4,
      to: 8,
      initial: 3,
      min: 3,
      max: 3
    })
    expect(defaultStretch(3)).toEqual({ from: 0, to: 12, initial: 1, min: 1, max: 12 })
  })
})

describe('composant extensible : le dessin étiré', () => {
  it('à un motif, c’est le composant lui-même ; le résultat est gardé', () => {
    const def = terminal()
    expect(stretchedDefinition(def, 1)).toBe(def)
    expect(stretchedDefinition(def, 3)).toBe(stretchedDefinition(def, 3))
    expect(stretchedDefinition(def, 3)).not.toBe(stretchedDefinition(def, 4))
    // Sans nombre demandé : celui de départ. Un composant ordinaire ne change pas.
    expect(stretchedDefinition(def)).toBe(stretchedDefinition(def, 2))
    const plain = createEmptyComponent('r', 'R')
    expect(stretchedDefinition(plain, 4)).toBe(plain)
  })

  it('allonge ce qui traverse le motif, recopie ce qui y tient, décale ce qui le suit', () => {
    const three = stretchedDefinition(terminal(), 3)
    // Deux motifs de plus, de deux cellules chacun.
    expect(three.size).toEqual({ widthCells: 8, heightCells: 2 })
    // Le contour traverse le motif : il s'allonge et garde le rayon de ses coins.
    expect(shapes(three, 'rect')).toEqual([{ kind: 'rect', x: 0, y: 0, w: 32, h: 8, rx: 2, style }])
    // La vis tient dans le motif : une par motif.
    expect(
      shapes(three, 'ellipse').map((shape) => (shape.kind === 'ellipse' ? shape.cx : 0))
    ).toEqual([8, 16, 24])
    // Un trait sur le début du motif est recopié à chaque motif ; celui qui est pile sur sa fin
    // appartient à la fin, qui suit : une séparation à chaque motif, jamais deux au même endroit.
    expect(shapes(three, 'line').map((shape) => (shape.kind === 'line' ? shape.x1 : 0))).toEqual([
      4, 12, 20, 28
    ])
    // Le composant reste le même : son identité, ses réglages.
    expect(three.id).toBe('bornier')
    expect(three.stretch).toEqual(terminal().stretch)
  })

  it('recopie les broches du motif et les numérote à la suite', () => {
    const def = terminal()
    def.pins = [
      { id: 'p1', name: '1', kind: 'io', x: 2, y: 2 },
      { id: 'gnd', name: 'GND', kind: 'power', x: 4, y: 1 },
      { id: 'key', name: '2', kind: 'in', x: 0, y: 1 }
    ]
    const three = stretchedDefinition(def, 3)
    // D'abord la broche d'avant le motif, puis une par motif, puis celle d'après, décalée.
    expect(three.pins.map((pin) => [pin.id, pin.name, pin.x, pin.y])).toEqual([
      ['key', '1', 0, 1],
      ['p1', '2', 2, 2],
      ['p1#1', '3', 4, 2],
      ['p1#2', '4', 6, 2],
      ['gnd', 'GND', 8, 1]
    ])
    expect(stretchPinId('p1', 0)).toBe('p1')
    expect(stretchPinId('p1', 2)).toBe('p1#2')
    expect(stretchPinSource('p1#2')).toEqual({ base: 'p1', copy: 2 })
    expect(stretchPinSource('p1')).toEqual({ base: 'p1', copy: 0 })
  })

  it('un seul morceau : le composant entier est le motif, et se répète', () => {
    // Un contact de connecteur : son boîtier est centré sur la broche, donc le motif commence
    // une demi-cellule avant elle.
    const def = createEmptyComponent('dupont', 'Dupont')
    def.size = { widthCells: 2, heightCells: 2 }
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'rect', x: 2, y: 2, w: 4, h: 4, rx: 0, style }]
    }
    def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }]
    def.stretch = { from: 2, to: 6, initial: 1, min: 1, max: 40 }
    const four = stretchedDefinition(def, 4)
    expect(four.size.widthCells).toBe(5)
    expect(
      shapes(four, 'rect').map((shape) => (shape.kind === 'rect' ? [shape.x, shape.w] : []))
    ).toEqual([
      [2, 4],
      [6, 4],
      [10, 4],
      [14, 4]
    ])
    expect(four.pins.map((pin) => [pin.name, pin.x])).toEqual([
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 4]
    ])
  })

  it('allonge une ellipse, une polyligne et un texte à cheval sur un trait', () => {
    const def = terminal()
    def.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'ellipse', cx: 8, cy: 4, rx: 8, ry: 2, style },
        {
          kind: 'polyline',
          points: [
            [0, 0],
            [8, 4],
            [16, 0]
          ],
          closed: false,
          radius: 0,
          arrows: noArrows,
          style
        },
        {
          kind: 'text',
          x: 2,
          y: 0,
          w: 12,
          h: 4,
          text: 'BORNIER',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: false,
          defaultValue: '',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false,
          vertical: false
        }
      ]
    }
    const [ellipse, polyline, text] = stretchedDefinition(def, 3).visual.primitives
    // L'ellipse occupe toute la largeur : elle s'élargit avec le composant.
    expect(ellipse).toMatchObject({ kind: 'ellipse', cx: 16, rx: 16 })
    // Les points d'avant restent, ceux d'après suivent ; celui du milieu du motif reste au milieu.
    expect(polyline).toMatchObject({
      points: [
        [0, 0],
        [16, 4],
        [32, 0]
      ]
    })
    // La boîte du texte s'élargit : centré, il le reste.
    expect(text).toMatchObject({ kind: 'text', x: 2, w: 28, anchor: 'middle' })
  })

  it('coupe une image aux traits : seule la tranche du milieu se répète', () => {
    const def = terminal()
    const image: ImagePrimitive = {
      kind: 'image',
      x: 0,
      y: 0,
      w: 16,
      h: 8,
      file: 'bornier.png',
      dataUrl: pngHeaderDataUrl(320, 160)
    }
    def.visual = { kind: 'drawing', primitives: [image] }
    const parts = stretchedDefinition(def, 3).visual.primitives.map((primitive) =>
      primitive.kind === 'image' ? [primitive.x, primitive.w, primitive.crop] : []
    )
    // Le début (un quart de l'image), trois fois le motif (sa moitié), puis la fin.
    expect(parts).toEqual([
      [0, 4, { x: 0, w: 0.25 }],
      [4, 8, { x: 0.25, w: 0.5 }],
      [12, 8, { x: 0.25, w: 0.5 }],
      [20, 8, { x: 0.25, w: 0.5 }],
      [28, 4, { x: 0.75, w: 0.25 }]
    ])
    // Les tranches se touchent : toutes sauf la dernière débordent d'un rien sur la suivante.
    expect([...imagesWithRightNeighbour(stretchedDefinition(def, 3).visual.primitives)]).toEqual([
      0, 1, 2, 3
    ])
    // Trois images fournies une à une : celle du milieu est dans le motif, et se répète entière.
    const pieces = terminal()
    pieces.visual = {
      kind: 'drawing',
      primitives: [
        { ...image, x: 0, w: 4, file: 'gauche.png' },
        { ...image, x: 4, w: 8, file: 'centre.png' },
        { ...image, x: 12, w: 4, file: 'droite.png' }
      ]
    }
    expect(
      stretchedDefinition(pieces, 2).visual.primitives.map((primitive) =>
        primitive.kind === 'image' ? [primitive.file, primitive.x, primitive.crop] : []
      )
    ).toEqual([
      ['gauche.png', 0, undefined],
      ['centre.png', 4, undefined],
      ['centre.png', 12, undefined],
      ['droite.png', 20, undefined]
    ])
    // Deux parties : un début, puis un motif qui va jusqu'au bord.
    const twoParts = terminal({ from: 4, to: 16, initial: 1, min: 1, max: 6 })
    twoParts.visual = { kind: 'drawing', primitives: [image] }
    expect(
      stretchedDefinition(twoParts, 2).visual.primitives.map((primitive) =>
        primitive.kind === 'image' ? [primitive.x, primitive.w, primitive.crop] : []
      )
    ).toEqual([
      [0, 4, { x: 0, w: 0.25 }],
      [4, 12, { x: 0.25, w: 0.75 }],
      [16, 12, { x: 0.25, w: 0.75 }]
    ])
  })

  it('prend le modèle particulier d’un nombre qui a le sien', () => {
    const def = terminal()
    def.stretch = {
      ...(def.stretch as Stretch),
      models: [
        {
          count: 1,
          size: { widthCells: 3, heightCells: 2 },
          visual: { kind: 'drawing', primitives: [] },
          pins: [{ id: 'seul', name: '1', kind: 'io', x: 1, y: 2 }]
        }
      ]
    }
    // À un motif : le dessin particulier, pas le composant de base.
    const one = stretchedDefinition(def, 1)
    expect(one.size.widthCells).toBe(3)
    expect(one.pins.map((pin) => pin.id)).toEqual(['seul'])
    expect(one.stretch).toBe(def.stretch)
    // Aux autres nombres : le motif répété.
    expect(stretchedDefinition(def, 3).size.widthCells).toBe(8)
  })

  it('chaque variante dit elle-même si elle est extensible', () => {
    const def = terminal()
    def.variantName = 'Extensible'
    def.variants = [
      {
        id: 'v1',
        name: 'Fixe',
        size: def.size,
        visual: def.visual,
        pins: def.pins
      }
    ]
    expect(variantDefinition(def, 'v1').stretch).toBeUndefined()
    expect(stretchedDefinition(variantDefinition(def, 'v1'), 4)).toBe(variantDefinition(def, 'v1'))
    expect(stretchedDefinition(variantDefinition(def, null), 4).size.widthCells).toBe(10)
  })
})

describe('composant extensible : les broches d’un nombre à l’autre', () => {
  it('début en place : les motifs s’ajoutent ou se retirent à la fin', () => {
    const def = terminal()
    def.pins = [
      { id: 'p1', name: '1', kind: 'io', x: 2, y: 2 },
      { id: 'fin', name: 'F', kind: 'io', x: 4, y: 1 }
    ]
    expect([...stretchPinMap(def, 2, 3, 'start')]).toEqual([
      ['p1', 'p1'],
      ['p1#1', 'p1#1'],
      ['fin', 'fin']
    ])
    // En raccourcissant, la broche du motif retiré n'a plus de correspondante.
    expect([...stretchPinMap(def, 3, 2, 'start')]).toEqual([
      ['p1', 'p1'],
      ['p1#1', 'p1#1'],
      ['fin', 'fin']
    ])
  })

  it('fin en place : les motifs se comptent depuis elle', () => {
    const def = terminal()
    // Un motif de plus du côté du début : l'ancien premier devient le deuxième.
    expect([...stretchPinMap(def, 2, 3, 'end')]).toEqual([
      ['p1', 'p1#1'],
      ['p1#1', 'p1#2']
    ])
    // Un de moins : le premier disparaît, le deuxième devient le premier.
    expect([...stretchPinMap(def, 3, 2, 'end')]).toEqual([
      ['p1#1', 'p1'],
      ['p1#2', 'p1#1']
    ])
  })

  it('avec un modèle particulier, les broches se suivent par leur rang', () => {
    const def = terminal()
    def.stretch = {
      ...(def.stretch as Stretch),
      models: [
        {
          count: 1,
          size: { widthCells: 3, heightCells: 2 },
          visual: { kind: 'drawing', primitives: [] },
          pins: [{ id: 'seul', name: '1', kind: 'io', x: 1, y: 2 }]
        }
      ]
    }
    expect([...stretchPinMap(def, 1, 2, 'start')]).toEqual([['seul', 'p1']])
    expect([...stretchPinMap(def, 1, 2, 'end')]).toEqual([['seul', 'p1#1']])
    expect([...stretchPinMap(def, 2, 1, 'end')]).toEqual([['p1#1', 'seul']])
  })
})

describe('composant extensible : contrôles', () => {
  it('refuse un motif qui n’est pas en cellules entières ou des bornes incohérentes', () => {
    const messages = (stretch: Partial<Stretch>): string[] =>
      componentIssues(terminal(stretch)).map((issue) => `${issue.level} : ${issue.message}`)
    expect(messages({})).toEqual([])
    expect(messages({ from: 4, to: 10 })).toContain(
      'error : Composant extensible : le motif doit faire un nombre entier de cellules'
    )
    expect(messages({ initial: 9 })).toContain(
      'error : Composant extensible : le nombre de départ doit être entre le minimum et le maximum'
    )
    expect(messages({ min: 4, max: 2, initial: 3 })).toContain(
      'error : Composant extensible : le nombre de départ doit être entre le minimum et le maximum'
    )
    // Un motif hors de la boîte se signale sans rendre le fichier illisible.
    expect(messages({ from: 12, to: 20 })).toContain(
      'warning : Le motif dépasse la boîte du composant'
    )
  })
})
