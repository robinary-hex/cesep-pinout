import { describe, expect, it } from 'vitest'
import {
  abuttingImages,
  componentFields,
  holeCounts,
  componentIssues,
  createEmptyComponent,
  DEFAULT_SHAPE_STYLE,
  ownFieldNames,
  variantDefinition,
  type ComponentDefinition,
  type HolesPrimitive,
  type ImagePrimitive,
  type Primitive,
  type Stretch,
  type StretchSpan,
  type TextPrimitive
} from './component'
import { pngHeaderDataUrl } from './testing/pngHeader'
import {
  defaultStretch,
  freeModelCount,
  modelDefinition,
  modelDrawing,
  motifCells,
  normalizedSpan,
  normalizedStretch,
  restretchedFields,
  singleAxis,
  STRETCH_MAX_COUNT,
  stretchAxes,
  stretchAxis,
  stretchCount,
  stretchCounts,
  stretchedDefinition,
  stretchExtent,
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
function terminal(span: Partial<StretchSpan> = {}): ComponentDefinition {
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
  def.stretch = { x: { from: 4, to: 12, initial: 2, min: 1, max: 6, ...span } }
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
    expect(motifCells(def.stretch?.x as StretchSpan)).toBe(2)
    // Un nombre seul vaut pour le premier sens ; on peut aussi en donner un par sens.
    expect(stretchCounts(def, 4)).toEqual({ x: 4, y: 1 })
    expect(stretchCounts(def, { x: 5, y: 3 })).toEqual({ x: 5, y: 1 })
    expect(stretchCounts(def)).toEqual({ x: 2, y: 1 })
  })

  it('ramène des réglages à ce qui est permis', () => {
    // Un motif d'un nombre entier de cellules, dans la boîte ; il garde son début au quart.
    expect(normalizedSpan({ from: 2, to: 9, initial: 1, min: 1, max: 4 }, 4)).toEqual({
      from: 2,
      to: 10,
      initial: 1,
      min: 1,
      max: 4
    })
    // Trop large pour la boîte : toute la largeur ; trop à droite : il revient dedans.
    expect(normalizedSpan({ from: 0, to: 80, initial: 1, min: 1, max: 4 }, 3)).toMatchObject({
      from: 0,
      to: 12
    })
    expect(normalizedSpan({ from: 14, to: 18, initial: 1, min: 1, max: 4 }, 4)).toMatchObject({
      from: 12,
      to: 16
    })
    // Jamais moins d'une cellule ; le maximum ne passe pas sous le minimum, le départ est entre eux.
    expect(normalizedSpan({ from: 4, to: 4, initial: 9, min: 3, max: 2 }, 4)).toEqual({
      from: 4,
      to: 8,
      initial: 3,
      min: 3,
      max: 3
    })
    expect(defaultStretch(3)).toEqual({ x: { from: 0, to: 12, initial: 1, min: 1, max: 12 } })
    // Chaque sens se ramène à l'étendue de la boîte dans ce sens-là ; les modèles restent.
    const loose: Stretch = {
      x: { from: 0, to: 80, initial: 1, min: 1, max: 4 },
      y: { from: 0, to: 80, initial: 1, min: 1, max: 4 },
      models: []
    }
    expect(normalizedStretch(loose, { widthCells: 3, heightCells: 2 })).toEqual({
      x: { from: 0, to: 12, initial: 1, min: 1, max: 4 },
      y: { from: 0, to: 8, initial: 1, min: 1, max: 4 },
      models: []
    })
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
    expect(stretchPinSource('p1#2')).toEqual({ base: 'p1', x: 2, y: 0 })
    expect(stretchPinSource('p1')).toEqual({ base: 'p1', x: 0, y: 0 })
    // Recopiée aussi en hauteur, une broche porte ses deux rangs.
    expect(stretchPinId('p1', 2, 1)).toBe('p1#2.1')
    expect(stretchPinId('p1', 0, 1)).toBe('p1#0.1')
    expect(stretchPinSource('p1#2.1')).toEqual({ base: 'p1', x: 2, y: 1 })
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
    def.stretch = { x: { from: 2, to: 6, initial: 1, min: 1, max: 40 } }
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
    expect([...abuttingImages(stretchedDefinition(def, 3).visual.primitives).right]).toEqual([
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
    const messages = (span: Partial<StretchSpan>): string[] =>
      componentIssues(terminal(span)).map((issue) => `${issue.level} : ${issue.message}`)
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

describe('composant extensible : modèles par nombre', () => {
  it('part du composant étiré à ce nombre, une image coupée revenant entière', () => {
    const def = terminal()
    def.pinGroups = [{ id: 'g1', name: 'Bornes' }]
    // À un motif : le dessin tel quel, ses broches dans leur ordre.
    const one = modelDrawing(def, 1)
    expect(one).toMatchObject({ count: 1, size: def.size, pinGroups: def.pinGroups })
    expect(one?.visual.primitives).toEqual(def.visual.primitives)
    expect(one?.pins).toBe(def.pins)
    // À trois : le contour s'allonge, la vis et la broche du motif sont recopiées.
    const three = modelDrawing(def, 3)
    expect(three?.size).toEqual({ widthCells: 8, heightCells: 2 })
    expect(
      three?.visual.primitives.filter((primitive) => primitive.kind === 'ellipse')
    ).toHaveLength(3)
    expect(three?.visual.primitives[0]).toMatchObject({ kind: 'rect', x: 0, w: 32 })
    expect(three?.pins.map((pin) => [pin.id, pin.x])).toEqual([
      ['p1', 2],
      ['p1#1', 4],
      ['p1#2', 6]
    ])
    // Une image à cheval sur les traits n'est pas coupée : elle reste entière, à sa place.
    const pictured = terminal()
    const image: ImagePrimitive = {
      kind: 'image',
      x: 0,
      y: 0,
      w: 16,
      h: 8,
      file: 'bornier.png',
      dataUrl: pngHeaderDataUrl(320, 160)
    }
    pictured.visual = { kind: 'drawing', primitives: [image] }
    expect(modelDrawing(pictured, 3)?.visual.primitives).toEqual([image])
    // Un composant ordinaire n'a pas de modèles.
    expect(modelDrawing(createEmptyComponent('r', 'R'), 2)).toBeNull()
  })

  it('propose le premier nombre permis qui n’a pas son modèle', () => {
    const stretch = terminal().stretch as Stretch
    const model = (count: number): NonNullable<Stretch['models']>[number] => ({
      count,
      size: { widthCells: 2, heightCells: 2 },
      visual: { kind: 'drawing', primitives: [] },
      pins: []
    })
    const span = stretch.x as StretchSpan
    expect(freeModelCount(stretch)).toBe(1)
    expect(freeModelCount({ ...stretch, models: [model(1), model(2)] })).toBe(3)
    expect(freeModelCount({ x: { ...span, min: 2, initial: 2 } })).toBe(2)
    expect(freeModelCount({ x: { ...span, max: 2 }, models: [model(1), model(2)] })).toBeNull()
    // Dans les deux sens, il n'y a pas de modèle par nombre.
    expect(freeModelCount({ ...stretch, y: span })).toBeNull()
  })

  it('montre le dessin d’un modèle seul, sans motif', () => {
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
    const shown = modelDefinition(def, 1)
    expect(shown.size.widthCells).toBe(3)
    expect(shown.pins.map((pin) => pin.id)).toEqual(['seul'])
    expect(shown.stretch).toBeUndefined()
    expect(shown.id).toBe(def.id)
    // Toujours le même objet ; sans modèle pour ce nombre, le composant lui-même.
    expect(modelDefinition(def, 1)).toBe(shown)
    expect(modelDefinition(def, 2)).toBe(def)
    expect(modelDefinition(def, null)).toBe(def)
  })

  it('signale un modèle dont le nombre est hors des bornes', () => {
    const def = terminal()
    def.stretch = {
      ...(def.stretch as Stretch),
      models: [
        {
          count: 9,
          size: { widthCells: 3, heightCells: 2 },
          visual: { kind: 'drawing', primitives: [] },
          pins: []
        }
      ]
    }
    expect(componentIssues(def)).toContainEqual({
      level: 'warning',
      message: 'Modèle à 9 : hors des nombres permis, il ne sert pas'
    })
  })
})

/**
 * Le même bornier debout : 2 cellules de large, 4 de haut, un contour sur toute la hauteur, une
 * vis et un trait de séparation dans le motif (de 1 à 3 cellules du haut), un autre trait pile
 * sur la fin du motif. Il s'étire en hauteur.
 */
function tower(span: Partial<StretchSpan> = {}): ComponentDefinition {
  const def = createEmptyComponent('bornier-debout', 'Bornier debout')
  def.size = { widthCells: 2, heightCells: 4 }
  def.visual = {
    kind: 'drawing',
    primitives: [
      { kind: 'rect', x: 0, y: 0, w: 8, h: 16, rx: 2, style },
      { kind: 'ellipse', cx: 4, cy: 8, rx: 2, ry: 2, style },
      { kind: 'line', x1: 0, y1: 4, x2: 8, y2: 4, arrows: noArrows, style },
      { kind: 'line', x1: 0, y1: 12, x2: 8, y2: 12, arrows: noArrows, style }
    ]
  }
  def.pins = [{ id: 'p1', name: '1', kind: 'io', x: 0, y: 2 }]
  def.stretch = { y: { from: 4, to: 12, initial: 2, min: 1, max: 6, ...span } }
  return def
}

describe('composant extensible : en hauteur', () => {
  it('lit ses traits le long de sa hauteur', () => {
    const def = tower()
    expect(stretchAxis(def.stretch)).toBe('y')
    expect(stretchAxes(def.stretch)).toEqual(['y'])
    expect(singleAxis(def.stretch)).toBe('y')
    expect(stretchExtent(def.size, 'y')).toBe(4)
    expect(stretchAxis(terminal().stretch)).toBe('x')
    expect(stretchExtent(terminal().size, 'x')).toBe(4)
    // Un composant ordinaire ne s'étire dans aucun sens.
    expect(stretchAxes(undefined)).toEqual([])
    expect(singleAxis(undefined)).toBeNull()
    expect(defaultStretch(3, 'y')).toEqual({
      y: { from: 0, to: 12, initial: 1, min: 1, max: 12 }
    })
    expect(defaultStretch(3)).toEqual({ x: { from: 0, to: 12, initial: 1, min: 1, max: 12 } })
  })

  it('répète le motif vers le bas : un haut, des motifs, un bas', () => {
    const three = stretchedDefinition(tower(), 3)
    // Deux motifs de plus, de deux cellules chacun : la largeur ne bouge pas.
    expect(three.size).toEqual({ widthCells: 2, heightCells: 8 })
    // Le contour s'allonge, la vis est recopiée à chaque motif.
    expect(three.visual.primitives[0]).toMatchObject({ kind: 'rect', x: 0, y: 0, w: 8, h: 32 })
    expect(shapes(three, 'ellipse')).toMatchObject([
      { cx: 4, cy: 8 },
      { cx: 4, cy: 16 },
      { cx: 4, cy: 24 }
    ])
    // Le trait du haut du motif se retrouve une fois par motif ; celui du bas suit la fin.
    expect(shapes(three, 'line').map((line) => (line.kind === 'line' ? line.y1 : null))).toEqual([
      4, 12, 20, 28
    ])
    // Les broches descendent avec les motifs, toujours sur la grille ; leur nom dit leur rang en
    // hauteur, après celui (zéro) qu'elles ont en largeur.
    expect(three.pins.map((pin) => [pin.id, pin.name, pin.x, pin.y])).toEqual([
      ['p1', '1', 0, 2],
      ['p1#0.1', '2', 0, 4],
      ['p1#0.2', '3', 0, 6]
    ])
    // À un seul motif : le composant lui-même.
    expect(stretchedDefinition(tower(), 1)).toMatchObject({
      size: { widthCells: 2, heightCells: 4 }
    })
  })

  it('coupe une image aux traits horizontaux : sa tranche du milieu se répète', () => {
    const def = tower()
    const image: ImagePrimitive = {
      kind: 'image',
      x: 0,
      y: 0,
      w: 8,
      h: 16,
      file: 'bornier.png',
      dataUrl: pngHeaderDataUrl(160, 320)
    }
    def.visual = { kind: 'drawing', primitives: [image] }
    const stretched = stretchedDefinition(def, 3)
    const parts = stretched.visual.primitives.map((primitive) =>
      primitive.kind === 'image' ? [primitive.y, primitive.h, primitive.crop] : []
    )
    // Le haut (un quart de l'image), trois fois le motif (sa moitié), puis le bas.
    expect(parts).toEqual([
      [0, 4, { x: 0, w: 1, y: 0, h: 0.25 }],
      [4, 8, { x: 0, w: 1, y: 0.25, h: 0.5 }],
      [12, 8, { x: 0, w: 1, y: 0.25, h: 0.5 }],
      [20, 8, { x: 0, w: 1, y: 0.25, h: 0.5 }],
      [28, 4, { x: 0, w: 1, y: 0.75, h: 0.25 }]
    ])
    // Elles sont l'une sous l'autre : chacune déborde d'un rien sur celle du dessous.
    expect([...abuttingImages(stretched.visual.primitives).below]).toEqual([0, 1, 2, 3])
    expect([...abuttingImages(stretched.visual.primitives).right]).toEqual([])
    // Le dessin de départ d'un modèle garde l'image entière, et le reste tel qu'il est.
    expect(modelDrawing(def, 1)?.visual.primitives).toEqual([image])
    expect(modelDrawing(tower(), 1)?.visual.primitives).toEqual(tower().visual.primitives)
  })

  it('suit les broches d’un nombre à l’autre, et signale un motif hors de la hauteur', () => {
    const def = tower()
    expect([...stretchPinMap(def, 2, 3, 'start')]).toEqual([
      ['p1', 'p1'],
      ['p1#0.1', 'p1#0.1']
    ])
    // La fin (le bas) reste en place : les motifs se comptent depuis elle.
    expect([...stretchPinMap(def, 2, 3, 'end')]).toEqual([
      ['p1', 'p1#0.1'],
      ['p1#0.1', 'p1#0.2']
    ])
    expect(componentIssues(tower()).map((issue) => issue.message)).toEqual([])
    // Le motif se lit le long de la hauteur (4 cellules), pas de la largeur (2).
    expect(componentIssues(tower({ from: 12, to: 20 })).map((issue) => issue.message)).toContain(
      'Le motif dépasse la boîte du composant'
    )
  })
})

/** Un texte variable « Nom », dans le motif du bornier. */
function text(patch: Partial<TextPrimitive>): TextPrimitive {
  return {
    kind: 'text',
    x: 5,
    y: 1,
    w: 6,
    h: 2,
    text: 'Nom',
    size: 0.5,
    anchor: 'middle',
    color: '#000000',
    variable: true,
    defaultValue: '',
    unit: '',
    bold: false,
    followsRotation: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false,
    ...patch
  }
}

/** Noms des champs que lisent les textes variables d'un dessin, dans l'ordre du dessin. */
function fieldNames(def: ComponentDefinition): string[] {
  return def.visual.primitives.flatMap((primitive) =>
    primitive.kind === 'text' && primitive.variable ? [primitive.text] : []
  )
}

describe('un champ par texte variable', () => {
  it('numérote les textes du même nom dans l’ordre de lecture', () => {
    // Deux « Pin » : celui du haut garde le nom, quel que soit son rang dans le dessin.
    const twins = [text({ text: 'Pin', y: 9 }), text({ text: 'Pin', y: 1 })]
    expect(
      ownFieldNames(twins).map((primitive) => (primitive.kind === 'text' ? primitive.text : ''))
    ).toEqual(['Pin 2', 'Pin'])
    // Sur une même ligne : de gauche à droite.
    const row = [text({ text: 'Pin', x: 9 }), text({ text: 'Pin', x: 1 }), text({ text: 'Pin' })]
    expect(
      ownFieldNames(row).map((primitive) => (primitive.kind === 'text' ? primitive.text : ''))
    ).toEqual(['Pin 3', 'Pin', 'Pin 2'])
    // Un nom déjà porté par un autre texte est sauté.
    const taken = [
      text({ text: 'Pin', y: 1 }),
      text({ text: 'Pin 2', y: 3 }),
      text({ text: 'Pin', y: 5 })
    ]
    expect(
      ownFieldNames(taken).map((primitive) => (primitive.kind === 'text' ? primitive.text : ''))
    ).toEqual(['Pin', 'Pin 2', 'Pin 3'])
    // Rien à renommer : le même tableau. Un texte fixe ne compte pas.
    const plain = [text({ text: 'Pin' }), text({ text: 'Pin', variable: false })]
    expect(ownFieldNames(plain)).toBe(plain)
  })

  it('vaut aussi pour un composant qui ne s’étire pas', () => {
    const def = createEmptyComponent('r', 'R')
    def.size = { widthCells: 4, heightCells: 2 }
    def.visual = { kind: 'drawing', primitives: [text({ x: 0 }), text({ x: 8 })] }
    // Dans l'éditeur le dessin garde ses noms ; posé, chaque texte a le sien.
    expect(fieldNames(def)).toEqual(['Nom', 'Nom'])
    const placed = stretchedDefinition(def)
    expect(fieldNames(placed)).toEqual(['Nom', 'Nom 2'])
    expect(componentFields(placed).map((field) => field.name)).toEqual(['Nom', 'Nom 2'])
    expect(stretchedDefinition(def)).toBe(placed)
    // Sans doublon, le composant posé est le composant lui-même.
    const single = createEmptyComponent('c', 'C')
    single.visual = { kind: 'drawing', primitives: [text({})] }
    expect(stretchedDefinition(single)).toBe(single)
  })
})

describe('composant extensible : une valeur par copie d’un texte variable', () => {
  /** Le bornier, avec un nom par borne dans le motif, un repère avant lui et un texte fixe. */
  function labelled(): ComponentDefinition {
    const def = terminal()
    def.visual = {
      kind: 'drawing',
      primitives: [
        text({}),
        text({ x: 0, w: 3, text: 'Réf' }),
        text({ y: 5, text: 'vis', variable: false })
      ]
    }
    return def
  }

  it('nomme le champ de chaque copie : la première garde son nom', () => {
    const three = stretchedDefinition(labelled(), 3)
    // Un champ par copie du texte du motif ; le repère, hors du motif, reste seul. Ils se lisent
    // de gauche à droite.
    expect(componentFields(three).map((field) => field.name)).toEqual([
      'Réf',
      'Nom',
      'Nom 2',
      'Nom 3'
    ])
    // Un texte fixe est recopié tel quel.
    expect(
      three.visual.primitives.flatMap((primitive) =>
        primitive.kind === 'text' && !primitive.variable ? [primitive.text] : []
      )
    ).toEqual(['vis', 'vis', 'vis'])
    // À un seul motif, rien ne change.
    expect(componentFields(stretchedDefinition(labelled(), 1)).map((field) => field.name)).toEqual([
      'Réf',
      'Nom'
    ])
  })

  it('les valeurs suivent leur motif quand le composant s’étire par le début', () => {
    const def = labelled()
    const fields = { Nom: 'A', 'Nom 2': 'B', Réf: 'J1' }
    // Le début reste en place : les motifs s'ajoutent à la fin, rien ne bouge.
    expect(restretchedFields(def, fields, 2, 3, 'start')).toBe(fields)
    // La fin reste en place : un motif de plus au début, chaque valeur recule d'un rang.
    expect(restretchedFields(def, fields, 2, 3, 'end')).toEqual({
      'Nom 2': 'A',
      'Nom 3': 'B',
      Réf: 'J1'
    })
    // Un motif de moins au début : sa valeur est perdue, les autres avancent.
    expect(restretchedFields(def, { Nom: 'A', 'Nom 2': 'B', 'Nom 3': 'C' }, 3, 2, 'end')).toEqual({
      Nom: 'B',
      'Nom 2': 'C'
    })
    // Sans valeur de motif, rien ne change.
    const plain = { Réf: 'J1' }
    expect(restretchedFields(def, plain, 2, 3, 'end')).toBe(plain)
    expect(restretchedFields(createEmptyComponent('r', 'R'), fields, 2, 3, 'end')).toBe(fields)
  })

  it('un texte hors du motif et un texte du motif, du même nom, ont chacun leur champ', () => {
    // Le bornier debout : un « Pin » au-dessus du motif, un autre dans le motif.
    const def = tower()
    def.visual = {
      kind: 'drawing',
      primitives: [text({ text: 'Pin', x: 0, y: 6, w: 8 }), text({ text: 'Pin', x: 0, y: 1, w: 8 })]
    }
    const two = stretchedDefinition(def, 2)
    // Trois textes, trois champs, de haut en bas : aucun champ ne règle deux textes.
    const drawn = two.visual.primitives.flatMap((primitive) =>
      primitive.kind === 'text' ? [[primitive.y, primitive.text]] : []
    )
    expect(drawn.sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
      [1, 'Pin'],
      [6, 'Pin 2'],
      [14, 'Pin 3']
    ])
    expect(componentFields(two).map((field) => field.name)).toEqual(['Pin', 'Pin 2', 'Pin 3'])
    // Un motif de plus à la fin : chaque valeur reste à son texte.
    const fields = { Pin: 'A', 'Pin 2': 'B', 'Pin 3': 'C' }
    expect(restretchedFields(def, fields, 2, 3, 'start')).toBe(fields)
    // Un motif de plus au début : le texte du haut garde sa valeur, celles des motifs suivent
    // leur motif, sous un nom qui a changé de rang.
    expect(restretchedFields(def, fields, 2, 3, 'end')).toEqual({
      Pin: 'A',
      'Pin 3': 'B',
      'Pin 4': 'C'
    })
    // Un motif de moins à la fin : sa valeur seule est perdue.
    expect(restretchedFields(def, { ...fields, 'Pin 4': 'D' }, 3, 2, 'start')).toEqual(fields)
  })
})

/**
 * Une plaque de trois cellules de côté, qui s'étire dans les deux sens : un contour sur tout le
 * dessin, un point et un nom au centre (le motif des deux sens, de 1 à 2 cellules), une broche
 * sur le motif, une autre dans le coin.
 */
function plate(): ComponentDefinition {
  const def = createEmptyComponent('plaque', 'Plaque')
  def.size = { widthCells: 3, heightCells: 3 }
  def.visual = {
    kind: 'drawing',
    primitives: [
      { kind: 'rect', x: 0, y: 0, w: 12, h: 12, rx: 1, style },
      { kind: 'dot', x: 6, y: 6, scale: 1, color: '#000000' },
      text({ x: 5, y: 5, w: 2, h: 2 })
    ]
  }
  def.pins = [
    { id: 'coin', name: 'A', kind: 'io', x: 0, y: 0 },
    { id: 'p1', name: '1', kind: 'io', x: 1, y: 1 }
  ]
  def.stretch = {
    x: { from: 4, to: 8, initial: 1, min: 1, max: 8 },
    y: { from: 4, to: 8, initial: 1, min: 1, max: 8 }
  }
  return def
}

describe('composant extensible : dans les deux sens à la fois', () => {
  it('a un nombre de motifs par sens', () => {
    const def = plate()
    expect(stretchAxes(def.stretch)).toEqual(['x', 'y'])
    expect(singleAxis(def.stretch)).toBeNull()
    expect(stretchCounts(def)).toEqual({ x: 1, y: 1 })
    expect(stretchCounts(def, { x: 3, y: 99 })).toEqual({ x: 3, y: 8 })
    // Un nombre seul vaut pour le premier sens, la largeur.
    expect(stretchCounts(def, 4)).toEqual({ x: 4, y: 1 })
    expect(stretchedDefinition(def, { x: 1, y: 1 })).toBe(def)
    expect(stretchedDefinition(def, { x: 3, y: 2 })).toBe(stretchedDefinition(def, { x: 3, y: 2 }))
    expect(stretchedDefinition(def, { x: 3, y: 2 })).not.toBe(
      stretchedDefinition(def, { x: 2, y: 3 })
    )
  })

  it('répète le centre dans les deux sens, les bords dans le leur', () => {
    const wide = stretchedDefinition(plate(), { x: 3, y: 2 })
    expect(wide.size).toEqual({ widthCells: 5, heightCells: 4 })
    // Le contour s'allonge dans les deux sens et garde ses coins.
    expect(shapes(wide, 'rect')).toEqual([{ kind: 'rect', x: 0, y: 0, w: 20, h: 16, rx: 1, style }])
    // Le point du centre : un par motif, trois colonnes sur deux rangées.
    expect(
      shapes(wide, 'dot')
        .map((dot) => (dot.kind === 'dot' ? [dot.x, dot.y] : []))
        .sort((a, b) => Number(a[1]) - Number(b[1]) || Number(a[0]) - Number(b[0]))
    ).toEqual([
      [6, 6],
      [10, 6],
      [14, 6],
      [6, 10],
      [10, 10],
      [14, 10]
    ])
    // Les broches : celle du coin reste seule, celle du motif est recopiée rangée par rangée.
    expect(wide.pins.map((pin) => [pin.id, pin.name, pin.x, pin.y])).toEqual([
      ['coin', 'A', 0, 0],
      ['p1', '2', 1, 1],
      ['p1#1', '3', 2, 1],
      ['p1#2', '4', 3, 1],
      ['p1#0.1', '5', 1, 2],
      ['p1#1.1', '6', 2, 2],
      ['p1#2.1', '7', 3, 2]
    ])
    // Chaque copie du nom a son champ, dans l'ordre de lecture.
    expect(componentFields(wide).map((field) => field.name)).toEqual([
      'Nom',
      'Nom 2',
      'Nom 3',
      'Nom 4',
      'Nom 5',
      'Nom 6'
    ])
  })

  it('coupe une image en neuf : ses coins restent, son centre se répète', () => {
    const def = plate()
    const image: ImagePrimitive = {
      kind: 'image',
      x: 0,
      y: 0,
      w: 12,
      h: 12,
      file: 'plaque.png',
      dataUrl: pngHeaderDataUrl(240, 240)
    }
    def.visual = { kind: 'drawing', primitives: [image] }
    const pieces = stretchedDefinition(def, { x: 2, y: 2 }).visual.primitives
    // Quatre tranches en largeur, chacune coupée en quatre en hauteur.
    expect(pieces).toHaveLength(16)
    const third = 1 / 3
    const at = (x: number, y: number): ImagePrimitive | undefined =>
      pieces.find(
        (piece): piece is ImagePrimitive => piece.kind === 'image' && piece.x === x && piece.y === y
      )
    expect(at(0, 0)?.crop).toEqual({ x: 0, w: third, y: 0, h: third })
    // Le centre, recopié : la même tranche de l'image, un motif plus loin dans chaque sens.
    expect(at(4, 4)).toMatchObject({ w: 4, h: 4 })
    expect(at(8, 8)?.crop).toEqual(at(4, 4)?.crop)
    expect(at(8, 8)?.crop?.x).toBeCloseTo(third)
    expect(at(8, 8)?.crop?.y).toBeCloseTo(third)
    // Le coin opposé a suivi dans les deux sens.
    expect(at(12, 12)?.crop?.x).toBeCloseTo(2 * third)
    expect(at(12, 12)?.crop?.y).toBeCloseTo(2 * third)
  })

  it('suit les broches et les valeurs dans le sens qu’on étire', () => {
    const def = plate()
    const before = { x: 2, y: 2 }
    // En hauteur, le bas en place : chaque rangée descend d'un rang, les colonnes ne bougent pas.
    expect([...stretchPinMap(def, before, { x: 2, y: 3 }, 'end', 'y')]).toEqual([
      ['coin', 'coin'],
      ['p1', 'p1#0.1'],
      ['p1#1', 'p1#1.1'],
      ['p1#0.1', 'p1#0.2'],
      ['p1#1.1', 'p1#1.2']
    ])
    // En largeur, la droite en place : chaque colonne recule d'un rang.
    expect([...stretchPinMap(def, before, { x: 3, y: 2 }, 'end', 'x')]).toEqual([
      ['coin', 'coin'],
      ['p1', 'p1#1'],
      ['p1#1', 'p1#2'],
      ['p1#0.1', 'p1#1.1'],
      ['p1#1.1', 'p1#2.1']
    ])
    // Le début en place : les broches gardent leur nom.
    expect([...stretchPinMap(def, before, { x: 3, y: 2 }, 'start', 'x')]).toEqual([
      ['coin', 'coin'],
      ['p1', 'p1'],
      ['p1#1', 'p1#1'],
      ['p1#0.1', 'p1#0.1'],
      ['p1#1.1', 'p1#1.1']
    ])
    // Les valeurs suivent leur texte : une colonne de plus à droite, et les noms de la seconde
    // rangée changent de rang ; une colonne de plus à gauche, tous changent.
    const fields = { Nom: 'A', 'Nom 2': 'B', 'Nom 3': 'C', 'Nom 4': 'D' }
    expect(restretchedFields(def, fields, before, { x: 3, y: 2 }, 'start', 'x')).toEqual({
      Nom: 'A',
      'Nom 2': 'B',
      'Nom 4': 'C',
      'Nom 5': 'D'
    })
    expect(restretchedFields(def, fields, before, { x: 3, y: 2 }, 'end', 'x')).toEqual({
      'Nom 2': 'A',
      'Nom 3': 'B',
      'Nom 5': 'C',
      'Nom 6': 'D'
    })
    // Une rangée de plus en bas : rien ne bouge.
    expect(restretchedFields(def, fields, before, { x: 2, y: 3 }, 'start', 'y')).toBe(fields)
  })

  it('laisse de côté les modèles par nombre, et le dit', () => {
    const def = plate()
    const model = {
      count: 1,
      size: { widthCells: 2, heightCells: 2 },
      visual: { kind: 'drawing' as const, primitives: [] },
      pins: []
    }
    def.stretch = { ...(def.stretch as Stretch), models: [model] }
    // Le dessin à un motif reste celui du composant, pas celui du modèle.
    expect(stretchedDefinition(def, { x: 1, y: 1 }).size).toEqual(def.size)
    expect(modelDrawing(def, 2)).toBeNull()
    expect(componentIssues(def)).toContainEqual({
      level: 'warning',
      message: 'Les modèles par nombre ne servent pas à un composant qui s’étire dans les deux sens'
    })
    // Chaque sens a ses contrôles.
    const off = plate()
    off.stretch = {
      ...(off.stretch as Stretch),
      y: { from: 4, to: 20, initial: 1, min: 1, max: 8 }
    }
    expect(componentIssues(off).map((issue) => issue.message)).toContain(
      'Le motif dépasse la boîte du composant'
    )
  })
})

describe('composant extensible : une plaque à trous', () => {
  it('une grille de trous à cheval sur les traits s’élargit : elle a plus de trous', () => {
    const def = terminal()
    // La grille couvre toute la largeur (0 à 4 cellules), le motif va de 1 à 3.
    const grid: HolesPrimitive = { kind: 'holes', x: 0, y: 0, w: 16, h: 8, color: '#d5dbe0' }
    def.visual = { kind: 'drawing', primitives: [grid] }
    expect(holeCounts(grid)).toEqual({ columns: 5, rows: 3 })
    const three = stretchedDefinition(def, 3).visual.primitives[0] as HolesPrimitive
    expect(three).toMatchObject({ kind: 'holes', x: 0, w: 32 })
    // Deux motifs de plus, de deux cellules chacun : quatre colonnes de plus.
    expect(holeCounts(three)).toEqual({ columns: 9, rows: 3 })
    // En hauteur, ce sont des rangées qui s'ajoutent.
    const tall = tower()
    tall.visual = { kind: 'drawing', primitives: [{ ...grid, w: 8, h: 16 }] }
    const taller = stretchedDefinition(tall, 2).visual.primitives[0] as HolesPrimitive
    expect(holeCounts(taller)).toEqual({ columns: 3, rows: 7 })
  })
})
