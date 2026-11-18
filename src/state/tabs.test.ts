import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useDocumentTabs } from './tabs'

interface Note {
  name: string
  lines: string[]
}

/** Petit éditeur de test : un document à lignes, et un curseur comme état d'édition par onglet. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function editor() {
  const cursor = ref(0)
  const left: string[] = []
  const tabs = useDocumentTabs<Note, { cursor: number }>({
    blank: () => ({ name: 'Sans titre', lines: [] }),
    needsSaving: (doc, saved, path) => doc !== saved && !(path === null && doc.lines.length === 0),
    freshEditing: () => ({ cursor: 0 }),
    capture: () => ({ cursor: cursor.value }),
    restore: (editing) => {
      cursor.value = editing.cursor
    },
    beforeLeave: () => {
      left.push(tabs.doc.value.name)
    }
  })
  const add = (line: string): boolean =>
    tabs.apply(`Ajouter ${line}`, (draft) => {
      draft.lines.push(line)
    })
  return { tabs, cursor, left, add }
}

describe('onglets de documents', () => {
  it('part d’un onglet vierge, que le premier document ouvert remplace', () => {
    const { tabs } = editor()
    expect(tabs.tabs.value).toEqual([
      { id: 1, name: 'Sans titre', path: null, dirty: false, preview: false }
    ])
    expect(tabs.pristine.value).toBe(true)
    const opened = { name: 'Liste', lines: ['a'] }
    tabs.showInTab(opened, opened, 'C:/liste.txt')
    expect(tabs.tabs.value.map((tab) => [tab.name, tab.path, tab.dirty])).toEqual([
      ['Liste', 'C:/liste.txt', false]
    ])
    expect(tabs.pristine.value).toBe(false)
  })

  it('range et retrouve document, historique et état d’édition de chaque onglet', () => {
    const { tabs, cursor, add } = editor()
    add('un')
    cursor.value = 7
    const first = tabs.activeTabId.value
    tabs.showBlank()
    expect(tabs.tabs.value).toHaveLength(2)
    expect(cursor.value).toBe(0)
    add('deux')
    expect(tabs.activateTab(first)).toBe(true)
    expect(tabs.doc.value.lines).toEqual(['un'])
    expect(cursor.value).toBe(7)
    expect(tabs.undoLabel.value).toBe('Ajouter un')
    // Chaque onglet annule ses propres commandes.
    expect(tabs.undo()).toBe('Ajouter un')
    expect(tabs.doc.value.lines).toEqual([])
    tabs.cycleTab(1)
    expect(tabs.doc.value.lines).toEqual(['deux'])
    expect(tabs.activateTab(tabs.activeTabId.value)).toBe(false)
  })

  it('ne compte comme modifié que ce qui a quelque chose à enregistrer', () => {
    const { tabs, add } = editor()
    add('un')
    expect(tabs.dirty.value).toBe(true)
    tabs.undo()
    // Jamais enregistré et vide : rien à enregistrer, mais plus vierge pour autant.
    expect(tabs.dirty.value).toBe(false)
    expect(tabs.pristine.value).toBe(false)
    tabs.redo()
    tabs.markSaved('C:/a.txt')
    expect(tabs.dirty.value).toBe(false)
    expect(tabs.anyDirty.value).toBe(false)
    tabs.showBlank()
    add('deux')
    expect(tabs.tabs.value.map((tab) => tab.dirty)).toEqual([false, true])
    expect(tabs.unsavedDocuments()).toEqual([
      { key: tabs.activeTabId.value, doc: { name: 'Sans titre', lines: ['deux'] }, path: null }
    ])
  })

  it('ferme un onglet rangé sans bouger, et l’onglet affiché au profit de son voisin', () => {
    const { tabs, add } = editor()
    add('un')
    const first = tabs.activeTabId.value
    tabs.showBlank()
    add('deux')
    const second = tabs.activeTabId.value
    tabs.showBlank()
    add('trois')
    expect(tabs.closeTab(first)).toBe(true)
    expect(tabs.doc.value.lines).toEqual(['trois'])
    expect(tabs.closeTab(tabs.activeTabId.value)).toBe(true)
    expect(tabs.activeTabId.value).toBe(second)
    expect(tabs.doc.value.lines).toEqual(['deux'])
    // Fermer le dernier laisse un document vierge.
    tabs.closeTab(second)
    expect(tabs.tabs.value).toHaveLength(1)
    expect(tabs.pristine.value).toBe(true)
    expect(tabs.closeTab(999)).toBe(false)
  })

  it('réordonne les onglets et prévient avant de quitter l’onglet affiché', () => {
    const { tabs, left, add } = editor()
    add('un')
    const first = tabs.activeTabId.value
    tabs.showBlank()
    add('deux')
    tabs.showBlank()
    const ids = tabs.tabs.value.map((tab) => tab.id)
    tabs.moveTab(first, 2)
    expect(tabs.tabs.value.map((tab) => tab.id)).toEqual([ids[1], ids[2], ids[0]])
    tabs.activateTab(first)
    expect(left).toHaveLength(3)
  })

  it('agit sur les onglets rangés et remet à neuf le document affiché', () => {
    const { tabs, add } = editor()
    add('un')
    tabs.showBlank()
    tabs.updateStashedTabs((tab) => {
      tab.history.apply('Renommer', (draft) => {
        draft.name = 'Renommé'
      })
      return { ...tab }
    })
    expect(tabs.tabs.value.map((tab) => tab.name)).toEqual(['Renommé', 'Sans titre'])
    const fresh = { name: 'Neuf', lines: [] }
    tabs.reset(fresh, fresh)
    expect(tabs.doc.value).toBe(fresh)
    expect(tabs.undoLabel.value).toBeNull()
    expect(tabs.pristine.value).toBe(true)
  })
})

describe('onglets de documents : l’onglet d’aperçu', () => {
  const note = (name: string): Note => ({ name, lines: [name] })
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function opened() {
    const { tabs, add } = editor()
    /** Ouvre un document enregistré ; `glance` : en aperçu. */
    const open = (name: string, glance = false): void => {
      const doc = note(name)
      tabs.showInTab(doc, doc, `C:/${name}.txt`, glance)
    }
    const strip = (): [string, boolean][] => tabs.tabs.value.map((tab) => [tab.name, tab.preview])
    return { tabs, add, open, strip }
  }

  it('un aperçu prend la place de l’aperçu précédent ; gardé, il reste', () => {
    const { tabs, open, strip } = opened()
    // Le premier prend la place de l'onglet vierge du départ.
    open('A', true)
    expect(strip()).toEqual([['A', true]])
    open('B', true)
    expect(strip()).toEqual([['B', true]])
    // Gardé (un double-clic) : le suivant s'ouvre à côté.
    tabs.pinTab(tabs.activeTabId.value)
    open('C', true)
    expect(strip()).toEqual([
      ['B', false],
      ['C', true]
    ])
    // Un document ouvert pour de bon ne prend pas la place d'un aperçu.
    open('D')
    expect(strip()).toEqual([
      ['B', false],
      ['C', true],
      ['D', false]
    ])
    // L'aperçu n'est plus l'onglet affiché : le suivant le remplace là où il est, et passe devant.
    open('E', true)
    expect(strip()).toEqual([
      ['B', false],
      ['E', true],
      ['D', false]
    ])
    expect(tabs.doc.value.name).toBe('E')
    // Un aperçu rangé se garde aussi (double-clic sur son onglet depuis un autre).
    const glance = tabs.activeTabId.value
    tabs.activateTab(tabs.tabs.value[0]?.id ?? 0)
    tabs.pinTab(glance)
    expect(strip()).toEqual([
      ['B', false],
      ['E', false],
      ['D', false]
    ])
  })

  it('une modification ou un enregistrement garde l’onglet', () => {
    const { tabs, add, open, strip } = opened()
    open('A', true)
    add('x')
    expect(strip()).toEqual([['A', false]])
    // Annuler ne le rend pas à l'aperçu : on y a touché.
    tabs.undo()
    expect(strip()).toEqual([['A', false]])
    open('B', true)
    tabs.markSaved('C:/b2.txt')
    expect(strip()).toEqual([
      ['A', false],
      ['B', false]
    ])
    // Un aperçu qu'on quitte puis retrouve reste un aperçu.
    open('C', true)
    const glance = tabs.activeTabId.value
    tabs.activateTab(tabs.tabs.value[0]?.id ?? 0)
    tabs.activateTab(glance)
    expect(strip().at(-1)).toEqual(['C', true])
  })
})
