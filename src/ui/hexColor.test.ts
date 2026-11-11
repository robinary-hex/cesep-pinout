import { describe, expect, it } from 'vitest'
import { parseHexColor } from './hexColor'

describe('code hexadécimal d’une couleur', () => {
  it('lit un code complet, avec ou sans dièse, en majuscules ou en minuscules', () => {
    expect(parseHexColor('#d62828')).toBe('#d62828')
    expect(parseHexColor('d62828')).toBe('#d62828')
    expect(parseHexColor('#D62828')).toBe('#d62828')
    expect(parseHexColor('  #1D4ED8 ')).toBe('#1d4ed8')
  })

  it('étend la forme courte à trois chiffres', () => {
    expect(parseHexColor('#fa0')).toBe('#ffaa00')
    expect(parseHexColor('09C')).toBe('#0099cc')
  })

  it('refuse ce qui n’est pas un code de couleur', () => {
    for (const text of [
      '',
      '#',
      'rouge',
      '#d6282',
      '#d628288',
      '#12345g',
      '12 34 56',
      '##123456'
    ]) {
      expect(parseHexColor(text), text).toBeNull()
    }
  })
})
