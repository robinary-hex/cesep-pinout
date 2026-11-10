// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyComponent } from '@/domain'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { setBridge } from '@/io/bridge'
import { saveComponent } from '@/io/library'
import { FakeFs } from '@/io/testing/fakeFs'
import { setDialogResponder } from '@/ui/dialogs'
import { scriptDialogs, type DialogScript } from '@/ui/testing/dialogs'
import LibraryPanel from './LibraryPanel.vue'
import { useLibraryStore } from './store'

let fs: FakeFs
let dialogs: DialogScript

beforeEach(async () => {
  fs = new FakeFs()
  setBridge(fs)
  dialogs = scriptDialogs()
  setActivePinia(createPinia())
  const library = useLibraryStore()
  await library.init()
  await saveComponent(library.libraryDir, createEmptyComponent('led', 'LED'))
  await library.refresh()
})

afterEach(() => {
  setBridge(null)
  setDialogResponder(null)
  document.body.innerHTML = ''
})

function menuEntries(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>('.context-menu .entry')]
}

function entry(text: string): HTMLButtonElement {
  const found = menuEntries().find((candidate) => candidate.textContent?.trim() === text)
  if (!found) throw new Error(`entrée « ${text} » introuvable`)
  return found
}

describe('panneau de la bibliothèque', () => {
  it('n’a plus de bouton Nouveau, ni de boutons sur les composants', async () => {
    const wrapper = mount(LibraryPanel, { props: { mode: 'edit' }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.item .name').text()).toBe('LED')
    const texts = wrapper.findAll('button').map((button) => button.text())
    expect(texts.some((text) => text.includes('Nouveau'))).toBe(false)
    expect(wrapper.findAll('.item button')).toHaveLength(1)
    wrapper.unmount()
  })

  it('propose Ouvrir, Dupliquer et Supprimer au clic droit, dans l’éditeur de composants', async () => {
    const editor = useComponentEditorStore()
    const library = useLibraryStore()
    const wrapper = mount(LibraryPanel, { props: { mode: 'edit' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.item').trigger('contextmenu', { clientX: 40, clientY: 60 })
    expect(menuEntries().map((item) => item.textContent?.trim())).toEqual([
      'Ouvrir',
      'Dupliquer',
      'Supprimer…'
    ])
    // Dupliquer : une copie non enregistrée s'ouvre dans un onglet.
    entry('Dupliquer').click()
    await flushPromises()
    expect(document.body.querySelector('.context-menu')).toBeNull()
    expect(editor.doc.name).toBe('LED (copie)')
    expect(editor.folder).toBeNull()
    // Supprimer : la question d'abord ; annulée, rien ne change.
    await wrapper.get('.item').trigger('contextmenu', { clientX: 40, clientY: 60 })
    entry('Supprimer…').click()
    await flushPromises()
    expect(dialogs.asked.at(-1)?.title).toBe('Supprimer le composant ?')
    expect(library.entries).toHaveLength(1)
    dialogs.answers.push(true)
    await wrapper.get('.item').trigger('contextmenu', { clientX: 40, clientY: 60 })
    entry('Supprimer…').click()
    await flushPromises()
    expect(library.entries).toHaveLength(0)
    wrapper.unmount()
  })

  it('ne montre pas ce menu dans le montage, où un clic pose le composant', async () => {
    const wrapper = mount(LibraryPanel, { props: { mode: 'place' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.item').trigger('contextmenu', { clientX: 40, clientY: 60 })
    expect(document.body.querySelector('.context-menu')).toBeNull()
    wrapper.unmount()
  })
})
