// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import App from './App.vue'

// Fumée : la coque se monte, passe d'un mode à l'autre et montre l'éditeur, les onglets et la
// bibliothèque de chacun. Le détail des éditeurs est testé à part.

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  setActivePinia(createPinia())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
})

afterEach(() => {
  setBridge(null)
})

describe('coque de l’application', () => {
  it('démarre sur le montage et propose trois modes à pictogramme', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const modes = wrapper.findAll('.modes button')
    expect(modes.map((button) => button.attributes('title'))).toEqual([
      'Composants',
      'Montage',
      'Diagramme'
    ])
    expect(modes[1]?.classes()).toContain('active')
    expect(wrapper.find('.schematic-wrap').exists()).toBe(true)
    expect(wrapper.findAll('.doc-tab').map((tab) => tab.text())).toEqual(['Nouveau montage ✕'])
    wrapper.unmount()
  })

  it('montre l’éditeur de diagrammes, sa bibliothèque de formes et ses onglets', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('.modes button')[2]?.trigger('click')
    expect(wrapper.find('.diagram-wrap').exists()).toBe(true)
    expect(wrapper.find('.schematic-wrap').exists()).toBe(false)
    expect(wrapper.findAll('.library .tile')).toHaveLength(10)
    expect(wrapper.find('.doc-tab-name').text()).toBe('Nouveau diagramme')
    // Un diagramme modifié : son onglet porte le point, puis le bouton du mode quand on le quitte.
    useDiagramStore().addNode('rounded', 0, 0)
    await flushPromises()
    expect(wrapper.find('.doc-tab .doc-tab-dot').exists()).toBe(true)
    expect(fs.dirty).toBe(true)
    await wrapper.findAll('.modes button')[0]?.trigger('click')
    expect(wrapper.findAll('.modes button')[2]?.find('.doc-tab-dot').exists()).toBe(true)
    expect(wrapper.find('.diagram-wrap').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ouvre l’aide sur les raccourcis du mode affiché', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('.modes button')[2]?.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))
    await flushPromises()
    const active = document.body.querySelector('.tabs button.active')
    expect(active?.textContent?.trim()).toBe('Diagramme')
    expect(document.body.textContent).toContain('Tracer un lien')
    wrapper.unmount()
  })

  it('pose « enregistrer avant de quitter ? » dans sa propre boîte, pas celle de Windows', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    useSchematicStore().addLabel(0, 0)
    await flushPromises()
    expect(fs.dirty).toBe(true)
    const choose = async (text: string): Promise<void> => {
      const found = wrapper.findAll('[role="dialog"] button').find((item) => item.text() === text)
      if (!found) throw new Error(`bouton « ${text} » introuvable`)
      await found.trigger('click')
      await flushPromises()
    }
    // Le principal signale la fermeture : le rendu accuse réception et pose la question.
    fs.emitRequest('ask-then-quit')
    await flushPromises()
    expect(fs.quitAskedByRenderer).toBe(true)
    expect(wrapper.get('[role="dialog"]').text()).toContain('Enregistrer avant de quitter ?')
    // Une seconde demande pendant la question n'en ouvre pas une autre.
    fs.emitRequest('ask-then-quit')
    await flushPromises()
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)
    await choose('Annuler')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(fs.quitConfirmed).toBe(false)
    // « Ne pas enregistrer » : la fenêtre peut se fermer.
    fs.emitRequest('ask-then-quit')
    await flushPromises()
    await choose('Ne pas enregistrer')
    expect(fs.quitConfirmed).toBe(true)
    wrapper.unmount()
  })
})
