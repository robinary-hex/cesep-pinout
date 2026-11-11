// @vitest-environment jsdom
import { mount, type DOMWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ColorField from './ColorField.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function valueOf(element: Element): string {
  return (element as HTMLInputElement).value
}

/** Tape dans un champ sans le valider : l'événement `input` seul, comme au clavier. */
async function typeIn(
  field: Pick<DOMWrapper<Element>, 'element' | 'trigger'>,
  text: string
): Promise<void> {
  ;(field.element as HTMLInputElement).value = text
  await field.trigger('input')
}

describe('champ de couleur', () => {
  it('montre la couleur dans la pastille et par son code', () => {
    const wrapper = mount(ColorField, { props: { value: '#d62828' } })
    expect(valueOf(wrapper.get('input[type="color"]').element)).toBe('#d62828')
    expect(valueOf(wrapper.get('input.hex').element)).toBe('#d62828')
    expect(wrapper.get('input.hex').classes()).not.toContain('invalid')
  })

  it('envoie la couleur choisie au sélecteur', async () => {
    const wrapper = mount(ColorField, { props: { value: '#d62828' } })
    await wrapper.get('input[type="color"]').setValue('#1d4ed8')
    await wrapper.get('input[type="color"]').trigger('change')
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['#1d4ed8'])
  })

  it('envoie le code tapé, une fois validé, sous sa forme complète', async () => {
    const wrapper = mount(ColorField, { props: { value: '#d62828' } })
    const code = wrapper.get('input.hex')
    // Rien n'est envoyé pendant la saisie ; un code incomplet se signale.
    await typeIn(code, '1D4E')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(code.classes()).toContain('invalid')
    await typeIn(code, '1D4ED8')
    expect(code.classes()).not.toContain('invalid')
    await code.trigger('change')
    expect(wrapper.emitted('change')).toEqual([['#1d4ed8']])
    expect(valueOf(code.element)).toBe('#1d4ed8')
    // La couleur vient du parent : le champ la suit.
    await wrapper.setProps({ value: '#1d4ed8' })
    expect(valueOf(wrapper.get('input[type="color"]').element)).toBe('#1d4ed8')
    // La forme courte à trois chiffres est comprise.
    await typeIn(code, '#fa0')
    await code.trigger('change')
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['#ffaa00'])
  })

  it('refuse ce qui n’est pas un code : le champ reprend la couleur, rien n’est envoyé', async () => {
    const wrapper = mount(ColorField, { props: { value: '#d62828' } })
    const code = wrapper.get('input.hex')
    await typeIn(code, 'rouge vif')
    expect(code.classes()).toContain('invalid')
    await code.trigger('change')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(valueOf(code.element)).toBe('#d62828')
    expect(code.classes()).not.toContain('invalid')
    // Le même code, retapé autrement : ce n'est pas un changement.
    await typeIn(code, 'D62828')
    await code.trigger('change')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(valueOf(code.element)).toBe('#d62828')
  })

  it('se désactive en entier', () => {
    const wrapper = mount(ColorField, { props: { value: '#ffffff', disabled: true } })
    expect(wrapper.get('input[type="color"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input.hex').attributes('disabled')).toBeDefined()
  })
})
