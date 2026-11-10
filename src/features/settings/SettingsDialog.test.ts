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
})
