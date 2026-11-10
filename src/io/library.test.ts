import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptyComponent,
  dataUrlToBase64,
  DEFAULT_SHAPE_STYLE,
  type ComponentDefinition
} from '@/domain'
import { pngHeaderDataUrl } from '@/domain/testing/pngHeader'
import { setBridge } from './bridge'
import {
  deleteComponent,
  listComponents,
  loadComponent,
  newComponentId,
  saveComponent
} from './library'
import { FakeFs } from './testing/fakeFs'

const LIB = 'C:/fake/Pinout/library'
const ONE_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function resistor(): ComponentDefinition {
  const def = createEmptyComponent('resistor', 'Résistance')
  def.visual = {
    kind: 'drawing',
    primitives: [{ kind: 'rect', x: 4, y: 2, w: 8, h: 4, rx: 0, style: DEFAULT_SHAPE_STYLE }]
  }
  def.pins = [
    { id: 'a', name: '1', kind: 'io', x: 0, y: 1 },
    { id: 'b', name: '2', kind: 'io', x: 4, y: 1 }
  ]
  return def
}

function nano(): ComponentDefinition {
  const def = createEmptyComponent('arduino-nano', 'Arduino Nano')
  def.size = { widthCells: 6, heightCells: 14 }
  def.visual = {
    kind: 'drawing',
    primitives: [
      {
        kind: 'image',
        x: 0,
        y: 0,
        w: 24,
        h: 56,
        file: 'image.png',
        dataUrl: `data:image/png;base64,${ONE_PIXEL}`
      }
    ]
  }
  def.pins = [{ id: 'gnd', name: 'GND', kind: 'power', x: 6, y: 1 }]
  return def
}

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('bibliothèque sur disque', () => {
  it('enregistre puis relit un composant dessiné à l’identique', async () => {
    const folder = await saveComponent(LIB, resistor())
    expect(folder).toBe(`${LIB}/resistor`)
    expect(await loadComponent(folder)).toEqual(resistor())
  })

  it('écrit le PNG à côté du JSON et le rattache à la relecture', async () => {
    const folder = await saveComponent(LIB, nano())
    expect(fs.binaries.get(`${folder}/image.png`)).toBe(ONE_PIXEL)
    expect(fs.texts.get(`${folder}/component.json`)).not.toContain('dataUrl')
    expect(await loadComponent(folder)).toEqual(nano())
  })

  it('range un PNG par image, sans doublon, et retire ceux qui ne servent plus', async () => {
    const def = nano()
    const first = def.visual.primitives[0]
    if (first?.kind !== 'image') throw new Error('image attendue')
    const other = pngHeaderDataUrl(80, 80)
    // La même image posée deux fois, puis une autre.
    def.visual.primitives.push(
      { ...first, x: 24 },
      { ...first, file: 'image-2.png', dataUrl: other }
    )
    const folder = await saveComponent(LIB, def)
    expect([...fs.binaries.keys()].sort()).toEqual([`${folder}/image-2.png`, `${folder}/image.png`])
    expect(fs.binaries.get(`${folder}/image-2.png`)).toBe(dataUrlToBase64(other))
    expect(await loadComponent(folder)).toEqual(def)
    // L'autre image retirée du dessin : son fichier s'en va ; un fichier étranger reste.
    def.visual.primitives.pop()
    await fs.writeBinaryFile(`${folder}/photo.png`, ONE_PIXEL)
    await saveComponent(LIB, def)
    expect([...fs.binaries.keys()].sort()).toEqual([`${folder}/image.png`, `${folder}/photo.png`])
  })

  it('relit une image dont le fichier a disparu, sans son contenu', async () => {
    const folder = await saveComponent(LIB, nano())
    await fs.deleteFile(`${folder}/image.png`)
    const loaded = await loadComponent(folder)
    expect(loaded.visual.primitives).toEqual([
      { kind: 'image', x: 0, y: 0, w: 24, h: 56, file: 'image.png' }
    ])
  })

  it('liste les composants triés par nom et garde les dossiers illisibles', async () => {
    await saveComponent(LIB, resistor())
    await saveComponent(LIB, nano())
    await fs.writeTextFile(`${LIB}/casse/component.json`, '{ "schemaVersion": 1 ')
    await fs.writeTextFile(`${LIB}/notes.txt`, 'pas un dossier')

    const entries = await listComponents(LIB)
    expect(entries.map((entry) => entry.def?.name ?? null)).toEqual([
      'Arduino Nano',
      null,
      'Résistance'
    ])
    expect(entries[1]?.problem).toMatch(/JSON invalide/)
  })

  it('retourne une liste vide pour une bibliothèque absente', async () => {
    expect(await listComponents('C:/fake/nulle-part')).toEqual([])
  })

  it('supprime un composant, et seulement un dossier de composant', async () => {
    const folder = await saveComponent(LIB, nano())
    await deleteComponent(folder)
    expect(await listComponents(LIB)).toEqual([])
    await expect(deleteComponent(`${LIB}/inexistant`)).rejects.toThrow()
  })

  it('attribue un identifiant unique à partir du nom', () => {
    expect(newComponentId('Résistance', ['resistor'])).toBe('resistance')
    expect(newComponentId('Résistance', ['resistance', 'resistance-2'])).toBe('resistance-3')
  })
})
