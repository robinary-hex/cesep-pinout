import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject, DEFAULT_PROFILE } from '@/domain'
import { setBridge } from './bridge'
import {
  chooseProjectToSave,
  ensureProjectExtension,
  readProject,
  writeProject
} from './projectFiles'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('fichiers de projet', () => {
  it('écrit puis relit un projet à l’identique', async () => {
    const project = createEmptyProject('Alimentation 5 V', DEFAULT_PROFILE)
    await writeProject('C:/fake/Documents/alim.pinout.json', project)
    expect(await readProject('C:/fake/Documents/alim.pinout.json')).toEqual(project)
  })

  it('complète l’extension du fichier choisi', () => {
    expect(ensureProjectExtension('C:/x/montage')).toBe('C:/x/montage.pinout')
    expect(ensureProjectExtension('C:/x/montage.pinout')).toBe('C:/x/montage.pinout')
    // Les anciennes extensions restent telles quelles.
    expect(ensureProjectExtension('C:/x/montage.pinout.json')).toBe('C:/x/montage.pinout.json')
    expect(ensureProjectExtension('C:/x/montage.JSON')).toBe('C:/x/montage.JSON')
  })

  it('propose un nom de fichier dérivé du nom du projet et respecte l’annulation', async () => {
    fs.saveDialogAnswers.push(null, 'C:/fake/Documents/choisi')
    expect(await chooseProjectToSave('Alimentation 5 V')).toBeNull()
    expect(await chooseProjectToSave('Alimentation 5 V')).toBe('C:/fake/Documents/choisi.pinout')
  })
})

describe('chemins', () => {
  it('assemble avec le séparateur du premier segment', async () => {
    const { joinPath } = await import('./paths')
    expect(joinPath('C:\\Users\\Robin\\AppData\\Roaming\\Pinout', 'library')).toBe(
      'C:\\Users\\Robin\\AppData\\Roaming\\Pinout\\library'
    )
    expect(joinPath('D:/OneDrive/Pinout/', '/library', 'resistor')).toBe(
      'D:/OneDrive/Pinout/library/resistor'
    )
  })
})
