import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject, DEFAULT_PROFILE, serializeProject } from '@/domain'
import { clearAutosave, readAutosaves, syncAutosaves } from './autosave'
import { setBridge } from './bridge'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('copies de secours', () => {
  it('n’existent pas au départ', async () => {
    expect(await readAutosaves()).toEqual([])
  })

  it('écrit puis relit chaque montage et son contexte, dans l’ordre des clés', async () => {
    const alim = createEmptyProject('Alim', DEFAULT_PROFILE)
    const capteur = createEmptyProject('Capteur', DEFAULT_PROFILE)
    await syncAutosaves(
      [
        { key: 7, project: capteur, originalPath: null },
        { key: 2, project: alim, originalPath: 'D:/Documents/alim.pinout.json' }
      ],
      new Date('2026-11-08T10:00:00Z')
    )
    const restored = await readAutosaves()
    expect(restored.map((entry) => entry.project)).toEqual([alim, capteur])
    expect(restored[0]?.meta).toEqual({
      name: 'Alim',
      originalPath: 'D:/Documents/alim.pinout.json',
      savedAt: '2026-11-08T10:00:00.000Z'
    })
    expect(restored[1]?.meta.originalPath).toBeNull()
  })

  it('efface la copie d’un montage qui n’est plus modifié', async () => {
    const a = createEmptyProject('A', DEFAULT_PROFILE)
    const b = createEmptyProject('B', DEFAULT_PROFILE)
    await syncAutosaves([
      { key: 1, project: a, originalPath: null },
      { key: 2, project: b, originalPath: null }
    ])
    await syncAutosaves([{ key: 2, project: b, originalPath: null }])
    expect((await readAutosaves()).map((entry) => entry.meta.name)).toEqual(['B'])
    expect(fs.texts.size).toBe(2)
  })

  it('s’efface proprement', async () => {
    await syncAutosaves([
      { key: 1, project: createEmptyProject('x', DEFAULT_PROFILE), originalPath: null }
    ])
    await clearAutosave()
    expect(await readAutosaves()).toEqual([])
    expect(fs.texts.size).toBe(0)
  })

  it('efface une copie illisible au lieu de bloquer le lancement', async () => {
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage-1.meta.json', '{ "name": ')
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage-1.pinout.json', '{}')
    expect(await readAutosaves()).toEqual([])
    expect(fs.texts.size).toBe(0)
  })

  it('relit la copie unique d’avant les onglets, puis la remplace', async () => {
    const project = createEmptyProject('Ancien', DEFAULT_PROFILE)
    const meta = { name: 'Ancien', originalPath: null, savedAt: '2026-11-08T10:00:00.000Z' }
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage.meta.json', JSON.stringify(meta))
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage.pinout.json', serializeProject(project))
    expect((await readAutosaves()).map((entry) => entry.project)).toEqual([project])
    await syncAutosaves([{ key: 1, project, originalPath: null }])
    expect([...fs.texts.keys()].sort()).toEqual([
      'C:/fake/Pinout/autosave/montage-1.meta.json',
      'C:/fake/Pinout/autosave/montage-1.pinout.json'
    ])
  })
})
