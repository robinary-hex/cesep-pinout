// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PromptDialog from './PromptDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('boîte de saisie', () => {
  it('valide une ligne par Entrée', async () => {
    const wrapper = mount(PromptDialog, {
      props: { title: 'Broche', label: 'Nom', value: 'GND' },
      attachTo: document.body
    })
    const input = wrapper.get('input')
    await input.setValue('VCC')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([['VCC']])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('en multiligne, garde les retours à la ligne : Maj+Entrée en ajoute, Entrée valide', async () => {
    const wrapper = mount(PromptDialog, {
      props: { title: 'Étiquette', label: 'Texte', value: 'Ligne 1\nLigne 2', multiline: true },
      attachTo: document.body
    })
    const area = wrapper.get('textarea')
    expect((area.element as HTMLTextAreaElement).value).toBe('Ligne 1\nLigne 2')
    expect(wrapper.text()).toContain('Maj+Entrée va à la ligne')
    await area.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('submit')).toBeUndefined()
    await area.setValue('Ligne 1\nLigne 2\nLigne 3')
    await area.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['Ligne 1\nLigne 2\nLigne 3']])
    wrapper.unmount()
  })
})
