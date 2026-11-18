import { describe, expect, it } from 'vitest'
import { SHORTCUT_SECTIONS } from '@/app/shortcuts'
import { isKeyCombo } from './keyCombo'
import { TIP_MAX_LENGTH, tipContent, tipPlace } from './tooltip'

describe('infobulle : son texte et son raccourci', () => {
  it('sépare le raccourci écrit entre parenthèses à la fin', () => {
    expect(tipContent('Fil nu (N)')).toEqual({ text: 'Fil nu', combos: ['N'] })
    expect(tipContent('Nouveau montage (Ctrl+N)')).toEqual({
      text: 'Nouveau montage',
      combos: ['Ctrl+N']
    })
    expect(tipContent('Raccourcis clavier (F1)')).toEqual({
      text: 'Raccourcis clavier',
      combos: ['F1']
    })
    // Un geste de souris est un raccourci comme un autre.
    expect(tipContent('Zoom avant (molette)')).toEqual({ text: 'Zoom avant', combos: ['molette'] })
    expect(tipContent('Fermer (clic milieu)')).toEqual({ text: 'Fermer', combos: ['clic milieu'] })
    // Deux façons de faire, séparées par « / ».
    expect(tipContent('Arrêter la copie (S / Échap)')).toEqual({
      text: 'Arrêter la copie',
      combos: ['S', 'Échap']
    })
    // Seule la dernière parenthèse compte.
    expect(tipContent('Annuler : Déplacer (2 éléments) (Ctrl+Z)')).toEqual({
      text: 'Annuler : Déplacer (2 éléments)',
      combos: ['Ctrl+Z']
    })
  })

  it('laisse dans le texte une parenthèse qui n’est pas un raccourci', () => {
    for (const title of [
      'Horizontal (en largeur)',
      'Taille (pt)',
      'Chasse fixe (code)',
      'Rien à annuler',
      'Zoom 100 %',
      'Poser « LED (rouge) »'
    ]) {
      expect(tipContent(title)).toEqual({ text: title, combos: [] })
    }
    expect(tipContent('  Menu  ')).toEqual({ text: 'Menu', combos: [] })
    expect(tipContent('')).toEqual({ text: '', combos: [] })
  })

  it('reconnaît les touches et les gestes de l’aide, et rien d’autre', () => {
    for (const combo of ['V', '0', 'F11', 'Ctrl+Maj+G', 'Alt+glisser', 'Suppr', 'Page haut']) {
      expect(isKeyCombo(combo), combo).toBe(true)
    }
    for (const combo of ['titre', 'en largeur', 'pt', 'F13', 'v', 'Ctrl+titre', '2 éléments']) {
      expect(isKeyCombo(combo), combo).toBe(false)
    }
    // Tout ce que l'aide écrit se dessine aussi dans une infobulle.
    for (const section of SHORTCUT_SECTIONS) {
      for (const row of section.categories.flatMap((category) => category.rows)) {
        for (const combo of row.keys) expect(isKeyCombo(combo), combo).toBe(true)
      }
    }
  })
})

describe('infobulle : sa place', () => {
  const viewport = { width: 800, height: 600 }
  const size = { width: 100, height: 28 }

  it('se centre sous ce qu’elle désigne', () => {
    const anchor = { left: 200, right: 240, top: 50, bottom: 80 }
    expect(tipPlace(anchor, size, viewport)).toEqual({ left: 170, top: 88 })
  })

  it('ne sort pas de la fenêtre, et passe au-dessus quand la place manque dessous', () => {
    // Collée au bord gauche, puis au bord droit.
    expect(tipPlace({ left: 0, right: 20, top: 50, bottom: 80 }, size, viewport).left).toBe(6)
    expect(tipPlace({ left: 780, right: 800, top: 50, bottom: 80 }, size, viewport).left).toBe(694)
    // Tout en bas : elle se pose au-dessus.
    expect(tipPlace({ left: 200, right: 240, top: 560, bottom: 590 }, size, viewport)).toEqual({
      left: 170,
      top: 524
    })
  })
})

// Les infobulles restent courtes (décision du 18 novembre 2026) : elles nomment, sans expliquer.
// Ce test lit les sources et refuse un texte trop long, pour que la règle tienne dans la durée.

const sources = import.meta.glob<string>(['/src/**/*.vue', '/src/**/*.ts', '!/src/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true
})

/**
 * Les textes d'infobulle écrits en dur dans un fichier : attributs du gabarit, champs du script.
 * Dans un fichier `.ts`, un champ `title` est le titre d'une boîte ou d'un dialogue de fichier,
 * pas une infobulle : seuls `tip` et `dirtyTitle` y comptent.
 */
function tipTexts(file: string, source: string): string[] {
  const texts: string[] = []
  const attribute = /(?<![\w-])(:?)(?:title|adder-title|data-tip)="([^"]*)"/g
  for (const [, bound, value] of source.matchAll(attribute)) {
    if (value === undefined) continue
    if (bound === '') {
      texts.push(value)
      continue
    }
    // Une expression : ses textes entre apostrophes, et ses gabarits, sans leurs variables.
    for (const [, literal] of value.matchAll(/'([^']*)'/g)) texts.push(literal ?? '')
    for (const [, template] of value.matchAll(/`([^`]*)`/g)) {
      texts.push((template ?? '').replace(/\$\{[^}]*\}/g, ''))
    }
  }
  const field = file.endsWith('.vue')
    ? /\b(?:title|tip|dirtyTitle): '([^']*)'/g
    : /\b(?:tip|dirtyTitle): '([^']*)'/g
  for (const [, value] of source.matchAll(field)) texts.push(value ?? '')
  return texts
}

describe('infobulles de l’application', () => {
  it('tiennent en quelques mots, raccourci à part', () => {
    const tooLong: string[] = []
    let count = 0
    for (const [file, source] of Object.entries(sources)) {
      for (const text of tipTexts(file, source)) {
        count++
        if (tipContent(text).text.length > TIP_MAX_LENGTH) tooLong.push(`${file} : ${text}`)
      }
    }
    // Le test lit bien quelque chose.
    expect(count).toBeGreaterThan(100)
    expect(tooLong).toEqual([])
  })
})
