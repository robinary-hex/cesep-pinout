import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBridge } from './bridge'
import { listDocumentFiles } from './documentFiles'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

describe('fichiers d’un dossier de documents', () => {
  const DIR = 'C:/fake/Donnees/Montages'

  it('liste les montages du dossier et de ses sous-dossiers, la racine d’abord, par nom', async () => {
    await fs.writeTextFile(`${DIR}/pont.pinout`, '{}')
    await fs.writeTextFile(`${DIR}/Alim 10.pinout`, '{}')
    await fs.writeTextFile(`${DIR}/alim 2.pinout`, '{}')
    await fs.writeTextFile(`${DIR}/ancien.pinout.json`, '{}')
    await fs.writeTextFile(`${DIR}/Robotique/moteur.pinout`, '{}')
    await fs.writeTextFile(`${DIR}/Robotique/Séance 3/suiveur.pinout`, '{}')
    // Ni un diagramme, ni un fichier quelconque, ni ce qui est caché.
    await fs.writeTextFile(`${DIR}/etats.pinuml`, '{}')
    await fs.writeTextFile(`${DIR}/notes.txt`, 'rien')
    await fs.writeTextFile(`${DIR}/.corbeille/vieux.pinout`, '{}')
    const files = await listDocumentFiles(DIR, 'montage')
    // Les nombres se rangent comme des nombres, sans égard à la casse ; l'extension ne se dit pas.
    expect(files.map((file) => [file.folder, file.name])).toEqual([
      ['', 'alim 2'],
      ['', 'Alim 10'],
      ['', 'ancien'],
      ['', 'pont'],
      ['Robotique', 'moteur'],
      ['Robotique/Séance 3', 'suiveur']
    ])
    expect(files[4]?.path).toBe(`${DIR}/Robotique/moteur.pinout`)
  })

  it('liste les diagrammes de même ; un dossier absent ne donne rien', async () => {
    await fs.writeTextFile('C:/fake/Donnees/Diagrammes/etats.pinuml', '{}')
    await fs.writeTextFile('C:/fake/Donnees/Diagrammes/alim.pinout', '{}')
    const files = await listDocumentFiles('C:/fake/Donnees/Diagrammes', 'diagram')
    expect(files.map((file) => file.name)).toEqual(['etats'])
    expect(await listDocumentFiles('C:/fake/Nulle part', 'montage')).toEqual([])
  })
})
