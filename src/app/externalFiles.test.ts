import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyComponent,
  createEmptyProject,
  DEFAULT_PROFILE,
  serializeComponentDefinition,
  serializeProject
} from '@/domain'
import { useComponentEditorStore } from '@/features/component-editor/store'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { setBridge } from '@/io/bridge'
import { saveComponent } from '@/io/library'
import { FakeFs } from '@/io/testing/fakeFs'
import { externalFileKind, openExternalFile } from './externalFiles'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

function stores(): Parameters<typeof openExternalFile>[1] {
  return {
    schematic: useSchematicStore(),
    editor: useComponentEditorStore(),
    library: useLibraryStore()
  }
}

describe('fichiers venus de l’extérieur', () => {
  it('reconnaît un montage ou un composant à son contenu, pas à son nom', () => {
    const project = serializeProject(createEmptyProject('Alim', DEFAULT_PROFILE))
    const component = serializeComponentDefinition(createEmptyComponent('led', 'LED'))
    expect(externalFileKind(project)).toBe('project')
    expect(externalFileKind(component)).toBe('component')
    expect(externalFileKind('{ "autre": 1 }')).toBeNull()
    expect(externalFileKind('pas du JSON')).toBeNull()
  })

  it('ouvre un montage dans un onglet', async () => {
    await fs.writeTextFile(
      'D:/Docs/alim.pinout',
      serializeProject(createEmptyProject('Alim', DEFAULT_PROFILE))
    )
    const all = stores()
    expect(await openExternalFile('D:/Docs/alim.pinout', all)).toEqual({ kind: 'project' })
    expect(all.schematic.doc.name).toBe('Alim')
    expect(all.schematic.filePath).toBe('D:/Docs/alim.pinout')
    expect(all.library.recentFiles[0]).toBe('D:/Docs/alim.pinout')
  })

  it('ouvre tel quel un composant de la bibliothèque', async () => {
    const all = stores()
    await all.library.init()
    const folder = await saveComponent(all.library.libraryDir, createEmptyComponent('led', 'LED'))
    await all.library.refresh()
    const result = await openExternalFile(`${folder}/component.json`, all)
    expect(result).toEqual({ kind: 'component' })
    expect(all.editor.doc.name).toBe('LED')
    expect(all.editor.folder).toBe(folder)
  })

  it('ouvre un composant venu d’ailleurs comme un nouveau composant', async () => {
    await fs.writeTextFile(
      'D:/Partage/led.json',
      serializeComponentDefinition(createEmptyComponent('led', 'LED partagée'))
    )
    const all = stores()
    expect(await openExternalFile('D:/Partage/led.json', all)).toEqual({ kind: 'component' })
    expect(all.editor.doc.name).toBe('LED partagée')
    expect(all.editor.folder).toBeNull()
  })

  it('refuse poliment un fichier qui n’est pas à lui, ou introuvable', async () => {
    await fs.writeTextFile('D:/Docs/notes.json', '{ "titre": "courses" }')
    const all = stores()
    const other = await openExternalFile('D:/Docs/notes.json', all)
    expect(other).toMatchObject({ kind: null })
    expect(other.kind === null && other.message).toContain('notes.json')
    expect(await openExternalFile('D:/Docs/absent.pinout', all)).toMatchObject({ kind: null })
    expect(all.schematic.tabs).toHaveLength(1)
  })
})
