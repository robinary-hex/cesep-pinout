// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createNode, DEFAULT_DIAGRAM_STYLE, type DiagramNode } from '@/domain'
import DiagramNodeGraphic from './DiagramNodeGraphic.vue'

function textFill(patch: Partial<DiagramNode>): string | undefined {
  const node: DiagramNode = { ...createNode('n1', 'rounded', 0, 0), title: 'Titre', ...patch }
  const wrapper = mount(DiagramNodeGraphic, { props: { node, look: DEFAULT_DIAGRAM_STYLE } })
  return wrapper.get('text').attributes('fill')
}

describe('DiagramNodeGraphic', () => {
  it('donne au texte la couleur de la forme tirée vers l’encre, en contour comme en teinté', () => {
    // À moitié encre du thème : plus foncée que la forme en clair, plus claire en sombre.
    const mixed = 'color-mix(in srgb, #1d4ed8 50%, var(--ink))'
    expect(textFill({ color: '#1d4ed8', fill: 'none' })).toBe(mixed)
    expect(textFill({ color: '#1d4ed8', fill: 'tint' })).toBe(mixed)
    // Le noir pur est l'encre du thème, pour le trait comme pour le texte.
    expect(textFill({ color: '#000000', fill: 'tint' })).toBe('var(--ink)')
  })

  it('sur un fond plein, garde un texte qui s’y lit', () => {
    expect(textFill({ color: '#3c3489', fill: 'solid' })).toBe('#ffffff')
    expect(textFill({ color: '#f7e08a', fill: 'solid' })).toBe('#000000')
    // Fond plein à l'encre du thème : le texte prend la couleur du papier.
    expect(textFill({ color: '#000000', fill: 'solid' })).toBe('var(--paper)')
  })

  it('prend la couleur choisie pour le texte de ce nœud', () => {
    expect(textFill({ color: '#1d4ed8', fill: 'none', textColor: '#d62828' })).toBe('#d62828')
    expect(textFill({ color: '#f7e08a', fill: 'solid', textColor: '#d62828' })).toBe('#d62828')
    // Noir choisi : l'encre du thème sur le papier, le noir même sur un fond plein.
    expect(textFill({ color: '#1d4ed8', fill: 'tint', textColor: '#000000' })).toBe('var(--ink)')
    expect(textFill({ color: '#f7e08a', fill: 'solid', textColor: '#000000' })).toBe('#000000')
  })
})
