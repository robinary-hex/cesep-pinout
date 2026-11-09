// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, NO_ARROWS } from '@/domain'
import ComponentGraphic from './ComponentGraphic.vue'

describe('ComponentGraphic', () => {
  it('dessine chaque primitive en SVG natif, aux bonnes coordonnées', () => {
    const def = createEmptyComponent('r', 'R')
    def.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE },
        { kind: 'line', x1: 0, y1: 4, x2: 4, y2: 4, arrows: NO_ARROWS, style: DEFAULT_SHAPE_STYLE },
        {
          kind: 'text',
          w: 8,
          h: 2,
          x: 8,
          y: 1,
          text: 'R',
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
          mono: false
        }
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

  it('applique le trait de base du profil, les flèches et les valeurs des champs', () => {
    const def = createEmptyComponent('r', 'R')
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'line',
          x1: 0,
          y1: 4,
          x2: 8,
          y2: 4,
          arrows: { start: false, middle: false, end: true },
          style: { stroke: '#000000', weight: 2, fill: 'none' }
        },
        {
          kind: 'text',
          w: 8,
          h: 2,
          x: 8,
          y: 1,
          text: 'valeur',
          size: 0.5,
          anchor: 'middle',
          color: '#000000',
          variable: true,
          defaultValue: '10 kΩ',
          unit: '',
          bold: false,
          followsRotation: false,
          italic: false,
          underline: false,
          strike: false,
          mono: false
        }
      ]
    }
    const plain = mount(ComponentGraphic, { props: { def, cellPx: 20, strokeBase: 0.2 } })
    expect(plain.find('line').attributes('stroke-width')).toBe('8')
    expect(plain.findAll('polygon')).toHaveLength(1)
    expect(plain.find('text').text()).toBe('10 kΩ')

    const placed = mount(ComponentGraphic, {
      props: { def, cellPx: 20, fields: { valeur: '4,7 kΩ' } }
    })
    expect(placed.find('text').text()).toBe('4,7 kΩ')
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
