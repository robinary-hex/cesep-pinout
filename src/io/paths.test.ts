import { describe, expect, it } from 'vitest'
import { baseName, dirOf, joinPath, samePath } from './paths'

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

  it('reconnaît un même fichier malgré la casse et les séparateurs', () => {
    expect(samePath('D:\\Docs\\Alim.pinout.json', 'd:/docs/alim.pinout.json')).toBe(true)
    expect(samePath('D:/Docs/a.json', 'D:/Docs/b.json')).toBe(false)
  })
})
