// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dataUrlToBase64 } from '@/domain'
import { pngHeaderDataUrl } from '@/domain/testing/pngHeader'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import EditorToolbar from './EditorToolbar.vue'
import { importImageFile, isImagePath } from './pngImport'
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

describe('image déposée dans l’éditeur de composants', () => {
  it('importe le PNG du fichier donné, comme le bouton Image', async () => {
    fs.binaries.set('C:/images/led.png', dataUrlToBase64(pngHeaderDataUrl(160, 240)))
    const store = useComponentEditorStore()
    await importImageFile(store, 'C:/images/led.png')
    expect(store.doc.visual.primitives[0]).toMatchObject({ kind: 'image', w: 8, h: 12 })
    expect(store.doc.size).toEqual({ widthCells: 2, heightCells: 3 })
    expect(store.status).toContain('160 × 240 px')
    // Une seconde image : par-dessus le dessin, sans changer la taille du composant.
    await importImageFile(store, 'C:/images/led.png')
    expect(store.doc.visual.primitives).toHaveLength(2)
    expect(store.doc.size).toEqual({ widthCells: 2, heightCells: 3 })
  })

  it('refuse une image qui n’est pas un PNG, ou un fichier illisible, sans rien ajouter', async () => {
    const store = useComponentEditorStore()
    expect(isImagePath('C:/images/Photo.JPG')).toBe(true)
    expect(isImagePath('C:/images/led.png')).toBe(true)
    expect(isImagePath('C:/Docs/essai.pinout')).toBe(false)
    await importImageFile(store, 'C:/images/Photo.JPG')
    expect(store.status).toContain('seules les images PNG')
    expect(store.status).toContain('Photo.JPG')
    await importImageFile(store, 'C:/images/absent.png')
    expect(store.status).toMatch(/Import impossible/)
    expect(store.doc.visual.primitives).toHaveLength(0)
  })
})

describe('dossier de la dernière image importée', () => {
  it('le dialogue du bouton Image s’y rouvre, pas dans celui d’une image déposée', async () => {
    localStorage.clear()
    fs.binaries.set('C:/images/led.png', dataUrlToBase64(pngHeaderDataUrl(160, 240)))
    fs.binaries.set('D:/ailleurs/photo.png', dataUrlToBase64(pngHeaderDataUrl(80, 80)))
    fs.openDialogAnswers.push('C:/images/led.png', null, null)
    const store = useComponentEditorStore()
    const wrapper = mount(EditorToolbar)
    const button = wrapper.get('button[title^="Importer une image"]')
    // Première fois : rien de retenu, le dialogue s'ouvre où le système veut.
    await button.trigger('click')
    await flushPromises()
    // Deuxième fois, même annulée : dans le dossier de l'image choisie la première fois.
    await button.trigger('click')
    await flushPromises()
    // Une image déposée depuis un autre dossier ne change pas ce dossier-là.
    await importImageFile(store, 'D:/ailleurs/photo.png')
    await button.trigger('click')
    await flushPromises()
    expect(fs.openDialogCalls.map((options) => options?.defaultPath)).toEqual([
      undefined,
      'C:/images',
      'C:/images'
    ])
    expect(localStorage.getItem('pinout.lastImageDir')).toBe('C:/images')
    localStorage.clear()
  })
})
