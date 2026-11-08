// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE } from '@/domain'
import ComponentGraphic from './ComponentGraphic.vue'

describe('ComponentGraphic', () => {
  it('dessine chaque primitive en SVG natif, aux bonnes coordonnées', () => {
    const def = createEmptyComponent('r', 'R')
    def.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE },
        { kind: 'line', x1: 0, y1: 4, x2: 4, y2: 4, style: DEFAULT_SHAPE_STYLE },
        { kind: 'text', x: 8, y: 1, text: 'R', size: 0.5, anchor: 'middle', color: '#000000' }
      ]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 40 } })
    const rect = wrapper.find('rect')
    expect(rect.attributes('x')).toBe('40')
    expect(rect.attributes('width')).toBe('80')
    expect(rect.attributes('stroke-width')).toBe('4')
    expect(wrapper.find('line').attributes('x2')).toBe('40')
    expect(wrapper.find('text').text()).toBe('R')
    expect(wrapper.find('text').attributes('font-size')).toBe('20')
  })

  it('affiche un PNG embarqué à la taille du composant', () => {
    const def = createEmptyComponent('n', 'N')
    def.size = { widthCells: 6, heightCells: 14 }
    def.visual = {
      kind: 'png',
      file: 'image.png',
      pxPerCell: 80,
      dataUrl: 'data:image/png;base64,AAAA'
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    const image = wrapper.find('image')
    expect(image.attributes('width')).toBe('120')
    expect(image.attributes('height')).toBe('280')
  })

  it('signale une image manquante au lieu de planter', () => {
    const def = createEmptyComponent('n', 'N')
    def.visual = { kind: 'png', file: 'image.png', pxPerCell: 80 }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    expect(wrapper.text()).toContain('image.png manquante')
  })
})
