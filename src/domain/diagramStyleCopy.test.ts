import { describe, expect, it } from 'vitest'
import { createEmptyDiagram, createNode, type Diagram, type DiagramLink } from './diagram'
import {
  copiedStyle,
  LINK_LOOK_KEYS,
  NODE_LOOK_KEYS,
  sameTypeIds,
  styleRecipients,
  TEXT_LOOK_KEYS,
  type StyleElement
} from './diagramStyleCopy'
import type { TextLabel } from './project'

function link(id: string, y: number, patch: Partial<DiagramLink> = {}): DiagramLink {
  return {
    id,
    points: [
      [0, y],
      [10, y]
    ],
    color: '#000000',
    dash: 'solid',
    startArrow: false,
    endArrow: true,
    label: '',
    labelAt: 0.5,
    labelSide: -1,
    labelBackground: false,
    ...patch
  }
}

function text(id: string, y: number, patch: Partial<TextLabel> = {}): TextLabel {
  return {
    id,
    x: 40,
    y,
    w: 12,
    h: 3,
    anchor: 'middle',
    text: 'Texte',
    size: 12,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    vertical: false,
    color: '#000000',
    background: false,
    ...patch
  }
}

/** L'allure de la forme source : tout ce qui se copie d'une forme a ici une valeur à elle. */
const LOOK = {
  color: '#d62828',
  fill: 'solid',
  borderColor: '#000000',
  font: 'mono',
  bold: false,
  italic: true,
  underline: true,
  strike: true,
  textSize: 18,
  textColor: '#ffffff'
} as const

function sample(): Diagram {
  const diagram = createEmptyDiagram('Styles')
  diagram.nodes.push(
    { ...createNode('a1', 'rounded', 0, 0), title: 'Source', ...LOOK },
    { ...createNode('a2', 'rounded', 0, 10), title: 'Autre action' },
    { ...createNode('r1', 'rect', 0, 20), title: 'Rectangle' },
    { ...createNode('a3', 'rounded', 0, 30), title: 'Déjà pareille', ...LOOK }
  )
  diagram.links.push(
    link('l1', 50, { color: '#1d4ed8', dash: 'dashed', startArrow: true, endArrow: false }),
    link('l2', 55, { label: 'vrai' }),
    link('l3', 60, { color: '#1d4ed8', dash: 'dashed', startArrow: true, endArrow: false })
  )
  diagram.texts.push(
    text('t1', 0, { size: 20, bold: true, color: '#d62828', background: true, anchor: 'start' }),
    text('t2', 10, { text: 'Autre', vertical: true })
  )
  return diagram
}

/** Tout le diagramme, comme le prendrait un lasso qui l'entoure. */
function everything(diagram: Diagram): StyleElement[] {
  return [
    ...diagram.nodes.map((node): StyleElement => ({ kind: 'node', id: node.id })),
    ...diagram.links.map((entry): StyleElement => ({ kind: 'link', id: entry.id })),
    ...diagram.texts.map((entry): StyleElement => ({ kind: 'text', id: entry.id }))
  ]
}

describe('copie de style d’un diagramme', () => {
  it('prend l’allure d’une forme, pas son texte, sa place ni sa taille', () => {
    const copied = copiedStyle(sample(), { kind: 'node', id: 'a1' })
    expect(copied).toEqual({ kind: 'node', shape: 'rounded', look: LOOK })
    expect(Object.keys(copied?.look ?? {}).sort()).toEqual([...NODE_LOOK_KEYS].sort())
    // Un élément qui n'existe pas n'a pas de style à donner.
    expect(copiedStyle(sample(), { kind: 'node', id: 'absent' })).toBeNull()
    expect(copiedStyle(sample(), { kind: 'link', id: 'a1' })).toBeNull()
  })

  it('ne va qu’aux formes de la même espèce : une action à des actions, jamais à un rectangle', () => {
    const diagram = sample()
    const copied = copiedStyle(diagram, { kind: 'node', id: 'a1' })
    if (!copied) throw new Error('style attendu')
    expect(sameTypeIds(diagram, copied)).toEqual(['a1', 'a2', 'a3'])
    // Un lasso sur tout le diagramme : seule l'action qui n'a pas déjà cette allure change.
    expect(styleRecipients(diagram, copied, everything(diagram))).toEqual(['a2'])
    // Le rectangle, visé seul, ne reçoit rien ; ni un lien ni un texte.
    expect(styleRecipients(diagram, copied, [{ kind: 'node', id: 'r1' }])).toEqual([])
    expect(styleRecipients(diagram, copied, [{ kind: 'link', id: 'l2' }])).toEqual([])
    expect(styleRecipients(diagram, copied, [])).toEqual([])
    // Le style d'un rectangle, à l'inverse, ne va pas aux actions.
    const fromRect = copiedStyle(diagram, { kind: 'node', id: 'r1' })
    if (!fromRect) throw new Error('style attendu')
    expect(sameTypeIds(diagram, fromRect)).toEqual(['r1'])
    expect(styleRecipients(diagram, fromRect, everything(diagram))).toEqual([])
  })

  it('va d’un lien aux liens : couleur, trait, pointes, fond de l’étiquette', () => {
    const diagram = sample()
    const copied = copiedStyle(diagram, { kind: 'link', id: 'l1' })
    expect(copied).toEqual({
      kind: 'link',
      look: {
        color: '#1d4ed8',
        dash: 'dashed',
        startArrow: true,
        endArrow: false,
        labelBackground: false
      }
    })
    if (!copied) throw new Error('style attendu')
    expect(Object.keys(copied.look).sort()).toEqual([...LINK_LOOK_KEYS].sort())
    expect(sameTypeIds(diagram, copied)).toEqual(['l1', 'l2', 'l3'])
    expect(styleRecipients(diagram, copied, everything(diagram))).toEqual(['l2'])
  })

  it('va d’un texte libre aux textes : taille, style, couleur, fond, alignement, pas son sens', () => {
    const diagram = sample()
    const copied = copiedStyle(diagram, { kind: 'text', id: 't1' })
    if (!copied) throw new Error('style attendu')
    expect(copied.look).toEqual({
      size: 20,
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      color: '#d62828',
      background: true,
      anchor: 'start'
    })
    expect(Object.keys(copied.look).sort()).toEqual([...TEXT_LOOK_KEYS].sort())
    expect(styleRecipients(diagram, copied, everything(diagram))).toEqual(['t2'])
  })
})
