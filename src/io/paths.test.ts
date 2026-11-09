import { describe, expect, it } from 'vitest'
import { baseName, dirOf, joinPath } from './paths'

describe('chemins', () => {
  it('assemble avec le séparateur du premier segment', () => {
    expect(joinPath('D:\\Docs\\', 'montages', 'a.json')).toBe('D:\\Docs\\montages\\a.json')
    expect(joinPath('/home/robin/', '/montages/', 'a.json')).toBe('/home/robin/montages/a.json')
  })

  it('donne le dossier et le nom d’un fichier, quel que soit le séparateur', () => {
    expect(dirOf('D:\\Docs\\montages\\a.pinout.json')).toBe('D:\\Docs\\montages')
    expect(dirOf('/home/robin/a.json')).toBe('/home/robin')
    expect(dirOf('a.json')).toBe('a.json')
    expect(baseName('D:\\Docs\\montages\\a.pinout.json')).toBe('a.pinout.json')
  })
})
