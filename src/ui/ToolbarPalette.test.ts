// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { ColorChoice } from '@/domain'
import { menuEntry, menuLabels, rightClick } from './testing/menus'
import ToolbarPalette from './ToolbarPalette.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const SWATCHES: ColorChoice[] = [
  { hex: '#000000', name: 'Noir', custom: false },
  { hex: '#d62828', name: 'Rouge', custom: false },
  { hex: '#ff00aa', name: '#ff00aa', custom: true }
]

function mountPalette(swatches = SWATCHES): ReturnType<typeof mount<typeof ToolbarPalette>> {
  return mount(ToolbarPalette, {
    props: {
      swatches,
      current: '#D62828',
      adderTitle: 'Couleur personnalisée',
      paletteName: 'Palette des fils',
      customName: 'Couleur de ce montage'
    },
    attachTo: document.body
  })
}

const popover = (): HTMLElement | null => document.body.querySelector('.color-popover')
const heading = (): string =>
  document.body.querySelector('.context-menu .heading')?.textContent?.trim() ?? ''

describe('palette d’une barre d’outils', () => {
  it('montre une pastille par couleur, la courante entourée ; un clic la choisit', async () => {
    const wrapper = mountPalette()
    const swatches = wrapper.findAll('button.swatch')
    expect(swatches.map((swatch) => swatch.attributes('title'))).toEqual([
      'Noir',
      'Rouge',
      '#ff00aa'
    ])
    // La casse du code ne compte pas pour reconnaître la couleur courante.
    expect(swatches.map((swatch) => swatch.classes().includes('current'))).toEqual([
      false,
      true,
      false
    ])
    // Un trait sépare les couleurs de l'application de celles du document : il se met devant
    // la première de celles-ci, et nulle part ailleurs.
    expect(swatches.map((swatch) => swatch.attributes('data-first-own'))).toEqual([
      undefined,
      undefined,
      'true'
    ])
    await swatches[0]?.trigger('click')
    expect(wrapper.emitted('pick')).toEqual([['#000000']])
    expect(wrapper.find('button.color-adder').exists()).toBe(true)
    wrapper.unmount()
  })

  it('un clic droit propose de modifier la couleur : un volet s’ouvre sous la pastille', async () => {
    const wrapper = mountPalette()
    const swatch = wrapper.findAll('button.swatch')[1]
    if (!swatch) throw new Error('pastille attendue')
    rightClick(swatch.element, 30, 12)
    await flushPromises()
    // Le menu dit de quelle palette vient la couleur.
    expect(heading()).toBe('Palette des fils : Rouge')
    expect(menuLabels()).toEqual(['Modifier…', 'Supprimer'])
    menuEntry('Modifier…').click()
    await flushPromises()
    expect(document.body.querySelector('.context-menu')).toBeNull()
    const code = document.body.querySelector<HTMLInputElement>('.color-popover .hex')
    if (!code) throw new Error('champ de couleur attendu')
    expect(code.value).toBe('#d62828')
    expect(document.activeElement).toBe(code)
    code.value = '#aa0000'
    code.dispatchEvent(new Event('input', { bubbles: true }))
    code.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    // La pastille change de couleur ; le volet se referme.
    expect(wrapper.emitted('change')).toEqual([['#d62828', '#aa0000']])
    expect(popover()).toBeNull()
    wrapper.unmount()
  })

  it('le volet se referme sans rien changer avec Échap ou un clic ailleurs', async () => {
    const wrapper = mountPalette()
    const open = async (): Promise<void> => {
      const swatch = wrapper.findAll('button.swatch')[2]
      if (!swatch) throw new Error('pastille attendue')
      rightClick(swatch.element)
      await flushPromises()
      // Une couleur gardée par le document le dit.
      expect(heading()).toBe('Couleur de ce montage')
      menuEntry('Modifier…').click()
      await flushPromises()
    }
    await open()
    popover()
      ?.querySelector('.hex')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(popover()).toBeNull()
    await open()
    expect(popover()).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(popover()).toBeNull()
    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.unmount()
  })

  it('un clic droit propose de supprimer la couleur, sauf la dernière de la palette', async () => {
    const wrapper = mountPalette()
    const [, red, pink] = wrapper.findAll('button.swatch')
    if (!red || !pink) throw new Error('pastilles attendues')
    rightClick(pink.element)
    await flushPromises()
    menuEntry('Supprimer').click()
    await flushPromises()
    rightClick(red.element)
    await flushPromises()
    menuEntry('Supprimer').click()
    await flushPromises()
    expect(wrapper.emitted('remove')).toEqual([['#ff00aa'], ['#d62828']])
    wrapper.unmount()

    // Une palette garde au moins une couleur : sa dernière ne se supprime pas ; une couleur du
    // document, si.
    const alone = mountPalette([
      { hex: '#000000', name: 'Noir', custom: false },
      { hex: '#ff00aa', name: '#ff00aa', custom: true }
    ])
    const [black, own] = alone.findAll('button.swatch')
    if (!black || !own) throw new Error('pastilles attendues')
    rightClick(black.element)
    await flushPromises()
    expect(menuEntry('Supprimer').disabled).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    rightClick(own.element)
    await flushPromises()
    expect(menuEntry('Supprimer').disabled).toBe(false)
    alone.unmount()
  })
})
