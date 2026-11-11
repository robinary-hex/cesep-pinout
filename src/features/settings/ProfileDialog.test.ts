// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '@/domain'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
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

describe('profils de style enregistrés', () => {
  /** Champ de la boîte dont l'étiquette commence par ce texte. */
  function field(label: string): HTMLInputElement {
    const found = [...document.body.querySelectorAll('label')].find((candidate) =>
      candidate.textContent?.trim().startsWith(label)
    )
    const input = found?.querySelector('input')
    if (!input) throw new Error(`champ « ${label} » introuvable`)
    return input
  }

  async function type(label: string, value: string): Promise<void> {
    const input = field(label)
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  const rows = (): string[] =>
    [...document.body.querySelectorAll('.profile-row')].map(
      (row) => row.querySelector('.name')?.textContent?.trim() ?? ''
    )
  const checked = (): boolean[] =>
    [...document.body.querySelectorAll<HTMLInputElement>('.profile-row input[type="radio"]')].map(
      (radio) => radio.checked
    )
  const badges = (): string[][] =>
    [...document.body.querySelectorAll('.profile-row')].map((row) =>
      [...row.querySelectorAll('.badge')].map((badge) => badge.textContent?.trim() ?? '')
    )

  async function pick(index: number): Promise<void> {
    const radio = document.body.querySelectorAll<HTMLInputElement>(
      '.profile-row input[type="radio"]'
    )[index]
    radio?.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  it('enregistre deux profils, puis en choisir un le remet dans les champs et à l’aperçu', async () => {
    const library = useLibraryStore()
    const schematic = useSchematicStore()
    await library.init()
    const wrapper = mount(ProfileDialog, { props: { target: 'general' }, attachTo: document.body })
    await flushPromises()
    // Rien d'enregistré : une seule ligne, le profil général, cochée et marquée en usage.
    expect(rows()).toEqual([DEFAULT_PROFILE.name])
    expect(checked()).toEqual([true])
    expect(badges()).toEqual([['en usage']])
    // Un réglage retouché sans nom de profil : une ligne pour ces réglages-là, cochée.
    await type('Épaisseur des fils', '0.5')
    expect(checked()).toEqual([false, true])
    expect(document.body.textContent).toContain('pas encore enregistrés comme profil')

    await type('Nom du profil', 'Cours')
    await type('Épaisseur des fils', '0.3')
    button('Enregistrer comme profil').click()
    await flushPromises()
    await type('Nom du profil', 'Impression')
    await type('Épaisseur des fils', '0.1')
    button('Enregistrer comme profil').click()
    await flushPromises()
    // Les deux profils, puis le profil général, toujours en usage tant qu'on n'a rien appliqué.
    expect(rows()).toEqual(['Cours', 'Impression', DEFAULT_PROFILE.name])
    expect(checked()).toEqual([false, true, false])
    expect(badges()).toEqual([[], [], ['en usage']])

    // Choisir « Cours » : ses réglages reviennent dans les champs, et le montage les montre déjà.
    await pick(0)
    expect(field('Nom du profil').value).toBe('Cours')
    expect(field('Épaisseur des fils').value).toBe('0.3')
    expect(checked()).toEqual([true, false, false])
    expect(schematic.profile.wireWidth).toBe(0.3)
    expect(document.body.textContent).toContain('Profil « Cours » choisi')

    // Un réglage retouché : la ligne le dit, et le bouton propose de mettre le profil à jour.
    await type('Épaisseur des fils', '0.25')
    expect(badges()[0]).toEqual(['modifié'])
    button('Mettre à jour le profil').click()
    await flushPromises()
    expect(badges()[0]).toEqual([])

    // La ligne du profil général y ramène, tel qu'il est.
    await pick(2)
    expect(field('Nom du profil').value).toBe(DEFAULT_PROFILE.name)
    expect(checked()).toEqual([false, false, true])
    await pick(0)

    // Appliquer : « Cours » devient le profil général ; à la réouverture, sa ligne le dit.
    button('Appliquer').click()
    await flushPromises()
    expect(library.defaultProfile).toMatchObject({ name: 'Cours', wireWidth: 0.25 })
    wrapper.unmount()
    document.body.innerHTML = ''
    const again = mount(ProfileDialog, { props: { target: 'general' }, attachTo: document.body })
    await flushPromises()
    expect(rows()).toEqual(['Cours', 'Impression'])
    expect(checked()).toEqual([true, false])
    expect(badges()).toEqual([['en usage'], []])
    again.unmount()
  })
})
