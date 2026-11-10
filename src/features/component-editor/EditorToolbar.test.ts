// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dataUrlToBase64 } from '@/domain'
import { pngHeaderDataUrl } from '@/domain/testing/pngHeader'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import EditorToolbar from './EditorToolbar.vue'
import { useComponentEditorStore } from './store'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

describe('barre d’outils de l’éditeur de composants', () => {
  it('importe l’image PNG choisie, posée comme une forme du composant', async () => {
    fs.binaries.set('C:/images/led.png', dataUrlToBase64(pngHeaderDataUrl(160, 240)))
    fs.openDialogAnswers.push('C:/images/led.png')
    const store = useComponentEditorStore()
    const wrapper = mount(EditorToolbar)
    await wrapper.get('button[title^="Importer une image"]').trigger('click')
    await flushPromises()
    expect(store.doc.visual.primitives[0]).toMatchObject({ kind: 'image', w: 8, h: 12 })
    expect(store.doc.size).toEqual({ widthCells: 2, heightCells: 3 })
    expect(store.status).toContain('160 × 240 px')
  })

  it('n’ajoute rien quand le dialogue est annulé ou que le fichier n’est pas un PNG', async () => {
    const store = useComponentEditorStore()
    const wrapper = mount(EditorToolbar)
    const button = wrapper.get('button[title^="Importer une image"]')
    await button.trigger('click')
    await flushPromises()
    expect(store.doc.visual.primitives).toHaveLength(0)
    expect(store.status).toBe('')
    fs.binaries.set(
      'C:/images/faux.png',
      btoa('ceci n’est pas une image, vraiment pas'.normalize('NFD').replace(/[^\x20-\x7e]/g, ''))
    )
    fs.openDialogAnswers.push('C:/images/faux.png')
    await button.trigger('click')
    await flushPromises()
    expect(store.doc.visual.primitives).toHaveLength(0)
    expect(store.status).toMatch(/Import impossible.*PNG/)
  })
})
