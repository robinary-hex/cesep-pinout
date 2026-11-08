import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '@/domain'
import { setBridge } from './bridge'
import { deleteProfile, listProfiles, saveProfile } from './profiles'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('profils de style nommés', () => {
  it('enregistre, liste par nom et supprime', async () => {
    const compact = { ...DEFAULT_PROFILE, name: 'Compact', cellPx: 16 }
    const large = { ...DEFAULT_PROFILE, name: 'Aéré', cellPx: 28 }
    const path = await saveProfile(compact)
    await saveProfile(large)
    expect(path).toBe('C:/fake/Pinout/profiles/compact.json')
    expect((await listProfiles()).map((entry) => entry.profile.name)).toEqual(['Aéré', 'Compact'])
    await deleteProfile(path)
    expect((await listProfiles()).map((entry) => entry.profile.name)).toEqual(['Aéré'])
  })

  it('ignore les fichiers illisibles ou invalides', async () => {
    await fs.writeTextFile('C:/fake/Pinout/profiles/casse.json', '{')
    await fs.writeTextFile('C:/fake/Pinout/profiles/faux.json', '{ "name": "x" }')
    await fs.writeTextFile('C:/fake/Pinout/profiles/notes.txt', 'rien')
    expect(await listProfiles()).toEqual([])
  })
})
