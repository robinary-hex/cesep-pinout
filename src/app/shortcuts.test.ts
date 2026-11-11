import { describe, expect, it } from 'vitest'
import { comboTokens, MOUSE_GESTURES, SHORTCUT_SECTIONS } from './shortcuts'

describe('raccourcis de l’aide', () => {
  it('range les éditeurs dans l’ordre des boutons de mode', () => {
    expect(SHORTCUT_SECTIONS.map((section) => section.title)).toEqual([
      'Composants',
      'Montage',
      'Diagramme'
    ])
  })

  it('classe par thèmes, les thèmes communs dits partout de la même façon', () => {
    const common = ['Ordre', 'Sélectionner', 'Modifier', 'Vue', 'Fichiers et onglets']
    for (const section of SHORTCUT_SECTIONS) {
      const titles = section.categories.map((category) => category.title)
      expect(titles[0]).toBe('Outils')
      expect(titles.slice(-common.length)).toEqual(common)
      expect(new Set(titles).size).toBe(titles.length)
      for (const title of ['Sélectionner', 'Modifier', 'Vue']) {
        const here = section.categories.find((category) => category.title === title)
        const first = SHORTCUT_SECTIONS[0]?.categories.find((category) => category.title === title)
        expect(here).toBe(first)
      }
    }
  })

  it('dit chaque raccourci en peu de mots, de quoi tenir sur une ligne', () => {
    for (const section of SHORTCUT_SECTIONS) {
      for (const category of section.categories) {
        expect(category.rows.length).toBeGreaterThan(0)
        for (const row of category.rows) {
          // Le libellé et, à sa suite, ce que fait le geste avec Maj.
          const length = row.label.length + (row.withShift ? row.withShift.length + 5 : 0)
          expect(length, row.label).toBeLessThanOrEqual(30)
          expect(row.keys.length, row.label).toBeLessThanOrEqual(2)
        }
        // Un même geste ne fait qu'une chose dans un thème.
        const gestures = category.rows.map((row) => row.keys.join(' / '))
        expect(new Set(gestures).size, category.title).toBe(gestures.length)
      }
    }
  })

  it('découpe une combinaison en touches et en gestes de souris', () => {
    expect(comboTokens('Ctrl+Maj+G')).toEqual([
      { text: 'Ctrl', mouse: null },
      { text: 'Maj', mouse: null },
      { text: 'G', mouse: null }
    ])
    expect(comboTokens('Alt+glisser')).toEqual([
      { text: 'Alt', mouse: null },
      { text: 'glisser', mouse: { text: 'glisser', button: 'left', drag: true } }
    ])
    // Un double-clic se dit « ×2 » : la pastille est plus courte.
    expect(comboTokens('double-clic')[0]).toEqual({
      text: 'clic ×2',
      mouse: { text: 'clic ×2', button: 'left', double: true }
    })
    expect(comboTokens('double-clic milieu')[0]?.text).toBe('milieu ×2')
    expect(comboTokens('Flèches')[0]?.text).toBe('← ↑ ↓ →')
    // Tout geste de souris de l'aide est un de ceux qu'on sait dessiner.
    for (const section of SHORTCUT_SECTIONS) {
      for (const row of section.categories.flatMap((category) => category.rows)) {
        for (const part of row.keys.flatMap((combo) => combo.split('+'))) {
          const name = part.trim()
          expect(name).not.toBe('')
          const looksLikeMouse = /clic|glisser|molette|déposer/i.test(name)
          expect(name in MOUSE_GESTURES, name).toBe(looksLikeMouse)
        }
      }
    }
  })
})
