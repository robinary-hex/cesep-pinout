import { describe, expect, it } from 'vitest'
import {
  paletteChoices,
  recoloredChoice,
  removedChoice,
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

  it('modifie une couleur là où elle se trouve, sans toucher à l’autre liste', () => {
    // Une couleur du document : sa place dans la liste ne change pas.
    expect(recoloredChoice(app, custom, '#FF00AA', '#123456')).toEqual({
      list: 'custom',
      colors: ['#123456', '#00ffaa']
    })
    // Une couleur de l'application : elle garde son nom.
    expect(recoloredChoice(app, custom, '#d62828', '#aa0000')).toEqual({
      list: 'app',
      colors: [
        { name: 'Noir', hex: '#000000' },
        { name: 'Rouge', hex: '#aa0000' }
      ]
    })
    // Rien à faire : la même couleur, une couleur déjà proposée, une couleur inconnue.
    expect(recoloredChoice(app, custom, '#d62828', '#D62828')).toBeNull()
    expect(recoloredChoice(app, custom, '#d62828', '#ff00aa')).toBeNull()
    expect(recoloredChoice(app, custom, '#ff00aa', '#000000')).toBeNull()
    expect(recoloredChoice(app, custom, '#abcdef', '#123456')).toBeNull()
  })

  it('supprime une couleur, mais jamais la dernière de la palette de l’application', () => {
    expect(removedChoice(app, custom, '#00FFAA')).toEqual({ list: 'custom', colors: ['#ff00aa'] })
    expect(removedChoice(app, custom, '#000000')).toEqual({
      list: 'app',
      colors: [{ name: 'Rouge', hex: '#D62828' }]
    })
    expect(removedChoice([{ name: 'Noir', hex: '#000000' }], custom, '#000000')).toBeNull()
    expect(removedChoice(app, custom, '#abcdef')).toBeNull()
    // La dernière couleur du document, elle, se retire.
    expect(removedChoice(app, ['#ff00aa'], '#ff00aa')).toEqual({ list: 'custom', colors: [] })
  })
})
