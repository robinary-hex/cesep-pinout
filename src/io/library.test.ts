import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DirEntry, PinoutApi } from '../../electron/api'
import { createEmptyComponent, DEFAULT_SHAPE_STYLE, type ComponentDefinition } from '@/domain'
import { setBridge } from './bridge'
import {
  deleteComponent,
  listComponents,
  loadComponent,
  newComponentId,
  saveComponent
} from './library'

/** Système de fichiers en mémoire qui imite le pont Electron. */
class FakeFs implements PinoutApi {
  readonly texts = new Map<string, string>()
  readonly binaries = new Map<string, string>()

  private norm(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '')
  }

  private keys(): string[] {
    return [...this.texts.keys(), ...this.binaries.keys()]
  }

  async readTextFile(path: string): Promise<string> {
    const text = this.texts.get(this.norm(path))
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return text
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    this.texts.set(this.norm(path), content)
  }

  async readBinaryFile(path: string): Promise<string> {
    const data = this.binaries.get(this.norm(path))
    if (data === undefined) throw new Error(`ENOENT: ${path}`)
    return data
  }

  async writeBinaryFile(path: string, base64: string): Promise<void> {
    this.binaries.set(this.norm(path), base64)
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const prefix = this.norm(path) + '/'
    const names = new Map<string, boolean>()
    for (const key of this.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) names.set(rest, false)
      else names.set(rest.slice(0, slash), true)
    }
    return [...names].map(([name, isDirectory]) => ({ name, isDirectory }))
  }

  async pathExists(path: string): Promise<boolean> {
    const n = this.norm(path)
    return this.keys().some((key) => key === n || key.startsWith(n + '/'))
  }

  async removeComponentFolder(path: string): Promise<void> {
    const n = this.norm(path)
    if (!this.texts.has(n + '/component.json')) throw new Error('pas un dossier de composant')
    for (const key of this.keys()) {
      if (key.startsWith(n + '/')) {
        this.texts.delete(key)
        this.binaries.delete(key)
      }
    }
  }

  async showOpenDialog(): Promise<string | null> {
    return null
  }

  async showSaveDialog(): Promise<string | null> {
    return null
  }

  async getAppPaths(): Promise<{ userData: string; documents: string }> {
    return { userData: 'C:/fake/Pinout', documents: 'C:/fake/Documents' }
  }
}

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
    kind: 'png',
    file: 'image.png',
    pxPerCell: 80,
    dataUrl: `data:image/png;base64,${ONE_PIXEL}`
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
