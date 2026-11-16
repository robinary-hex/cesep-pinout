// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyDiagram,
  createEmptyProject,
  dataUrlToBase64,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  serializeDiagram,
  serializeProject,
  serializeSettings
} from '@/domain'
import { pngHeaderDataUrl } from '@/domain/testing/pngHeader'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { useDiagramStore } from '@/features/diagram-editor/store'
import { useLibraryStore } from '@/features/library/store'
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
  // Chaque test part d'une machine neuve : pas de session d'un test précédent à rouvrir.
  localStorage.clear()
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
    expect(document.body.querySelector('.sheet.shown')?.textContent).toContain('Tracer un lien')
    // Les onglets de l'aide portent le nom des modes, dans l'ordre de leurs boutons.
    const tabs = [...document.body.querySelectorAll('.tabs button')]
    const names = tabs.map((tab) => tab.textContent?.trim())
    expect(names).toEqual(['Composants', 'Montage', 'Diagramme'])
    expect(wrapper.findAll('.modes button').map((button) => button.attributes('title'))).toEqual(
      names
    )
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

describe('image déposée dans la fenêtre', () => {
  /** Dépose des fichiers dans la fenêtre : ici, des objets qui portent leur chemin. */
  function drop(...paths: string[]): void {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: paths.map((path) => ({ path })), types: ['Files'] }
    })
    window.dispatchEvent(event)
  }

  it('en mode Composants, s’ajoute au composant affiché ; ailleurs, dit où la déposer', async () => {
    fs.binaries.set('C:/images/led.png', dataUrlToBase64(pngHeaderDataUrl(160, 240)))
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const editor = useComponentEditorStore()
    const schematic = useSchematicStore()
    // Dans le montage : rien n'est ajouté, la barre d'état explique.
    drop('C:/images/led.png')
    await flushPromises()
    expect(editor.doc.visual.primitives).toHaveLength(0)
    expect(schematic.status).toContain('éditeur de composants')
    expect(wrapper.find('.schematic-wrap').exists()).toBe(true)

    await wrapper.findAll('.modes button')[0]?.trigger('click')
    drop('C:/images/led.png')
    await flushPromises()
    expect(editor.doc.visual.primitives[0]).toMatchObject({ kind: 'image', w: 8, h: 12 })
    expect(editor.status).toContain('160 × 240 px')
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

describe('session : ce qui était ouvert revient au lancement suivant', () => {
  const A = 'C:/Docs/a.pinout'
  const B = 'C:/Docs/b.pinout'
  const D = 'C:/Docs/d.pinuml'

  it('rouvre les documents qui ont un fichier, l’onglet et le mode qu’on regardait', async () => {
    await fs.writeTextFile(A, serializeProject(createEmptyProject('A', DEFAULT_PROFILE)))
    await fs.writeTextFile(B, serializeProject(createEmptyProject('B', DEFAULT_PROFILE)))
    await fs.writeTextFile(D, serializeDiagram(createEmptyDiagram('D')))

    // Première fois : deux montages, un montage jamais enregistré, un diagramme ; on regarde A.
    const first = mount(App, { attachTo: document.body })
    await flushPromises()
    const schematic = useSchematicStore()
    await schematic.openPath(A)
    await schematic.openPath(B)
    schematic.newProject()
    const tabA = schematic.tabs.find((tab) => tab.filePath === A)
    if (tabA) schematic.activateTab(tabA.id)
    await useDiagramStore().openPath(D)
    await first.findAll('.modes button')[2]?.trigger('click')
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('pinout.session') ?? 'null')).toEqual({
      mode: 'diagram',
      schematic: { paths: [A, B], active: A },
      diagram: { paths: [D], active: D },
      components: { paths: [], active: null }
    })
    first.unmount()
    document.body.innerHTML = ''

    // Entre-temps, B a été supprimé du disque. Lancement suivant : tout repart de zéro.
    fs.texts.delete(B)
    setActivePinia(createPinia())
    const second = mount(App, { attachTo: document.body })
    await flushPromises()
    const reopened = useSchematicStore()
    // A revient ; B, disparu, est passé sans histoire ; le montage jamais enregistré ne revient pas.
    expect(reopened.tabs.map((tab) => tab.filePath)).toEqual([A])
    expect(reopened.status).not.toContain('impossible')
    expect(useDiagramStore().tabs.map((tab) => tab.filePath)).toEqual([D])
    expect(second.find('.diagram-wrap').exists()).toBe(true)
    // La session retenue est maintenant celle-là.
    expect(JSON.parse(localStorage.getItem('pinout.session') ?? 'null')).toMatchObject({
      schematic: { paths: [A], active: A }
    })
    second.unmount()
    document.body.innerHTML = ''
  })

  it('démarre comme avant quand rien n’était ouvert, ou sans session gardée', async () => {
    localStorage.setItem('pinout.session', 'pas du JSON')
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.findAll('.doc-tab').map((tab) => tab.text())).toEqual(['Nouveau montage ✕'])
    expect(wrapper.find('.schematic-wrap').exists()).toBe(true)
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('le dossier par défaut a changé de place : l’annonce, puis la session rouverte de là', async () => {
    fs.presetDataDir = null
    fs.oneDrive = 'D:/OneDrive'
    const course = 'D:/OneDrive/(Cours)/Robotique/(Ressources)/Pinout'
    const target = 'D:/OneDrive/(Pinout)'
    const montage = serializeProject(createEmptyProject('Feu', DEFAULT_PROFILE))
    // La machine est réglée sur l'ancien dossier par défaut ; tout a été copié dans le nouveau.
    await fs.writeTextFile(
      'C:/fake/Pinout/settings.json',
      serializeSettings({
        ...DEFAULT_SETTINGS,
        dataDir: '${OneDrive}/(Cours)/Robotique/(Ressources)/Pinout'
      })
    )
    for (const root of [course, target]) {
      await fs.writeTextFile(
        `${root}/Applications/parametres.json`,
        serializeSettings(DEFAULT_SETTINGS)
      )
      await fs.writeTextFile(`${root}/Montages/feu.pinout`, montage)
    }
    await fs.writeTextFile(A, serializeProject(createEmptyProject('A', DEFAULT_PROFILE)))
    // La dernière fois, on regardait un montage de l'ancien dossier et un autre, d'ailleurs.
    localStorage.setItem(
      'pinout.session',
      JSON.stringify({
        mode: 'schematic',
        schematic: { paths: [`${course}/Montages/feu.pinout`, A], active: A },
        diagram: { paths: [], active: null },
        components: { paths: [], active: null }
      })
    )
    const dialog = (): Element | null => document.body.querySelector('[role="dialog"]')
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    // L'application le dit une fois, avant de rouvrir quoi que ce soit.
    expect(dialog()?.getAttribute('aria-label')).toBe('Dossier de Pinout')
    expect(dialog()?.textContent).toContain('Pinout range maintenant ses fichiers dans un autre')
    expect(dialog()?.textContent).toContain(target)
    expect(dialog()?.textContent).toContain(course)
    expect(useSchematicStore().tabs.map((tab) => tab.filePath)).toEqual([null])
    const ok = [...document.body.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'OK'
    )
    ok?.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    // Le montage de l'ancien dossier se rouvre depuis le nouveau ; l'autre, de là où il est.
    const schematic = useSchematicStore()
    expect(schematic.tabs.map((tab) => tab.filePath)).toEqual([`${target}/Montages/feu.pinout`, A])
    expect(schematic.filePath).toBe(A)
    expect(useLibraryStore().dataRoot).toBe(target)
    wrapper.unmount()
    document.body.innerHTML = ''

    // Lancement suivant : plus d'annonce.
    setActivePinia(createPinia())
    const second = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(useSchematicStore().tabs.map((tab) => tab.filePath)).toEqual([
      `${target}/Montages/feu.pinout`,
      A
    ])
    second.unmount()
    document.body.innerHTML = ''
  })

  it('au premier lancement, demande le dossier de Pinout avant tout le reste', async () => {
    fs.presetDataDir = null
    const button = (text: string): HTMLButtonElement => {
      const found = [...document.body.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === text
      )
      if (!found) throw new Error(`bouton « ${text} » introuvable`)
      return found
    }
    const dialog = (): Element | null => document.body.querySelector('[role="dialog"]')
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(dialog()?.getAttribute('aria-label')).toBe('Dossier de Pinout')
    // Le dossier proposé, et ce qu'il contiendra.
    expect(dialog()?.textContent).toContain('C:/fake/Documents/Pinout')
    for (const name of ['Composants', 'Montages', 'Diagrammes', 'Applications']) {
      expect(dialog()?.textContent).toContain(name)
    }
    // Elle attend un choix : pas de croix, et Échap ne la ferme pas.
    expect(dialog()?.querySelector('button.close')).toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(dialog()).not.toBeNull()
    // Rien n'est écrit tant qu'on n'a pas choisi ; annuler le choix d'un dossier laisse la boîte.
    expect(fs.texts.size).toBe(0)
    button('Choisir un autre dossier…').click()
    await flushPromises()
    expect(dialog()).not.toBeNull()
    expect(fs.texts.size).toBe(0)
    button('Utiliser ce dossier').click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(await fs.pathExists('C:/fake/Documents/Pinout/Applications/parametres.json')).toBe(true)
    expect(await fs.pathExists('C:/fake/Documents/Pinout/Montages')).toBe(true)
    // L'application a continué son démarrage.
    expect(wrapper.findAll('.doc-tab').map((tab) => tab.text())).toEqual(['Nouveau montage ✕'])
    wrapper.unmount()
    document.body.innerHTML = ''

    // Au lancement suivant, plus de question.
    setActivePinia(createPinia())
    const second = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(dialog()).toBeNull()
    second.unmount()
    document.body.innerHTML = ''
  })

  it('range un nouveau montage dans le dossier Montages du dossier de Pinout', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const store = useSchematicStore()
    store.addWire([
      [0, 0],
      [4, 0]
    ])
    fs.saveDialogAnswers.push('C:/fake/Donnees/Montages/essai.pinout')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await flushPromises()
    // Le dialogue s'ouvre dans Montages ; le fichier y est écrit.
    expect(fs.saveDialogCalls.at(-1)?.defaultPath).toBe(
      'C:/fake/Donnees/Montages/nouveau-montage.pinout'
    )
    expect(await fs.pathExists('C:/fake/Donnees/Montages/essai.pinout')).toBe(true)
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

describe('mise à jour : le bouton et la recherche à la demande', () => {
  const button = (wrapper: ReturnType<typeof mount>): string | null => {
    const found = wrapper.find('button.update')
    return found.exists() ? found.text() : null
  }

  it('montre la mise à jour annoncée avant que la fenêtre n’écoute, puis suit les annonces', async () => {
    // GitHub a répondu pendant que la fenêtre s'ouvrait : l'annonce est partie dans le vide, mais
    // le principal l'a gardée, et la fenêtre la redemande en se mettant à l'écoute.
    fs.updateStatus = { state: 'available', version: '9.9.9' }
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(button(wrapper)).toBe('Mise à jour 9.9.9 : télécharger')
    fs.sendUpdateStatus({ state: 'downloading', percent: 40 })
    await flushPromises()
    expect(button(wrapper)).toBe('Téléchargement 40 %')
    fs.sendUpdateStatus({ state: 'downloaded', version: '9.9.9' })
    await flushPromises()
    expect(button(wrapper)).toBe('Installer 9.9.9 et relancer')
    wrapper.unmount()
    document.body.innerHTML = ''

    // Rien à faire : pas de bouton.
    setActivePinia(createPinia())
    fs.updateStatus = null
    const idle = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(button(idle)).toBeNull()
    idle.unmount()
    document.body.innerHTML = ''
  })

  it('menu Fichier : la version qui tourne, et « Rechercher une mise à jour »', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const dialog = (): Element | null => document.body.querySelector('[role="dialog"]')
    const ok = (): void => {
      const found = [...document.body.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === 'OK'
      )
      found?.click()
    }
    const search = async (): Promise<void> => {
      await wrapper.get('button.menu-button').trigger('click')
      await flushPromises()
      menuEntry('Rechercher une mise à jour').click()
      await flushPromises()
    }
    await wrapper.get('button.menu-button').trigger('click')
    await flushPromises()
    // La version de l'application est dite au-dessus de l'entrée.
    const headings = [...document.body.querySelectorAll('.context-menu .heading')].map((heading) =>
      heading.textContent?.trim()
    )
    expect(headings).toContain('Pinout 1.2.3')
    expect(menuLabels()).toContain('Rechercher une mise à jour')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    // À jour : la boîte le dit, pas de bouton.
    fs.updateCheck = { outcome: 'none', version: '1.2.3' }
    await search()
    expect(dialog()?.getAttribute('aria-label')).toBe('Mise à jour')
    expect(dialog()?.textContent).toContain('Pinout 1.2.3 est à jour.')
    ok()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(button(wrapper)).toBeNull()

    // Une version plus récente : la boîte le dit et le bouton apparaît, même si son annonce
    // s'était perdue.
    fs.updateCheck = { outcome: 'available', version: '1.3.0' }
    fs.updateStatus = { state: 'available', version: '1.3.0' }
    await search()
    expect(dialog()?.textContent).toContain('La version 1.3.0 est disponible.')
    ok()
    await flushPromises()
    expect(button(wrapper)).toBe('Mise à jour 1.3.0 : télécharger')

    // Hors ligne : la raison, et la promesse de réessayer.
    fs.updateCheck = { outcome: 'failed', message: 'net::ERR_INTERNET_DISCONNECTED' }
    await search()
    expect(dialog()?.textContent).toContain('n’a pas abouti')
    expect(dialog()?.textContent).toContain('net::ERR_INTERNET_DISCONNECTED')
    ok()
    await flushPromises()
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

describe('menu Fichier : fichiers récents', () => {
  it('retire un fichier de la liste par sa croix, sans fermer le menu ni toucher au fichier', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const library = useLibraryStore()
    const files = [
      'C:/fake/Donnees/Montages/pompe.pinout',
      'C:/fake/Donnees/Diagrammes/sonos.pinuml',
      'C:/fake/Donnees/Montages/alarme.pinout'
    ]
    for (const file of files) {
      await fs.writeTextFile(file, '{}')
      await library.addRecentFile(file)
    }
    const crosses = (): HTMLButtonElement[] => [
      ...document.body.querySelectorAll<HTMLButtonElement>('.context-menu .remove')
    ]
    /** Fichiers récents du menu ouvert : les entrées qui portent une croix. */
    const recents = (): string[] =>
      crosses().map((cross) => cross.parentElement?.querySelector('.label')?.textContent ?? '')
    const burger = wrapper.get('button.menu-button')
    await burger.trigger('click')
    await flushPromises()
    // En montage : les montages récents, le dernier ouvert d'abord, une croix chacun.
    expect(recents()).toEqual(['alarme.pinout', 'pompe.pinout'])
    expect(crosses()[0]?.title).toBe('Retirer de la liste des fichiers récents')
    crosses()[0]?.click()
    await flushPromises()
    // Le menu reste ouvert, sans l'entrée ; le fichier existe toujours, le diagramme reste listé.
    expect(recents()).toEqual(['pompe.pinout'])
    expect(menuLabels()).toContain('Quitter')
    expect(library.recentFiles).toEqual([files[1], files[0]])
    expect(await fs.pathExists(files[2] ?? '')).toBe(true)
    crosses()[0]?.click()
    await flushPromises()
    expect(recents()).toEqual([])
    expect(menuLabels()).toContain('Aucun projet récent')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    // En diagramme : les siens. En composants : pas de liste de récents, donc pas de croix.
    await wrapper.get('.modes button[title="Diagramme"]').trigger('click')
    await burger.trigger('click')
    await flushPromises()
    expect(recents()).toEqual(['sonos.pinuml'])
    crosses()[0]?.click()
    await flushPromises()
    expect(library.recentFiles).toEqual([])
    expect(menuLabels()).toContain('Aucun diagramme récent')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    await wrapper.get('.modes button[title="Composants"]').trigger('click')
    await burger.trigger('click')
    await flushPromises()
    expect(menuLabels()).toContain('Nouveau composant')
    expect(crosses()).toEqual([])
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
