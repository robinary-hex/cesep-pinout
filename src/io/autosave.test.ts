import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject, DEFAULT_PROFILE } from '@/domain'
import { clearAutosave, readAutosave, writeAutosave } from './autosave'
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

describe('copie de secours', () => {
  it('n’existe pas au départ', async () => {
    expect(await readAutosave()).toBeNull()
  })

  it('écrit puis relit le projet et son contexte', async () => {
    const project = createEmptyProject('Alim', DEFAULT_PROFILE)
    await writeAutosave(project, 'D:/Documents/alim.pinout.json', new Date('2026-11-08T10:00:00Z'))
    const restored = await readAutosave()
    expect(restored?.project).toEqual(project)
    expect(restored?.meta).toEqual({
      name: 'Alim',
      originalPath: 'D:/Documents/alim.pinout.json',
      savedAt: '2026-11-08T10:00:00.000Z'
    })
  })

  it('s’efface proprement', async () => {
    await writeAutosave(createEmptyProject('x', DEFAULT_PROFILE), null)
    await clearAutosave()
    expect(await readAutosave()).toBeNull()
    expect(fs.texts.size).toBe(0)
  })

  it('efface une copie illisible au lieu de bloquer le lancement', async () => {
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage.meta.json', '{ "name": ')
    await fs.writeTextFile('C:/fake/Pinout/autosave/montage.pinout.json', '{}')
    expect(await readAutosave()).toBeNull()
    expect(fs.texts.size).toBe(0)
  })
})
