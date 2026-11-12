import { describe, expect, it } from 'vitest'
import { createEmptyComponent } from './component'
import type { Junction } from './connectivity'
import { projectBounds } from './placement'
import { DEFAULT_PROFILE, type StyleProfile } from './profile'
import {
  createEmptyProject,
  projectSchema,
  type ComponentInstance,
  type Project,
  type TextLabel,
  type Wire
} from './project'
import { DEFAULT_EXPORT } from './settings'
import {
  junctionDot,
  prunedStyles,
  restyledLabelSize,
  sameLook,
  styleCounts,
  styleOf,
  styleSheet,
  withStyle
} from './styles'
import { buildProjectSvg } from './svg'

/** Un profil qui s'écarte du Standard sur tout : cellule, traits, jonctions, polices. */
const THICK: StyleProfile = {
  name: 'Épais',
  cellPx: 40,
  wireWidth: 0.3,
  cornerRadius: 0,
  componentStroke: 0.2,
  junctionScale: 1.5,
  junctionColor: '#000000',
  labelFont: { family: 'Consolas', size: 22 },
  endLabelFont: { family: 'Consolas', size: 28 }
}

function wire(id: string, points: [number, number][], extra: Partial<Wire> = {}): Wire {
  return {
    id,
    color: '#d62828',
    points,
    stack: 0,
    freeEnds: 'flat',
    endLabels: { start: '', end: '' },
    ...extra
  }
}

function label(id: string, extra: Partial<TextLabel> = {}): TextLabel {
  return {
    id,
    x: 0,
    y: 6,
    w: 4,
    h: 1,
    anchor: 'middle',
    text: id,
    size: 11,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false,
    color: '#000000',
    background: false,
    ...extra
  }
}

function instance(id: string, extra: Partial<ComponentInstance> = {}): ComponentInstance {
  return {
    id,
    defId: 'boite',
    x: 0,
    y: 10,
    rotation: 0,
    mirror: false,
    label: id.toUpperCase(),
    fields: {},
    behindWires: true,
    ...extra
  }
}

/** Composant 2 × 2 dessiné d'un rectangle de trait ×1. */
function box(): Project['embeddedDefs'][string] {
  return {
    ...createEmptyComponent('boite', 'Boîte'),
    visual: {
      kind: 'drawing',
      primitives: [
        {
          kind: 'rect',
          x: 0,
          y: 0,
          w: 8,
          h: 8,
          rx: 0,
          style: { stroke: '#000000', weight: 1, fill: 'none', fillOpacity: 1 }
        }
      ]
    }
  }
}

describe('styles propres : la feuille de styles d’un montage', () => {
  const sheet = styleSheet(DEFAULT_PROFILE, [THICK])

  it('donne à un élément son style, sinon celui du montage', () => {
    expect(styleOf(sheet, {})).toBe(DEFAULT_PROFILE)
    expect(styleOf(sheet, { style: 'Épais' }).wireWidth).toBe(0.3)
    // Un nom que le montage n'a pas : le style du montage, plutôt que rien.
    expect(styleOf(sheet, { style: 'Inconnu' })).toBe(DEFAULT_PROFILE)
  })

  it('garde la taille de cellule du montage : la grille est commune', () => {
    const own = styleOf(sheet, { style: 'Épais' })
    expect(own.cellPx).toBe(DEFAULT_PROFILE.cellPx)
    expect(own.labelFont).toEqual({ family: 'Consolas', size: 22 })
    // La copie du montage, elle, reste fidèle au profil.
    expect(THICK.cellPx).toBe(40)
  })

  it('compare deux profils sans leur nom ni leur taille de cellule', () => {
    expect(sameLook(DEFAULT_PROFILE, { ...DEFAULT_PROFILE, name: 'Autre', cellPx: 30 })).toBe(true)
    expect(sameLook(DEFAULT_PROFILE, { ...DEFAULT_PROFILE, wireWidth: 0.2 })).toBe(false)
    expect(sameLook(DEFAULT_PROFILE, THICK)).toBe(false)
  })

  it('pose ou retire le style d’un élément sans toucher à l’original', () => {
    const plain = wire('w1', [
      [0, 0],
      [4, 0]
    ])
    const styled = withStyle(plain, 'Épais')
    expect(styled.style).toBe('Épais')
    expect(plain.style).toBeUndefined()
    expect('style' in withStyle(styled, undefined)).toBe(false)
  })

  it('une étiquette qui change de style garde son rapport à la police des libellés', () => {
    expect(restyledLabelSize(11, DEFAULT_PROFILE, THICK)).toBe(22)
    expect(restyledLabelSize(16.5, DEFAULT_PROFILE, THICK)).toBe(33)
    expect(restyledLabelSize(22, THICK, DEFAULT_PROFILE)).toBe(11)
    expect(restyledLabelSize(11, DEFAULT_PROFILE, { ...DEFAULT_PROFILE, name: 'Autre' })).toBe(11)
  })
})

describe('styles propres : dans le montage', () => {
  const project: Project = {
    ...createEmptyProject('Essai', DEFAULT_PROFILE),
    styles: [THICK],
    components: [instance('c1'), instance('c2', { x: 6, style: 'Épais' })],
    wires: [
      wire('w1', [
        [0, 0],
        [8, 0]
      ]),
      wire(
        'w2',
        [
          [4, 0],
          [4, 4]
        ],
        { style: 'Épais', stack: 1, color: '#1d4ed8', endLabels: { start: '', end: 'VCC' } }
      )
    ],
    labels: [label('t1'), label('t2', { x: 6, size: 22, style: 'Épais' })],
    embeddedDefs: { boite: box() }
  }

  it('est valide, et refuse un style inconnu ou en double', () => {
    expect(projectSchema.safeParse(project).success).toBe(true)
    const unknown = projectSchema.safeParse({ ...project, styles: [] })
    expect(unknown.success).toBe(false)
    expect(JSON.stringify(unknown.error?.issues)).toContain('style Épais absent de styles')
    const twice = projectSchema.safeParse({ ...project, styles: [THICK, THICK] })
    expect(JSON.stringify(twice.error?.issues)).toContain('Style en double : Épais')
  })

  it('compte les éléments de chaque style et ne garde que les styles qui servent', () => {
    expect([...styleCounts(project)]).toEqual([['Épais', 3]])
    // Tous servent : la liste elle-même, pour ne rien réécrire.
    expect(prunedStyles(project)).toBe(project.styles)
    const unused = { ...project, styles: [THICK, { ...THICK, name: 'Fin' }] }
    expect(prunedStyles(unused).map((style) => style.name)).toEqual(['Épais'])
    const none = { ...project, components: [], wires: [], labels: [] }
    expect(prunedStyles(none)).toEqual([])
  })

  it('donne à une jonction le plus grand des points que demandent les fils qui s’y rejoignent', () => {
    const sheet = styleSheet(project.profile, project.styles)
    // Le fil épais (0,3 × 1,5) se branche sur le fil du montage (0,15 × 2) : le point prend le
    // rayon du plus épais, et la couleur du fil porteur comme le veut le style de celui-ci.
    const onThin: Junction = { point: [4, 0], carrierWireId: 'w1', branches: 3 }
    const first = junctionDot(onThin, project.wires, sheet)
    expect(first.radius).toBeCloseTo(0.225)
    expect(first.color).toBe('#d62828')
    // Porté par le fil épais : la couleur fixe de son style.
    const thin = wire('w3', [
      [4, 2],
      [8, 2]
    ])
    const onThick: Junction = { point: [4, 2], carrierWireId: 'w2', branches: 3 }
    const second = junctionDot(onThick, [...project.wires, thin], sheet)
    expect(second.radius).toBeCloseTo(0.225)
    expect(second.color).toBe('#000000')
    // Deux fils du montage : le point du style du montage.
    const plain: Junction = { point: [8, 0], carrierWireId: 'w1', branches: 3 }
    expect(junctionDot(plain, [project.wires[0] ?? thin, thin], sheet).radius).toBe(0.15)
  })

  it('exporte chaque élément avec son style, sur la grille du montage', () => {
    const result = buildProjectSvg(project, DEFAULT_EXPORT)
    if (!result) throw new Error('export vide')
    const svg = result.svg
    // La grille reste celle du montage : 20 px par cellule, pas les 40 du profil épais.
    expect(result.widthPx).toBe(result.widthCells * 20 * DEFAULT_EXPORT.scale)
    // Fils : chacun son épaisseur ; le fil épais n'a pas de coins arrondis.
    expect(svg).toContain('stroke="#d62828" stroke-width="0.15"')
    expect(svg).toContain('stroke="#1d4ed8" stroke-width="0.3"')
    // Jonction du fil épais sur le fil du montage : le point du plus épais.
    expect(svg).toContain('<circle cx="4" cy="0" r="0.225" fill="#d62828"/>')
    // Étiquette d'extrémité du fil épais : sa police, 28 points sur une cellule de 20.
    expect(svg).toContain('font-family="Consolas" font-size="1.4"')
    // Composants : le trait de base de chacun.
    expect(svg).toContain('stroke-width="0.1"')
    expect(svg).toContain('stroke-width="0.2"')
    // Libellés : celui du montage hérite de la police de la racine, l'autre porte la sienne.
    expect(svg).toContain('font-size="0.55" fill="#1f2328">C1</text>')
    expect(svg).toContain(
      'font-size="1.1" font-family="Consolas, sans-serif" fill="#1f2328">C2</text>'
    )
    // Étiquettes texte : la taille est la leur, la police celle de leur style.
    expect(svg).toMatch(/<text font-size="0\.55" text-anchor="middle"[^>]*><tspan[^>]*>t1</)
    expect(svg).toMatch(
      /<text font-size="1\.1" font-family="Consolas, sans-serif" text-anchor="middle"[^>]*><tspan[^>]*>t2</
    )
    expect(svg).toContain('font-family="Segoe UI, sans-serif">')
  })

  it('réserve la place d’une étiquette d’extrémité dans la police de son fil', () => {
    // Un fil de (0, 0) à (8, 0), « VCC » dans son prolongement : 3 lettres de 0,6 × la police.
    const tagged = (style: string | undefined): Project => ({
      ...createEmptyProject('Essai', DEFAULT_PROFILE),
      styles: [THICK],
      wires: [
        withStyle(
          wire(
            'w1',
            [
              [0, 0],
              [8, 0]
            ],
            { endLabels: { start: '', end: 'VCC' } }
          ),
          style
        )
      ]
    })
    const plain = projectBounds(tagged(undefined))
    const styled = projectBounds(tagged('Épais'))
    // Police de 28 points au lieu de 14 : l'étiquette, deux fois plus large, dépasse de deux
    // cellules de plus.
    expect((styled?.width ?? 0) - (plain?.width ?? 0)).toBe(2)
  })
})
