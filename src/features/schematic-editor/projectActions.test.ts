import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLibraryStore } from '@/features/library/store'
import { readAutosaves, syncAutosaves } from '@/io/autosave'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { setDialogResponder } from '@/ui/dialogs'
import { scriptDialogs, type DialogScript } from '@/ui/testing/dialogs'
import { closeTabAsking } from './projectActions'
import { useSchematicStore } from './store'

let fs: FakeFs
let dialogs: DialogScript

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  dialogs = scriptDialogs()
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
  setDialogResponder(null)
})

describe('fermer un onglet de montage', () => {
  it('ferme sans question un montage sans modification', async () => {
    const store = useSchematicStore()
    const id = store.activeTabId
    expect(await closeTabAsking(store, useLibraryStore(), id)).toBe(true)
    expect(store.activeTabId).not.toBe(id)
  })

  it('« Annuler » garde l’onglet et ses modifications', async () => {
    const store = useSchematicStore()
    store.setProjectName('Brouillon')
    store.addLabel(0, 0)
    dialogs.answers.push('cancel')
    expect(await closeTabAsking(store, useLibraryStore(), store.activeTabId)).toBe(false)
    expect(store.doc.name).toBe('Brouillon')
  })

  it('« Ne pas enregistrer » ferme et efface la copie de secours du montage', async () => {
    const store = useSchematicStore()
    store.setProjectName('Brouillon')
    store.addLabel(0, 0)
    await syncAutosaves(store.dirtyDocuments())
    expect(await readAutosaves()).toHaveLength(1)
    dialogs.answers.push('discard')
    expect(await closeTabAsking(store, useLibraryStore(), store.activeTabId)).toBe(true)
    expect(store.doc.name).toBe('Nouveau montage')
    expect(await readAutosaves()).toEqual([])
  })

  it('« Enregistrer » écrit le fichier puis ferme ; renoncer au choix du fichier garde l’onglet', async () => {
    const store = useSchematicStore()
    const library = useLibraryStore()
    store.setProjectName('Alim')
    store.addLabel(0, 0)
    dialogs.answers.push('save')
    fs.saveDialogAnswers.push(null)
    expect(await closeTabAsking(store, library, store.activeTabId)).toBe(false)
    expect(store.doc.name).toBe('Alim')

    dialogs.answers.push('save')
    fs.saveDialogAnswers.push('D:/Docs/alim.pinout.json')
    expect(await closeTabAsking(store, library, store.activeTabId)).toBe(true)
    expect(fs.texts.get('D:/Docs/alim.pinout.json')).toContain('"name": "Alim"')
    expect(store.doc.name).toBe('Nouveau montage')
  })

  it('enregistre le montage fermé, même s’il n’était pas affiché', async () => {
    const store = useSchematicStore()
    store.setProjectName('A')
    store.addLabel(0, 0)
    const a = store.activeTabId
    store.newProject()
    store.setProjectName('B')
    dialogs.answers.push('save')
    fs.saveDialogAnswers.push('D:/Docs/a.pinout.json')
    expect(await closeTabAsking(store, useLibraryStore(), a)).toBe(true)
    expect(fs.texts.get('D:/Docs/a.pinout.json')).toContain('"name": "A"')
    expect(store.tabs.map((tab) => tab.name)).toEqual(['B'])
    expect(store.doc.name).toBe('B')
  })
})
