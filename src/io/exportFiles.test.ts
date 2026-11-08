import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBridge } from './bridge'
import { chooseExportPath, defaultExportName } from './exportFiles'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('fichiers d’export', () => {
  it('propose le nom du projet enregistré, sinon le nom du montage', () => {
    expect(defaultExportName('Alim 5 V', 'D:/x/alim.pinout.json', 'png')).toBe('alim.png')
    expect(defaultExportName('Alim 5 V', null, 'svg')).toBe('alim-5-v.svg')
  })

  it('complète l’extension et respecte l’annulation', async () => {
    fs.saveDialogAnswers.push(null, 'D:/x/sortie')
    expect(await chooseExportPath('png', 'Alim', null)).toBeNull()
    expect(await chooseExportPath('png', 'Alim', null)).toBe('D:/x/sortie.png')
  })
})
