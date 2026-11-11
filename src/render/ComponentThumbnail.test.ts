// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, type ComponentDefinition } from '@/domain'
import ComponentThumbnail from './ComponentThumbnail.vue'

const rect = { kind: 'rect' as const, x: 0, y: 0, w: 4, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE }

/** Un composant à une broche, et une variante qui dessine un rectangle de plus. */
function component(): ComponentDefinition {
  const def = createEmptyComponent('led', 'LED')
  def.visual = { kind: 'drawing', primitives: [rect] }
  def.pins = [{ id: 'a', name: '1', kind: 'io', x: 0, y: 1 }]
  def.variants = [
    {
      id: 'v1',
      name: 'Double',
      size: { widthCells: 8, heightCells: 2 },
      visual: { kind: 'drawing', primitives: [rect, { ...rect, x: 8 }] },
      pins: def.pins
    }
  ]
  return def
}

describe('vignette d’un composant', () => {
  it('montre le dessin seul, sans les broches', () => {
    const wrapper = mount(ComponentThumbnail, { props: { def: component() } })
    expect(wrapper.findAll('rect')).toHaveLength(1)
    expect(wrapper.findAll('circle')).toHaveLength(0)
  })

  it('montre la variante qu’on regardait en enregistrant', () => {
    const def = { ...component(), previewVariant: 'v1' }
    const wrapper = mount(ComponentThumbnail, { props: { def } })
    expect(wrapper.findAll('rect')).toHaveLength(2)
    expect(wrapper.findAll('circle')).toHaveLength(0)
  })
})
