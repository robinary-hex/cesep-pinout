import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('identifiants de composant', () => {
  it('retire accents, majuscules et ponctuation', () => {
    expect(slugify('Résistance 10 kΩ (CMS)')).toBe('resistance-10-k-cms')
    expect(slugify('  Arduino Nano  ')).toBe('arduino-nano')
  })

  it('ne retourne jamais une chaîne vide', () => {
    expect(slugify('')).toBe('composant')
    expect(slugify('***')).toBe('composant')
  })

  it('numérote les doublons', () => {
    const taken = new Set(['led', 'led-2'])
    expect(uniqueSlug('led', taken)).toBe('led-3')
    expect(uniqueSlug('diode', taken)).toBe('diode')
  })
})
