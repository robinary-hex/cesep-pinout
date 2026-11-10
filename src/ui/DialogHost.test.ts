// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import DialogHost from './DialogHost.vue'
import {
  ask,
  askToSave,
  confirmAction,
  pendingDialogs,
  setDialogResponder,
  type SaveChoice
} from './dialogs'
import ModalDialog from './ModalDialog.vue'
import { openModals } from './modalState'
import { scriptDialogs } from './testing/dialogs'

afterEach(() => {
  setDialogResponder(null)
  pendingDialogs.value = []
  document.body.innerHTML = ''
})

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text
  )
  if (!found) throw new Error(`bouton « ${text} » introuvable`)
  return found
}

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('boîtes de message de l’application', () => {
  it('pose la question dans une boîte et rend la valeur du bouton choisi', async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body })
    const answer = askToSave('Montage 1')
    await flushPromises()
    expect(document.body.textContent).toContain('Enregistrer les modifications ?')
    expect(document.body.textContent).toContain('« Montage 1 »')
    expect(openModals.value).toBe(1)
    expect(
      [...document.body.querySelectorAll('.buttons button')].map((item) => item.textContent?.trim())
    ).toEqual(['Annuler', 'Ne pas enregistrer', 'Enregistrer'])
    // Le choix attendu a le clavier : Entrée le valide.
    expect(document.activeElement).toBe(button('Enregistrer'))
    button('Ne pas enregistrer').click()
    expect(await answer).toBe<SaveChoice>('discard')
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(openModals.value).toBe(0)
    wrapper.unmount()
  })

  it('Échap ou la croix répondent par l’annulation ; les questions se suivent', async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body })
    const first = confirmAction({
      title: 'Supprimer ?',
      message: 'Un',
      confirm: 'Supprimer',
      danger: true
    })
    const second = ask({
      title: 'Récupérer ?',
      message: 'Deux',
      buttons: [{ label: 'Oui', value: 'oui', kind: 'primary' }],
      cancel: 'plus tard'
    })
    await flushPromises()
    expect(document.body.textContent).toContain('Supprimer ?')
    expect(document.body.textContent).not.toContain('Récupérer ?')
    expect(button('Supprimer').classList.contains('danger')).toBe(true)
    pressEscape()
    expect(await first).toBe(false)
    await flushPromises()
    expect(document.body.textContent).toContain('Récupérer ?')
    button('✕').click()
    expect(await second).toBe('plus tard')
    wrapper.unmount()
  })

  it('Échap ne ferme que la boîte du dessus', async () => {
    let closed = 0
    const Under = defineComponent({
      setup: () => () =>
        h(ModalDialog, { title: 'Dessous', onClose: () => closed++ }, () => 'contenu')
    })
    const under = mount(Under, { attachTo: document.body })
    const host = mount(DialogHost, { attachTo: document.body })
    const answer = confirmAction({ title: 'Dessus', message: 'Question', confirm: 'Oui' })
    await flushPromises()
    expect(openModals.value).toBe(2)
    pressEscape()
    expect(await answer).toBe(false)
    expect(closed).toBe(0)
    await flushPromises()
    pressEscape()
    expect(closed).toBe(1)
    host.unmount()
    under.unmount()
  })

  it('dans les tests, des réponses programmées remplacent la boîte', async () => {
    const dialogs = scriptDialogs()
    dialogs.answers.push('save')
    expect(await askToSave('Montage 1')).toBe('save')
    // Sans réponse programmée : l'annulation.
    expect(await askToSave('Montage 2')).toBe('cancel')
    expect(dialogs.asked.map((question) => question.title)).toEqual([
      'Enregistrer les modifications ?',
      'Enregistrer les modifications ?'
    ])
    expect(pendingDialogs.value).toHaveLength(0)
  })
})
