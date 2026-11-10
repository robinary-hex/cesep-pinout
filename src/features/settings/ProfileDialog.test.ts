// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore } from '@/features/library/store'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import ProfileDialog from './ProfileDialog.vue'

beforeEach(() => {
  setBridge(new FakeFs())
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
  document.body.innerHTML = ''
})

/** Bouton de la boîte dont le texte est exactement celui-là. */
function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text
  )
  if (!found) throw new Error(`bouton « ${text} » introuvable`)
  return found
}

describe('profil de style général', () => {
  it('a deux onglets, Montages et Diagrammes, et s’ouvre sur celui qu’on demande', async () => {
    const wrapper = mount(ProfileDialog, {
      props: { target: 'general', initialTab: 'diagram' },
      attachTo: document.body
    })
    await flushPromises()
    const tabs = [...document.body.querySelectorAll('.tabs button')]
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Montages', 'Diagrammes'])
    expect(tabs[1]?.classList.contains('active')).toBe(true)
    expect(document.body.textContent).toContain('Trait (px)')
    expect(document.body.textContent).toContain('Couleur des liens')
    // L'onglet Montages montre le profil des montages et ses profils enregistrés.
    button('Montages').click()
    await flushPromises()
    expect(document.body.textContent).toContain('Épaisseur des fils')
    expect(document.body.textContent).not.toContain('Couleur des liens')
    wrapper.unmount()
  })

  it('règle le style général des diagrammes : aperçu, puis Appliquer l’enregistre et le diagramme ouvert suit', async () => {
    const library = useLibraryStore()
    const diagram = useDiagramStore()
    const wrapper = mount(ProfileDialog, {
      props: { target: 'general', initialTab: 'diagram' },
      attachTo: document.body
    })
    await flushPromises()
    // Premier champ numérique : l'épaisseur du trait, en pixels (1,5 px = 0,15 cellule).
    const line = document.body.querySelector<HTMLInputElement>('.grid input[type="number"]')
    if (!line) throw new Error('champ du trait introuvable')
    expect(line.value).toBe('1.5')
    line.value = '3'
    line.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    // Aperçu sur le diagramme affiché, qui suit le style général ; rien n'est encore enregistré.
    expect(diagram.style.lineWidth).toBeCloseTo(0.3)
    expect(diagram.doc.style.lineWidth).toBe(0.15)
    expect(library.diagramDefaults.style.lineWidth).toBe(0.15)
    button('Appliquer').click()
    await flushPromises()
    expect(library.diagramDefaults.style.lineWidth).toBeCloseTo(0.3)
    expect(diagram.doc.style.lineWidth).toBeCloseTo(0.3)
    expect(diagram.stylePreview).toBeNull()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('Annuler ne garde rien de l’aperçu', async () => {
    const diagram = useDiagramStore()
    const wrapper = mount(ProfileDialog, {
      props: { target: 'general', initialTab: 'diagram' },
      attachTo: document.body
    })
    await flushPromises()
    const line = document.body.querySelector<HTMLInputElement>('.grid input[type="number"]')
    if (!line) throw new Error('champ du trait introuvable')
    line.value = '4'
    line.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(diagram.style.lineWidth).toBeCloseTo(0.4)
    wrapper.unmount()
    expect(diagram.style.lineWidth).toBe(0.15)
  })
})
