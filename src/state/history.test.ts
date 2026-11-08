import { describe, expect, it } from 'vitest'
import { History } from './history'

interface Doc {
  name: string
  items: number[]
}

describe('historique par patches', () => {
  it('applique, annule et rétablit en gardant les libellés', () => {
    const history = new History<Doc>({ name: 'a', items: [] })
    expect(history.apply('Ajouter 1', (d) => void d.items.push(1))).toBe(true)
    expect(history.apply('Renommer', (d) => void (d.name = 'b'))).toBe(true)
    expect(history.value).toEqual({ name: 'b', items: [1] })
    expect(history.undoLabel).toBe('Renommer')

    expect(history.undo()).toBe('Renommer')
    expect(history.value).toEqual({ name: 'a', items: [1] })
    expect(history.redoLabel).toBe('Renommer')

    expect(history.undo()).toBe('Ajouter 1')
    expect(history.value).toEqual({ name: 'a', items: [] })
    expect(history.undo()).toBeNull()

    expect(history.redo()).toBe('Ajouter 1')
    expect(history.redo()).toBe('Renommer')
    expect(history.redo()).toBeNull()
    expect(history.value).toEqual({ name: 'b', items: [1] })
  })

  it('ignore une commande qui ne change rien', () => {
    const history = new History<Doc>({ name: 'a', items: [] })
    expect(history.apply('Rien', (d) => void (d.name = 'a'))).toBe(false)
    expect(history.canUndo).toBe(false)
  })

  it('vide le rétablissement après une nouvelle commande', () => {
    const history = new History<Doc>({ name: 'a', items: [] })
    history.apply('Un', (d) => void d.items.push(1))
    history.undo()
    history.apply('Deux', (d) => void d.items.push(2))
    expect(history.canRedo).toBe(false)
    expect(history.value.items).toEqual([2])
  })

  it('produit un nouvel objet à chaque commande, sans toucher l’ancien', () => {
    const initial: Doc = { name: 'a', items: [] }
    const history = new History<Doc>(initial)
    history.apply('Un', (d) => void d.items.push(1))
    expect(history.value).not.toBe(initial)
    expect(initial.items).toEqual([])
    expect(Object.isFrozen(history.value)).toBe(true)
  })

  it('borne la profondeur de l’historique', () => {
    const history = new History<Doc>({ name: 'a', items: [] }, 3)
    for (let i = 0; i < 5; i++) history.apply(`n°${i}`, (d) => void d.items.push(i))
    let undone = 0
    while (history.undo() !== null) undone++
    expect(undone).toBe(3)
  })

  it('repart de zéro après reset', () => {
    const history = new History<Doc>({ name: 'a', items: [] })
    history.apply('Un', (d) => void d.items.push(1))
    history.reset({ name: 'z', items: [9] })
    expect(history.value).toEqual({ name: 'z', items: [9] })
    expect(history.canUndo).toBe(false)
  })
})
