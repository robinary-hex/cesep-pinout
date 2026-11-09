import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain'
import { setBridge } from './bridge'
import { portableLibraryDir, resolveLibraryDir } from './settings'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

describe('dossier de la bibliothèque', () => {
  it('va par défaut dans OneDrive quand la machine en a un, sinon dans userData', async () => {
    expect(await resolveLibraryDir(DEFAULT_SETTINGS)).toBe('C:/fake/Pinout/library')
    fs.oneDrive = 'D:/Cesep/OneDrive - CESEP'
    expect(await resolveLibraryDir(DEFAULT_SETTINGS)).toBe(
      'D:/Cesep/OneDrive - CESEP/(Cours)/Robotique/(Ressources)/Pinout/library'
    )
  })

  it('résout un dossier enregistré relativement à OneDrive sur la racine de la machine', async () => {
    fs.oneDrive = 'E:/Autre/OneDrive - CESEP'
    const settings = { ...DEFAULT_SETTINGS, libraryDir: '${OneDrive}/Pinout/lib' }
    expect(await resolveLibraryDir(settings)).toBe('E:/Autre/OneDrive - CESEP/Pinout/lib')
    expect(await resolveLibraryDir({ ...DEFAULT_SETTINGS, libraryDir: 'F:/ailleurs' })).toBe(
      'F:/ailleurs'
    )
  })

  it('enregistre un dossier choisi dans OneDrive sous forme relative', () => {
    expect(
      portableLibraryDir('D:/Cesep/OneDrive - CESEP/Pinout/lib', 'D:/Cesep/OneDrive - CESEP')
    ).toBe('${OneDrive}/Pinout/lib')
    expect(portableLibraryDir('D:/Cesep/OneDrive - CESEP', 'D:/Cesep/OneDrive - CESEP/')).toBe(
      '${OneDrive}'
    )
    expect(portableLibraryDir('F:/ailleurs', 'D:/Cesep/OneDrive - CESEP')).toBe('F:/ailleurs')
    expect(portableLibraryDir('F:/ailleurs', null)).toBe('F:/ailleurs')
  })
})
