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
    expect(tabs.tabs.value).toEqual([{ id: 1, name: 'Sans titre', path: null, dirty: false }])
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
