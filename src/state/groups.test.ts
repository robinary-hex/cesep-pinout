import { beforeEach, describe, expect, it } from 'vitest'
import { ref, type Ref } from 'vue'
import { useGroups, type DocumentGroups, type GroupedElement } from './groups'

// Un petit document de deux sortes d'éléments, et une commande qui réécrit leurs groupes.

let nodes: Ref<GroupedElement[]>
let links: Ref<GroupedElement[]>
let selectedNodes: Ref<string[]>
let selectedLinks: Ref<string[]>
let commands: string[]
let grouping: DocumentGroups<'node' | 'link'>

beforeEach(() => {
  nodes = ref([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }])
  links = ref([{ id: 'l1' }])
  selectedNodes = ref([])
  selectedLinks = ref([])
  commands = []
  grouping = useGroups({
    kinds: {
      node: { elements: () => nodes.value, selected: selectedNodes },
      link: { elements: () => links.value, selected: selectedLinks }
    },
    write: (label, change) => {
      commands.push(label)
      for (const [kind, list] of [
        ['node', nodes],
        ['link', links]
      ] as const) {
        list.value = list.value.map((element) => {
          const next = change(kind, element)
          if (next === null) return element
          return next === undefined ? { id: element.id } : { id: element.id, group: next }
        })
      }
    }
  })
})

/** Groupe n1, n2 et l1. */
function groupFirst(): void {
  selectedNodes.value = ['n1', 'n2']
  selectedLinks.value = ['l1']
  grouping.groupSelection()
}

describe('groupes d’un document', () => {
  it('fait un groupe de la sélection, en une commande nommée', () => {
    selectedNodes.value = ['n1', 'n2']
    selectedLinks.value = ['l1']
    expect(grouping.canGroup.value).toBe(true)
    expect(grouping.canUngroup.value).toBe(false)
    expect(grouping.groupSelection()).toBe(true)
    expect(commands).toEqual(['Grouper'])
    expect(grouping.groups.value).toEqual([
      { id: 'g1', members: { node: ['n1', 'n2'], link: ['l1'] } }
    ])
    expect(grouping.hasGroups.value).toBe(true)
    // La sélection est déjà exactement ce groupe : plus rien à grouper.
    expect(grouping.canGroup.value).toBe(false)
    expect(grouping.canUngroup.value).toBe(true)
  })

  it('ne groupe pas un élément seul', () => {
    selectedNodes.value = ['n3']
    expect(grouping.canGroup.value).toBe(false)
    expect(grouping.groupSelection()).toBe(false)
    expect(commands).toEqual([])
  })

  it('un clic sur un membre emmène le groupe ; le désélectionner retire tout le groupe', () => {
    groupFirst()
    selectedNodes.value = ['n1']
    selectedLinks.value = []
    grouping.syncGroupSelection('node', 'n1')
    expect([selectedNodes.value, selectedLinks.value]).toEqual([['n1', 'n2'], ['l1']])
    // Maj+clic sur le lien : il sort de la sélection, son groupe avec lui.
    selectedLinks.value = []
    grouping.syncGroupSelection('link', 'l1')
    expect([selectedNodes.value, selectedLinks.value]).toEqual([[], []])
    // Un élément libre ne change rien.
    selectedNodes.value = ['n3']
    grouping.syncGroupSelection('node', 'n3')
    expect(selectedNodes.value).toEqual(['n3'])
  })

  it('un lasso prend en entier les groupes qu’il touche ; grouper les fond en un seul', () => {
    groupFirst()
    selectedNodes.value = ['n2', 'n3']
    selectedLinks.value = []
    grouping.expandSelectionToGroups()
    expect([selectedNodes.value, selectedLinks.value]).toEqual([['n2', 'n3', 'n1'], ['l1']])
    expect(grouping.canGroup.value).toBe(true)
    grouping.groupSelection()
    expect(grouping.groups.value).toEqual([
      { id: 'g2', members: { node: ['n1', 'n2', 'n3'], link: ['l1'] } }
    ])
  })

  it('défait les groupes que touche la sélection', () => {
    groupFirst()
    selectedNodes.value = ['n2']
    selectedLinks.value = []
    expect(grouping.ungroupSelection()).toBe(true)
    expect(commands).toEqual(['Grouper', 'Dégrouper'])
    expect(grouping.hasGroups.value).toBe(false)
    expect(nodes.value).toEqual([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }])
    expect(grouping.ungroupSelection()).toBe(false)
  })
})
