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

  it('dit chaque raccourci en peu de mots', () => {
    for (const section of SHORTCUT_SECTIONS) {
      for (const category of section.categories) {
        expect(category.rows.length).toBeGreaterThan(0)
        for (const row of category.rows) {
          expect(row.label.length, row.label).toBeLessThanOrEqual(45)
          expect((row.where ?? '').length, row.where).toBeLessThanOrEqual(32)
          expect((row.note ?? '').length, row.note).toBeLessThanOrEqual(32)
        }
        // Un même geste au même endroit ne fait qu'une chose.
        const gestures = category.rows.map((row) => `${row.keys.join(' / ')} ${row.where ?? ''}`)
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
      { text: 'glisser', mouse: { button: 'left', drag: true } }
    ])
    expect(comboTokens('double-clic milieu')[0]?.mouse).toEqual({ button: 'middle', double: true })
    expect(comboTokens('Flèches')[0]?.text).toBe('← ↑ ↓ →')
    // Tout geste de souris de l'aide est un de ceux qu'on sait dessiner.
    for (const section of SHORTCUT_SECTIONS) {
      for (const row of section.categories.flatMap((category) => category.rows)) {
        for (const token of row.keys.flatMap(comboTokens)) {
          expect(token.text).not.toBe('')
          const looksLikeMouse = /clic|glisser|molette/i.test(token.text)
          expect(token.mouse !== null, token.text).toBe(looksLikeMouse)
        }
      }
    }
    expect(Object.keys(MOUSE_GESTURES)).toContain('clic droit')
  })
})
