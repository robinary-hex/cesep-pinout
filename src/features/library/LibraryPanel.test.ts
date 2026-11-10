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
import { menuEntry, menuLabels, rightClick } from '@/ui/testing/menus'
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

/** Bouton d'une boîte de saisie ouverte dans le panneau. */
function promptButton(wrapper: ReturnType<typeof mount>, text: string): HTMLButtonElement {
  const found = wrapper.findAll('[role="dialog"] button').find((button) => button.text() === text)
  if (!found) throw new Error(`bouton « ${text} » introuvable`)
  return found.element as HTMLButtonElement
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

  it('au clic droit sur un composant, dans l’éditeur : ouvrir, dupliquer, renommer, catégorie, supprimer', async () => {
    const editor = useComponentEditorStore()
    const library = useLibraryStore()
    const wrapper = mount(LibraryPanel, { props: { mode: 'edit' }, attachTo: document.body })
    await flushPromises()
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.item').element, 40, 60)
      await flushPromises()
    }
    await open()
    expect(menuLabels()).toEqual([
      'Ouvrir',
      'Dupliquer',
      'Renommer…',
      'Catégorie…',
      'Afficher dans l’Explorateur',
      'Supprimer…'
    ])
    // Dupliquer : une copie non enregistrée s'ouvre dans un onglet.
    menuEntry('Dupliquer').click()
    await flushPromises()
    expect(document.body.querySelector('.context-menu')).toBeNull()
    expect(editor.doc.name).toBe('LED (copie)')
    expect(editor.folder).toBeNull()
    await open()
    menuEntry('Afficher dans l’Explorateur').click()
    expect(fs.shownInFolder).toEqual([`${library.libraryDir}/led`])
    // Supprimer : la question d'abord ; annulée, rien ne change.
    await open()
    menuEntry('Supprimer…').click()
    await flushPromises()
    expect(dialogs.asked.at(-1)?.title).toBe('Supprimer le composant ?')
    expect(library.entries).toHaveLength(1)
    dialogs.answers.push(true)
    await open()
    menuEntry('Supprimer…').click()
    await flushPromises()
    expect(library.entries).toHaveLength(0)
    wrapper.unmount()
  })

  it('renomme ou change de catégorie dans le fichier, ou dans l’onglet si le composant est ouvert', async () => {
    const editor = useComponentEditorStore()
    const library = useLibraryStore()
    const wrapper = mount(LibraryPanel, { props: { mode: 'edit' }, attachTo: document.body })
    await flushPromises()
    const choose = async (text: string, value: string): Promise<void> => {
      rightClick(wrapper.get('.item').element, 40, 60)
      await flushPromises()
      menuEntry(text).click()
      await flushPromises()
      await wrapper.get('.prompt input').setValue(value)
      promptButton(wrapper, 'OK').click()
      await flushPromises()
    }
    // Pas ouvert : le fichier est réécrit, le dossier garde son nom.
    await choose('Renommer…', 'DEL verte')
    expect(library.entries[0]?.def?.name).toBe('DEL verte')
    expect(library.entries[0]?.folder).toBe(`${library.libraryDir}/led`)
    await choose('Catégorie…', 'Opto')
    expect(library.entries[0]?.def?.category).toBe('Opto')
    expect(library.groups.map((group) => group.name)).toEqual(['Opto'])
    // Ouvert dans un onglet : c'est le document qu'on modifie, il reste à enregistrer.
    const entry = library.entries[0]
    if (!entry?.def) throw new Error('composant attendu')
    editor.open(entry.def, entry.folder)
    await choose('Renommer…', 'DEL rouge')
    expect(editor.doc.name).toBe('DEL rouge')
    expect(editor.dirty).toBe(true)
    expect(library.entries[0]?.def?.name).toBe('DEL verte')
    wrapper.unmount()
  })

  it('dans le montage : poser, ou modifier dans l’éditeur de composants', async () => {
    const editor = useComponentEditorStore()
    const library = useLibraryStore()
    const wrapper = mount(LibraryPanel, { props: { mode: 'place' }, attachTo: document.body })
    await flushPromises()
    rightClick(wrapper.get('.item').element, 40, 60)
    await flushPromises()
    expect(menuLabels()).toEqual([
      'Poser sur le montage',
      'Modifier dans l’éditeur de composants',
      'Afficher dans l’Explorateur'
    ])
    menuEntry('Modifier dans l’éditeur de composants').click()
    await flushPromises()
    expect(editor.folder).toBe(`${library.libraryDir}/led`)
    expect(wrapper.emitted('edit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('dans le vide de la liste : nouveau composant, liste ou grille, dossier', async () => {
    const editor = useComponentEditorStore()
    const library = useLibraryStore()
    editor.addPrimitive({ kind: 'dot', x: 4, y: 4, scale: 1, color: '#000000' }, 'Ajouter un point')
    const wrapper = mount(LibraryPanel, { props: { mode: 'edit' }, attachTo: document.body })
    await flushPromises()
    const open = async (): Promise<void> => {
      rightClick(wrapper.get('.list').element, 40, 300)
      await flushPromises()
    }
    await open()
    expect(menuLabels()).toEqual([
      'Nouveau composant',
      'Liste',
      'Grille',
      'Changer de dossier…',
      'Afficher le dossier dans l’Explorateur'
    ])
    menuEntry('Grille').click()
    await flushPromises()
    expect(library.libraryView).toBe('grid')
    expect(wrapper.find('.tile').exists()).toBe(true)
    await open()
    menuEntry('Nouveau composant').click()
    await flushPromises()
    expect(editor.tabs).toHaveLength(2)
    expect(wrapper.emitted('edit')).toHaveLength(1)
    wrapper.unmount()
  })
})
