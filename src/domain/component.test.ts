import { describe, expect, it } from 'vitest'
import {
  componentFields,
  componentIssues,
  createEmptyComponent,
  DEFAULT_SHAPE_STYLE,
  dotRadiusCells,
  imageRatio,
  importedImageSize,
  naturalImageSize,
  reorderItem,
  NO_ARROWS,
  primitiveBounds,
  textContent,
  textEmphasisAttrs,
  translatePrimitive,
  turnedTextBox,
  withFreeImageFiles,
  type ImagePrimitive,
  type Primitive
} from './component'
import { nearestInsidePoint } from './grid'
import { pngHeaderDataUrl } from './testing/pngHeader'

const style = DEFAULT_SHAPE_STYLE

describe('formes du mini-éditeur', () => {
  it('calcule la boîte englobante de chaque forme', () => {
    expect(primitiveBounds({ kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style })).toEqual({
      x1: 4,
      y1: 2,
      x2: 12,
      y2: 6
    })
    expect(primitiveBounds({ kind: 'ellipse', cx: 8, cy: 4, rx: 3, ry: 2, style })).toEqual({
      x1: 5,
      y1: 2,
      x2: 11,
      y2: 6
    })
    expect(
      primitiveBounds({ kind: 'line', x1: 10, y1: 1, x2: 2, y2: 5, arrows: NO_ARROWS, style })
    ).toEqual({
      x1: 2,
      y1: 1,
      x2: 10,
      y2: 5
    })
    expect(
      primitiveBounds({
        kind: 'polyline',
        points: [
          [0, 0],
          [4, 6],
          [2, 3]
        ],
        closed: false,
        radius: 0,
        arrows: NO_ARROWS,
        style
      })
    ).toEqual({ x1: 0, y1: 0, x2: 4, y2: 6 })
  })

  it('déplace une forme sans en changer la nature', () => {
    const line: Primitive = { kind: 'line', x1: 0, y1: 0, x2: 4, y2: 0, arrows: NO_ARROWS, style }
    expect(translatePrimitive(line, 2, 3)).toEqual({ ...line, x1: 2, y1: 3, x2: 6, y2: 3 })
    const poly: Primitive = {
      kind: 'polyline',
      points: [
        [0, 0],
        [1, 1]
      ],
      closed: true,
      radius: 0,
      arrows: NO_ARROWS,
      style
    }
    expect(
      translatePrimitive(poly, -1, 0).kind === 'polyline' && translatePrimitive(poly, -1, 0)
    ).toMatchObject({
      points: [
        [-1, 0],
        [0, 1]
      ]
    })
  })

  it('crée un composant vierge valide ; l’avertissement « aucune broche » attend la première forme', () => {
    const def = createEmptyComponent('nouveau', 'Nouveau')
    expect(def.size).toEqual({ widthCells: 4, heightCells: 2 })
    expect(componentIssues(def)).toEqual([])
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'rect',
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          rx: 0,
          style: { stroke: '#000000', fill: 'none', weight: 1, fillOpacity: 1 }
        }
      ]
    }
    expect(componentIssues(def).map((issue) => issue.level)).toEqual(['warning'])
  })

  it('signale une forme qui dépasse la boîte', () => {
    const def = createEmptyComponent('x', 'X')
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'rect', x: 0, y: 0, w: 20, h: 2, rx: 0, style }]
    }
    expect(componentIssues(def).some((issue) => /dépasse/.test(issue.message))).toBe(true)
  })
})

describe('accrochage des broches aux intersections du composant', () => {
  const size = { widthCells: 4, heightCells: 2 }

  it('choisit l’intersection la plus proche, bord compris', () => {
    expect(nearestInsidePoint({ x: 0.2, y: 1.1 }, size).point).toEqual({ x: 0, y: 1 })
    expect(nearestInsidePoint({ x: 3.9, y: 0.9 }, size).point).toEqual({ x: 4, y: 1 })
    expect(nearestInsidePoint({ x: 2.1, y: -0.3 }, size).point).toEqual({ x: 2, y: 0 })
    expect(nearestInsidePoint({ x: 2.4, y: 1.8 }, size).point).toEqual({ x: 2, y: 2 })
    // Au milieu du composant aussi : une broche peut être intérieure.
    expect(nearestInsidePoint({ x: 2.2, y: 0.9 }, size).point).toEqual({ x: 2, y: 1 })
  })

  it('donne une distance utile pour refuser un clic trop loin', () => {
    expect(nearestInsidePoint({ x: 2, y: 1.4 }, size).distance).toBeCloseTo(0.4)
    expect(nearestInsidePoint({ x: 8, y: 1 }, size).distance).toBeCloseTo(4)
  })
})

describe('textes variables', () => {
  it('affiche la valeur, sinon la valeur par défaut, et colle l’unité à droite', () => {
    const base = {
      kind: 'text' as const,
      w: 8,
      h: 2,
      x: 0,
      y: 0,
      size: 0.5,
      anchor: 'middle' as const,
      color: '#000000',
      text: 'R',
      variable: true,
      defaultValue: '10',
      unit: 'kΩ',
      bold: false,
      followsRotation: false,
      italic: false,
      underline: false,
      strike: false,
      vertical: false
    }
    const nbsp = String.fromCharCode(0xa0)
    expect(textContent(base, { R: '4,7' })).toBe(`4,7${nbsp}kΩ`)
    expect(textContent(base, {})).toBe(`10${nbsp}kΩ`)
    expect(
      textContent({
        ...base,
        defaultValue: '',
        unit: '',
        bold: false,
        followsRotation: false,
        italic: false,
        underline: false,
        strike: false,
        vertical: false
      })
    ).toBe('{R}')
    expect(textContent({ ...base, variable: false })).toBe('R')
    expect(
      componentFields({
        ...createEmptyComponent('x', 'X'),
        visual: { kind: 'drawing', primitives: [base] }
      })
    ).toEqual([{ name: 'R', defaultValue: '10', unit: 'kΩ' }])
  })
})

describe('ordre des formes', () => {
  it('avance, recule, met au premier ou à l’arrière-plan, et donne le nouvel index', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(reorderItem(list, 1, 'up')).toEqual({ list: ['a', 'c', 'b', 'd'], index: 2 })
    expect(reorderItem(list, 1, 'down')).toEqual({ list: ['b', 'a', 'c', 'd'], index: 0 })
    expect(reorderItem(list, 1, 'top')).toEqual({ list: ['a', 'c', 'd', 'b'], index: 3 })
    expect(reorderItem(list, 2, 'bottom')).toEqual({ list: ['c', 'a', 'b', 'd'], index: 0 })
    // Déjà au bout : rien ne bouge.
    expect(reorderItem(list, 3, 'up')).toEqual({ list, index: 3 })
    expect(reorderItem(list, 0, 'down')).toEqual({ list, index: 0 })
  })
})

describe('texte mis à la verticale', () => {
  it('tourne une boîte couchée autour de son centre, sans dérive d’un aller-retour', () => {
    const wide = { x: 0, y: 0, w: 4, h: 1 }
    const tall = turnedTextBox(wide, true)
    expect(tall).toEqual({ x: 1, y: -1, w: 1, h: 4 })
    expect(turnedTextBox(tall, false)).toEqual(wide)
  })

  it('laisse une boîte déjà dans le bon sens, ou carrée', () => {
    expect(turnedTextBox({ x: 2, y: 3, w: 1, h: 4 }, true)).toEqual({ x: 2, y: 3, w: 1, h: 4 })
    expect(turnedTextBox({ x: 2, y: 3, w: 4, h: 1 }, false)).toEqual({ x: 2, y: 3, w: 4, h: 1 })
    expect(turnedTextBox({ x: 2, y: 3, w: 2, h: 2 }, true)).toEqual({ x: 2, y: 3, w: 2, h: 2 })
  })

  it('donne graisse, italique et décorations sans la famille de police', () => {
    expect(textEmphasisAttrs({ bold: true, italic: true, underline: true, strike: true })).toEqual({
      'font-weight': 'bold',
      'font-style': 'italic',
      'text-decoration': 'underline line-through'
    })
    expect(
      textEmphasisAttrs({ bold: false, italic: false, underline: false, strike: false })
    ).toEqual({
      'font-weight': undefined,
      'font-style': undefined,
      'text-decoration': undefined
    })
  })
})

describe('point', () => {
  const dot = { kind: 'dot', x: 8, y: 4, scale: 2, color: '#000000' } as const

  it('a pour diamètre deux traits de composant, fois sa taille', () => {
    expect(dotRadiusCells(1, 0.1)).toBeCloseTo(0.1)
    expect(dotRadiusCells(2.5, 0.2)).toBeCloseTo(0.5)
  })

  it('se déplace par son centre et a une petite boîte de sélection', () => {
    expect(translatePrimitive(dot, 2, -1)).toMatchObject({ x: 10, y: 3 })
    const bounds = primitiveBounds(dot)
    expect(bounds.x1).toBeCloseTo(7.2)
    expect(bounds.y2).toBeCloseTo(4.8)
  })

  it('posé sur le bord du composant, ne compte pas comme une forme qui dépasse', () => {
    const def = createEmptyComponent('x', 'X')
    def.visual = { kind: 'drawing', primitives: [{ ...dot, x: 0, y: 4 }] }
    expect(componentIssues(def).some((issue) => /dépasse/.test(issue.message))).toBe(false)
    def.visual = { kind: 'drawing', primitives: [{ ...dot, x: -4, y: 4 }] }
    expect(componentIssues(def).some((issue) => /dépasse/.test(issue.message))).toBe(true)
  })
})

describe('images du mini-éditeur', () => {
  /** LED de 160 × 240 px : 2 × 3 cellules à 80 px par cellule. */
  const lost: ImagePrimitive = { kind: 'image', x: 4, y: 0, w: 8, h: 12, file: 'image.png' }
  const led: ImagePrimitive = { ...lost, dataUrl: pngHeaderDataUrl(160, 240) }

  it('a une boîte et se déplace comme une autre forme', () => {
    expect(primitiveBounds(led)).toEqual({ x1: 4, y1: 0, x2: 12, y2: 12 })
    expect(translatePrimitive(led, -4, 4)).toMatchObject({ x: 0, y: 4, w: 8, h: 12 })
  })

  it('s’importe à 80 px par cellule, au quart de cellule le plus proche', () => {
    expect(importedImageSize(160, 240)).toEqual({ w: 8, h: 12 })
    expect(importedImageSize(170, 251)).toEqual({ w: 9, h: 13 })
    expect(importedImageSize(3, 3)).toEqual({ w: 1, h: 1 })
    // Sa taille d'origine et ses proportions viennent du fichier, pas de la boîte du moment.
    expect(naturalImageSize({ ...led, w: 4, h: 4 })).toEqual({ w: 8, h: 12 })
    expect(imageRatio({ ...led, w: 4, h: 4 })).toBeCloseTo(2 / 3)
    expect(naturalImageSize(lost)).toBeNull()
    expect(imageRatio({ ...lost, w: 3, h: 6 })).toBe(0.5)
  })

  it('signale une image qui a perdu son fichier', () => {
    const def = createEmptyComponent('led', 'LED')
    def.size = { widthCells: 2, heightCells: 3 }
    def.pins = [{ id: 'a', name: 'A', kind: 'io', x: 1, y: 0 }]
    def.visual = { kind: 'drawing', primitives: [{ ...led, x: 0 }] }
    expect(componentIssues(def)).toEqual([])
    def.visual = { kind: 'drawing', primitives: [{ ...lost, x: 0 }] }
    expect(componentIssues(def).map((issue) => issue.message)).toEqual([
      'Une image a perdu son fichier'
    ])
  })

  it('nomme les images ajoutées pour qu’un fichier ne porte qu’une image', () => {
    const other = pngHeaderDataUrl(80, 80)
    const dot: Primitive = { kind: 'dot', x: 0, y: 0, scale: 1, color: '#000000' }
    // Un nom libre est gardé ; les autres formes passent telles quelles.
    expect(withFreeImageFiles([], [led, dot])).toEqual([led, dot])
    // La même image, déjà là : son fichier, même si la copie en portait un autre.
    expect(withFreeImageFiles([led], [{ ...led, file: 'copie.png' }])[0]).toMatchObject({
      file: 'image.png'
    })
    // Une autre image sous le même nom : un nom libre, partagé par ses copies.
    const [renamed, again] = withFreeImageFiles(
      [led],
      [
        { ...led, dataUrl: other },
        { ...led, x: 0, dataUrl: other }
      ]
    )
    expect(renamed).toMatchObject({ file: 'image-2.png', dataUrl: other })
    expect(again).toMatchObject({ file: 'image-2.png', x: 0 })
  })
})
