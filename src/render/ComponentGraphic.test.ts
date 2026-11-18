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
          vertical: false
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
          style: { stroke: '#000000', weight: 2, fill: 'none', fillOpacity: 1 }
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
          vertical: false
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

  it('affiche une image à la place et à la taille de sa forme', () => {
    const def = createEmptyComponent('n', 'N')
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'image',
          x: 4,
          y: 0,
          w: 8,
          h: 12,
          file: 'image.png',
          dataUrl: 'data:image/png;base64,AAAA'
        }
      ]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    // Quarts de cellule à 20 px par cellule : 5 px par quart.
    expect(wrapper.get('image').attributes()).toMatchObject({
      x: '20',
      y: '0',
      width: '40',
      height: '60'
    })
  })

  it('ne montre qu’une tranche d’une image coupée par l’étirement d’un composant', () => {
    const def = createEmptyComponent('n', 'N')
    def.visual = {
      kind: 'drawing',
      primitives: [
        {
          kind: 'image',
          x: 4,
          y: 0,
          w: 8,
          h: 12,
          file: 'image.png',
          dataUrl: 'data:image/png;base64,AAAA',
          crop: { x: 0.25, w: 0.5 }
        }
      ]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    // La boîte de la tranche, et la fenêtre qui ne laisse voir que la moitié du milieu.
    const slice = wrapper.get('svg.image-slice')
    expect(slice.attributes()).toMatchObject({
      x: '20',
      y: '0',
      width: '40',
      height: '60',
      viewBox: '0.25 0 0.5 1',
      preserveAspectRatio: 'none'
    })
    // L'image entière remplit le carré d'une unité que cette fenêtre découpe.
    expect(slice.get('image').attributes()).toMatchObject({
      x: '0',
      y: '0',
      width: '1',
      height: '1',
      preserveAspectRatio: 'none'
    })
  })

  it('fait déborder d’un pixel une image sur sa voisine de droite', () => {
    const def = createEmptyComponent('n', 'N')
    const image = {
      kind: 'image' as const,
      y: 0,
      w: 8,
      h: 12,
      file: 'image.png',
      dataUrl: 'data:image/png;base64,AAAA'
    }
    def.visual = {
      kind: 'drawing',
      primitives: [
        { ...image, x: 0, crop: { x: 0, w: 0.5 } },
        { ...image, x: 8, crop: { x: 0.5, w: 0.5 } },
        { ...image, x: 16 }
      ]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    // Deux tranches puis une image entière, bord à bord : sans ce pixel de plus, le fond passe
    // entre elles quand leur frontière tombe au milieu d'un pixel. La dernière garde sa largeur.
    expect(wrapper.findAll('svg.image-slice').map((slice) => slice.attributes('width'))).toEqual([
      '41',
      '41'
    ])
    expect(wrapper.get('g > image').attributes()).toMatchObject({ x: '80', width: '40' })
    // L'une sous l'autre, coupées dans la hauteur : la fenêtre de chacune, et un pixel de plus
    // vers le bas pour celle du dessus.
    const stacked = createEmptyComponent('m', 'M')
    stacked.visual = {
      kind: 'drawing',
      primitives: [
        { ...image, x: 0, crop: { x: 0, w: 1, y: 0, h: 0.5 } },
        { ...image, x: 0, y: 12, crop: { x: 0, w: 1, y: 0.5, h: 0.5 } }
      ]
    }
    const tall = mount(ComponentGraphic, { props: { def: stacked, cellPx: 20 } })
    expect(
      tall
        .findAll('svg.image-slice')
        .map((slice) => [
          slice.attributes('width'),
          slice.attributes('height'),
          slice.attributes('viewBox')
        ])
    ).toEqual([
      ['40', '61', '0 0 1 0.5'],
      ['40', '60', '0 0.5 1 0.5']
    ])
    // Le montage dessine en cellules, sous une mise à l'échelle : il dit ce que vaut un pixel.
    const scaled = mount(ComponentGraphic, { props: { def, cellPx: 1, pixel: 0.05 } })
    expect(scaled.findAll('svg.image-slice').map((slice) => slice.attributes('width'))).toEqual([
      '2.05',
      '2.05'
    ])
  })

  it('dessine la grille de trous d’une plaque en deux tracés', () => {
    const def = createEmptyComponent('plaque', 'Plaque')
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'holes', x: 4, y: 4, w: 8, h: 4, color: '#d5dbe0' }]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    // Trois colonnes, deux rangées : six pastilles et six trous, un tracé pour chaque.
    const pads = wrapper.get('path.hole-pads')
    const drills = wrapper.get('path.hole-drills')
    expect((pads.attributes('d')?.match(/M/g) ?? []).length).toBe(6)
    expect((drills.attributes('d')?.match(/M/g) ?? []).length).toBe(6)
    expect(pads.attributes('fill')).toBe('#d5dbe0')
    // La première pastille : centrée sur l'intersection (1, 1), soit (20, 20) px, rayon 6 px.
    expect(pads.attributes('d')).toMatch(/^M14 20a6 6 0 1 0 12 0/)
    // Hors de l'éditeur, rien à cliquer.
    expect(wrapper.find('rect').exists()).toBe(false)
    const editing = mount(ComponentGraphic, { props: { def, cellPx: 20, interactive: true } })
    expect(editing.get('rect').attributes()).toMatchObject({ x: '20', y: '20', width: '40' })
  })

  it('une empreinte est en pointillés, et ne se dessine que là où on la demande', () => {
    const def = createEmptyComponent('b', 'Bornier')
    def.visual = {
      kind: 'drawing',
      primitives: [
        { kind: 'rect', x: 0, y: 0, w: 8, h: 8, rx: 0, style: DEFAULT_SHAPE_STYLE },
        { kind: 'rect', x: 0, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE, footprint: true }
      ]
    }
    const dashes = (footprints?: 'hidden' | 'drawn' | 'only'): (string | undefined)[] =>
      mount(ComponentGraphic, { props: { def, cellPx: 20, ...(footprints ? { footprints } : {}) } })
        .findAll('rect')
        .map((rect) => rect.attributes('stroke-dasharray'))
    // Le composant tel qu'on le pose : sans son empreinte.
    expect(dashes()).toEqual([undefined])
    // Dans l'éditeur : tout le dessin, l'empreinte en pointillés (trait de 2 px : tirets 4, 6).
    expect(dashes('drawn')).toEqual([undefined, '4 6'])
    // Sur l'autre face d'une plaque : l'empreinte seule.
    expect(dashes('only')).toEqual(['4 6'])
  })

  it('signale une image manquante au lieu de planter', () => {
    const def = createEmptyComponent('n', 'N')
    def.visual = {
      kind: 'drawing',
      primitives: [{ kind: 'image', x: 4, y: 0, w: 8, h: 12, file: 'image.png' }]
    }
    const wrapper = mount(ComponentGraphic, { props: { def, cellPx: 20 } })
    expect(wrapper.find('image').exists()).toBe(false)
    expect(wrapper.get('.missing-image rect').attributes('width')).toBe('40')
    expect(wrapper.text()).toContain('Image manquante')
  })
})
