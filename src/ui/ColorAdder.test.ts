// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ColorAdder from './ColorAdder.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountAdder(): ReturnType<typeof mount<typeof ColorAdder>> {
  return mount(ColorAdder, {
    props: { value: '#d62828', title: 'Couleur personnalisée' },
    attachTo: document.body
  })
}

const panel = (): HTMLElement | null => document.body.querySelector('.color-adder-panel')
const code = (): HTMLInputElement | null => document.body.querySelector('.color-adder-panel .hex')

function change(field: HTMLInputElement | null, value: string): void {
  if (!field) throw new Error('champ introuvable')
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('« + » d’une palette', () => {
  it('ouvre un volet avec le champ de couleur, le curseur dans le code', async () => {
    const wrapper = mountAdder()
    expect(panel()).toBeNull()
    await wrapper.get('button.color-adder').trigger('click')
    await flushPromises()
    expect(panel()).not.toBeNull()
    expect(code()?.value).toBe('#d62828')
    expect(document.activeElement).toBe(code())
    expect(wrapper.get('button.color-adder').attributes('aria-expanded')).toBe('true')
    // Un second clic sur le bouton le referme.
    await wrapper.get('button.color-adder').trigger('click')
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('envoie le code tapé et se referme', async () => {
    const wrapper = mountAdder()
    await wrapper.get('button.color-adder').trigger('click')
    await flushPromises()
    change(code(), 'ff7f50')
    await flushPromises()
    expect(wrapper.emitted('pick')).toEqual([['#ff7f50']])
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('envoie la couleur choisie au sélecteur et se referme', async () => {
    const wrapper = mountAdder()
    await wrapper.get('button.color-adder').trigger('click')
    await flushPromises()
    change(document.body.querySelector('.color-adder-panel input[type="color"]'), '#1d4ed8')
    await flushPromises()
    expect(wrapper.emitted('pick')).toEqual([['#1d4ed8']])
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('se referme sans rien envoyer avec Échap ou un clic ailleurs', async () => {
    const wrapper = mountAdder()
    await wrapper.get('button.color-adder').trigger('click')
    await flushPromises()
    // Échap ne va pas plus loin que le volet : l'éditeur n'en saura rien.
    let heard = 0
    const listen = (): void => {
      heard++
    }
    window.addEventListener('keydown', listen)
    code()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    window.removeEventListener('keydown', listen)
    expect(panel()).toBeNull()
    expect(heard).toBe(0)
    // Un clic dans le volet le laisse ouvert ; ailleurs, il le referme.
    await wrapper.get('button.color-adder').trigger('click')
    await flushPromises()
    panel()?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    expect(wrapper.emitted('pick')).toBeUndefined()
    wrapper.unmount()
  })
})
