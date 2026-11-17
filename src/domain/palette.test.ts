import { describe, expect, it } from 'vitest'
import {
  paletteChoices,
  recoloredCustom,
  removedCustom,
  sameColor,
  startsDocumentColors
} from './palette'

const app = [
  { name: 'Noir', hex: '#000000' },
  { name: 'Rouge', hex: '#D62828' }
]
const custom = ['#ff00aa', '#00ffaa']

describe('couleurs proposées par une palette', () => {
  it('propose la palette de l’application, puis les couleurs du document', () => {
    expect(paletteChoices(app, custom)).toEqual([
      { hex: '#000000', name: 'Noir', custom: false },
      { hex: '#D62828', name: 'Rouge', custom: false },
      { hex: '#ff00aa', name: '#ff00aa', custom: true },
      { hex: '#00ffaa', name: '#00ffaa', custom: true }
    ])
    expect(sameColor('#D62828', '#d62828')).toBe(true)
    expect(sameColor('#d62828', '#d62829')).toBe(false)
    // La séparation des palettes se met devant la première couleur du document, une seule fois.
    const choices = paletteChoices(app, custom)
    expect(choices.map((_, index) => startsDocumentColors(choices, index))).toEqual([
      false,
      false,
      true,
      false
    ])
    // Sans couleur du document, ou sans couleur de l'application devant elles : pas de trait.
    expect(startsDocumentColors(paletteChoices(app, []), 1)).toBe(false)
    expect(startsDocumentColors(paletteChoices([], custom), 0)).toBe(false)
  })

  it('modifie une couleur du document, à sa place ; pas celles de l’application', () => {
    expect(recoloredCustom(app, custom, '#FF00AA', '#123456')).toEqual(['#123456', '#00ffaa'])
    // Rien à faire : la même couleur, une couleur déjà proposée, une couleur inconnue.
    expect(recoloredCustom(app, custom, '#ff00aa', '#FF00AA')).toBeNull()
    expect(recoloredCustom(app, custom, '#ff00aa', '#000000')).toBeNull()
    expect(recoloredCustom(app, custom, '#ff00aa', '#00ffaa')).toBeNull()
    expect(recoloredCustom(app, custom, '#abcdef', '#123456')).toBeNull()
    // Une couleur de l'application ne se modifie que dans les paramètres.
    expect(recoloredCustom(app, custom, '#d62828', '#aa0000')).toBeNull()
  })

  it('supprime une couleur du document ; pas celles de l’application', () => {
    expect(removedCustom(custom, '#00FFAA')).toEqual(['#ff00aa'])
    expect(removedCustom(['#ff00aa'], '#ff00aa')).toEqual([])
    expect(removedCustom(custom, '#000000')).toBeNull()
    expect(removedCustom(custom, '#abcdef')).toBeNull()
  })
})
