import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLibraryStore } from '@/features/library/store'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { setDialogResponder } from '@/ui/dialogs'
import { scriptDialogs, type DialogScript } from '@/ui/testing/dialogs'
import { closeComponentTabAsking, saveComponentDoc } from './componentActions'
import { useComponentEditorStore } from './store'

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

describe('fermer un onglet de composant', () => {
  const dot = { kind: 'dot', x: 4, y: 4, scale: 1, color: '#000000' } as const

  it('ferme sans question un composant sans modification', async () => {
    const store = useComponentEditorStore()
    const id = store.activeTabId
    expect(await closeComponentTabAsking(store, useLibraryStore(), id)).toBe(true)
    expect(store.activeTabId).not.toBe(id)
  })

  it('« Annuler » garde l’onglet ; « Ne pas enregistrer » le ferme', async () => {
    const store = useComponentEditorStore()
    store.addPrimitive(dot, 'Ajouter un point')
    dialogs.answers.push('cancel')
    expect(await closeComponentTabAsking(store, useLibraryStore(), store.activeTabId)).toBe(false)
    expect(store.dirty).toBe(true)
    dialogs.answers.push('discard')
    expect(await closeComponentTabAsking(store, useLibraryStore(), store.activeTabId)).toBe(true)
    expect(store.pristine).toBe(true)
  })

  it('« Enregistrer » range le composant dans la bibliothèque puis ferme l’onglet', async () => {
    const store = useComponentEditorStore()
    const library = useLibraryStore()
    await library.init()
    store.setMeta({ name: 'LED' })
    store.addPrimitive(dot, 'Ajouter un point')
    dialogs.answers.push('save')
    expect(await closeComponentTabAsking(store, library, store.activeTabId)).toBe(true)
    expect(fs.texts.get('C:/fake/Donnees/Composants/led/component.json')).toContain('"name": "LED"')
    expect(store.pristine).toBe(true)
  })
})

describe('aperçu du composant dans la bibliothèque', () => {
  it('prend la variante qu’on regarde en enregistrant, et la rouvre telle quelle', async () => {
    const library = useLibraryStore()
    await library.init()
    const store = useComponentEditorStore()
    store.setMeta({ name: 'LED' })
    store.addPin({ x: 0, y: 1 })
    const second = store.addVariant()
    // On regarde la seconde variante : c'est elle que l'aperçu montrera.
    expect(await saveComponentDoc(store, library)).toBe(true)
    const saved = library.entries.find((entry) => entry.def?.name === 'LED')
    expect(saved?.def?.previewVariant).toBe(second)
    // Rouvert depuis la bibliothèque : on retrouve cette variante.
    if (saved?.def) {
      store.closeTab(store.activeTabId)
      store.open(saved.def, saved.folder)
    }
    expect(store.variantId).toBe(second)
    // Enregistré en regardant la variante d'origine : l'aperçu revient à elle.
    store.showVariant('base')
    expect(await saveComponentDoc(store, library)).toBe(true)
    const again = library.entries.find((entry) => entry.def?.name === 'LED')
    expect(again?.def && 'previewVariant' in again.def).toBe(false)
  })
})
