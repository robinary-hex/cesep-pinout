// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, serializeSettings } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import SettingsDialog from './SettingsDialog.vue'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  fs.oneDrive = 'D:/OneDrive'
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
  document.body.innerHTML = ''
})

/** Boutons de la boîte dont le texte est exactement celui-là, dans l'ordre de la page. */
function buttons(text: string): HTMLButtonElement[] {
  return [...document.body.querySelectorAll('button')].filter(
    (candidate) => candidate.textContent?.trim() === text
  )
}

function click(text: string, index = 0): void {
  const found = buttons(text)[index]
  if (!found) throw new Error(`bouton « ${text} » introuvable`)
  found.click()
}

describe('paramètres de l’application', () => {
  it('garde le dossier de bibliothèque choisi quand on enregistre ensuite la boîte', async () => {
    const library = useLibraryStore()
    await library.init()
    const wrapper = mount(SettingsDialog, { attachTo: document.body })
    await flushPromises()
    fs.openDialogAnswers.push('F:/composants')
    click('Choisir un autre dossier…')
    await flushPromises()
    expect(library.libraryDir).toBe('F:/composants')
    click('Enregistrer')
    await flushPromises()
    expect(library.libraryDir).toBe('F:/composants')
    expect(library.settings?.libraryDir).toBe('F:/composants')
    wrapper.unmount()
  })

  it('change le dossier des paramètres, reprend ceux qui s’y trouvent, et revient au dossier par défaut', async () => {
    const library = useLibraryStore()
    await library.init()
    await fs.writeTextFile(
      'F:/partage/settings.json',
      serializeSettings({ ...DEFAULT_SETTINGS, theme: 'light', autosaveSeconds: 300 })
    )
    const wrapper = mount(SettingsDialog, { attachTo: document.body })
    await flushPromises()
    expect(document.body.textContent).toContain('D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout')
    expect(buttons('Dossier par défaut')).toHaveLength(0)
    // Second bouton « Choisir un autre dossier… » : celui des paramètres.
    fs.openDialogAnswers.push('F:/partage')
    click('Choisir un autre dossier…', 1)
    await flushPromises()
    expect(library.sharedSettingsPath).toBe('F:/partage/settings.json')
    expect(library.autosaveSeconds).toBe(300)
    expect(document.body.textContent).toContain('Paramètres repris de ce dossier.')
    // La boîte montre les réglages repris, et les essaie (thème clair).
    const interval = document.body.querySelector<HTMLInputElement>('input[type="number"]')
    expect(interval?.value).toBe('300')
    expect(document.documentElement.dataset['theme']).toBe('light')
    // Enregistrer la boîte ne remet pas l'ancien dossier.
    click('Dossier par défaut')
    await flushPromises()
    expect(library.settingsDir).toBe('')
    expect(library.sharedSettingsPath).toBe(
      'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout/settings.json'
    )
    expect(library.autosaveSeconds).toBe(DEFAULT_SETTINGS.autosaveSeconds)
    wrapper.unmount()
  })

  it('règle la palette des diagrammes à part de celle des fils', async () => {
    const library = useLibraryStore()
    await library.init()
    const wrapper = mount(SettingsDialog, { attachTo: document.body })
    await flushPromises()
    const block = (title: string): HTMLElement => {
      const found = [...document.body.querySelectorAll<HTMLElement>('section.block')].find(
        (section) => section.querySelector('h3')?.textContent === title
      )
      if (!found) throw new Error(`section « ${title} » introuvable`)
      return found
    }
    // Dans une ligne de palette : la pastille et son code (un champ de couleur), puis le nom.
    const NAME = '.palette-row > input[type="text"]'
    const names = (title: string): string[] =>
      [...block(title).querySelectorAll<HTMLInputElement>(NAME)].map((input) => input.value)
    const codes = (title: string): HTMLInputElement[] => [
      ...block(title).querySelectorAll<HTMLInputElement>('.palette-row input.hex')
    ]
    const swatches = (title: string): HTMLInputElement[] => [
      ...block(title).querySelectorAll<HTMLInputElement>('.palette-row input[type="color"]')
    ]
    const change = (input: HTMLInputElement | null | undefined, value: string): void => {
      if (!input) throw new Error('champ introuvable')
      input.value = value
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    // Deux palettes : les couleurs vives des fils, les tons plus doux des diagrammes.
    expect(names('Palette des fils')).toEqual(DEFAULT_SETTINGS.palette.map((color) => color.name))
    expect(names('Palette des diagrammes')).toEqual(
      DEFAULT_SETTINGS.diagramPalette.map((color) => color.name)
    )
    const diagrams = block('Palette des diagrammes')
    // Renommer et reteinter une couleur, en retirer une, en ajouter une.
    change(diagrams.querySelectorAll<HTMLInputElement>(NAME)[1], 'Corail')
    await flushPromises()
    // La teinte se donne par son code hexadécimal, tapé sans le dièse, en majuscules…
    const PALETTE = 'Palette des diagrammes'
    expect(codes(PALETTE)[1]?.value).toBe(DEFAULT_SETTINGS.diagramPalette[1]?.hex)
    change(codes(PALETTE)[1], 'FFB4A2')
    await flushPromises()
    expect(codes(PALETTE)[1]?.value).toBe('#ffb4a2')
    expect(swatches(PALETTE)[1]?.value).toBe('#ffb4a2')
    // … ou au sélecteur, et le code suit. Un code qui n'en est pas un est refusé.
    change(swatches(PALETTE)[3], '#123456')
    await flushPromises()
    expect(codes(PALETTE)[3]?.value).toBe('#123456')
    change(codes(PALETTE)[3], 'bleu nuit')
    await flushPromises()
    expect(codes(PALETTE)[3]?.value).toBe('#123456')
    block('Palette des diagrammes').querySelectorAll<HTMLButtonElement>('button.danger')[2]?.click()
    await flushPromises()
    const add = [...block('Palette des diagrammes').querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Ajouter une couleur'
    )
    add?.click()
    await flushPromises()
    const expected = [
      DEFAULT_SETTINGS.diagramPalette[0],
      { name: 'Corail', hex: '#ffb4a2' },
      { name: DEFAULT_SETTINGS.diagramPalette[3]?.name, hex: '#123456' },
      ...DEFAULT_SETTINGS.diagramPalette.slice(4),
      { name: 'Couleur 10', hex: '#808080' }
    ]
    expect(names('Palette des diagrammes')).toEqual(expected.map((color) => color?.name))
    // Rien n'est enregistré avant la validation ; la palette des fils n'a pas bougé.
    expect(library.diagramPalette).toEqual(DEFAULT_SETTINGS.diagramPalette)
    click('Enregistrer')
    await flushPromises()
    expect(library.diagramPalette).toEqual(expected)
    expect(library.palette).toEqual(DEFAULT_SETTINGS.palette)
    expect(library.settings?.defaultWireColor).toBe(DEFAULT_SETTINGS.defaultWireColor)
    wrapper.unmount()
  })
})
