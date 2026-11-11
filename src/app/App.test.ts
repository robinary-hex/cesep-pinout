// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { setBridge } from '@/io/bridge'
import { FakeFs } from '@/io/testing/fakeFs'
import { menuEntry, menuLabels, rightClick } from '@/ui/testing/menus'
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

  it('ouvre le menu par le bouton à trois barres, à gauche des modes, avant le séparateur', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    // Le bloc gauche (menu et modes) a la largeur du panneau latéral : sa bordure le prolonge.
    const side = wrapper.get('.topbar .topbar-side')
    expect(side.findAll('.modes button')).toHaveLength(3)
    expect(side.find('.doc-tabs').exists()).toBe(false)
    const burger = side.get('button.menu-button')
    expect(burger.text()).toBe('')
    expect(burger.attributes('aria-label')).toBe('Menu')
    await burger.trigger('click')
    await flushPromises()
    expect(menuLabels()).toContain('Nouveau montage')
    expect(menuLabels()).toContain('Quitter')
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('montre l’éditeur de diagrammes, sa bibliothèque de formes et ses onglets', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('.modes button')[2]?.trigger('click')
    expect(wrapper.find('.diagram-wrap').exists()).toBe(true)
    expect(wrapper.find('.schematic-wrap').exists()).toBe(false)
    expect(wrapper.findAll('.library .tile')).toHaveLength(17)
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

  it('au clic droit sur un onglet : enregistrer, montrer le fichier, fermer les autres', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const schematic = useSchematicStore()
    schematic.addLabel(0, 0)
    await flushPromises()
    const open = async (index: number): Promise<void> => {
      rightClick(wrapper.findAll('.doc-tab')[index]?.element ?? document.body, 300, 20)
      await flushPromises()
    }
    await open(0)
    expect(menuLabels()).toEqual([
      'Enregistrer',
      'Enregistrer sous…',
      'Afficher dans l’Explorateur',
      'Fermer',
      'Fermer les autres'
    ])
    // Jamais enregistré : pas de fichier à montrer ; seul onglet : pas d'autres à fermer.
    expect(menuEntry('Afficher dans l’Explorateur').disabled).toBe(true)
    expect(menuEntry('Fermer les autres').disabled).toBe(true)
    // Enregistrer depuis le menu : le dialogue de fichier, puis le fichier se montre.
    fs.saveDialogAnswers.push('C:/Docs/essai.pinout')
    menuEntry('Enregistrer').click()
    await flushPromises()
    expect(schematic.filePath).toBe('C:/Docs/essai.pinout')
    await open(0)
    menuEntry('Afficher dans l’Explorateur').click()
    expect(fs.shownInFolder).toEqual(['C:/Docs/essai.pinout'])
    // Un second onglet, puis « Fermer les autres » depuis le premier.
    await wrapper.get('button[title^="Nouveau montage"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.doc-tab')).toHaveLength(2)
    await open(0)
    menuEntry('Fermer les autres').click()
    await flushPromises()
    expect(wrapper.findAll('.doc-tab')).toHaveLength(1)
    expect(schematic.filePath).toBe('C:/Docs/essai.pinout')
    wrapper.unmount()
  })
})
