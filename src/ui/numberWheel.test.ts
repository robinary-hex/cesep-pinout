// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { numberFieldAt, steppedValue, wheelOnNumberField } from './numberWheel'

describe('pas d’un champ numérique', () => {
  it('passe au multiple du pas qui suit, au-dessus ou en dessous', () => {
    expect(steppedValue(10, 1)).toBe(11)
    expect(steppedValue(10, -1)).toBe(9)
    // Une valeur entre deux pas rejoint l'unité voisine, sans la sauter.
    expect(steppedValue(2.3, 1)).toBe(3)
    expect(steppedValue(2.3, -1)).toBe(2)
    expect(steppedValue(-2.3, 1)).toBe(-2)
    expect(steppedValue(-2.3, -1)).toBe(-3)
    expect(steppedValue(0, -1)).toBe(-1)
  })

  it('suit le pas du champ, sans erreur d’arrondi', () => {
    expect(steppedValue(1.5, 1, { step: 0.5 })).toBe(2)
    expect(steppedValue(1.5, -1, { step: 0.5 })).toBe(1)
    expect(steppedValue(0.3, 1, { step: 0.1 })).toBe(0.4)
    expect(steppedValue(0.3, -1, { step: 0.1 })).toBe(0.2)
    expect(steppedValue(0.7, 1, { step: 0.1 })).toBe(0.8)
    // Un pas nul ou absent vaut 1.
    expect(steppedValue(4, 1, { step: 0 })).toBe(5)
  })

  it('reste entre les bornes, les pas comptés depuis le minimum', () => {
    expect(steppedValue(48, 1, { min: 6, max: 48 })).toBe(48)
    expect(steppedValue(47, 1, { min: 6, max: 48 })).toBe(48)
    expect(steppedValue(6, -1, { min: 6, max: 48 })).toBe(6)
    expect(steppedValue(1, 1, { min: 0.5, step: 0.5, max: 8 })).toBe(1.5)
    // De deux en deux depuis 1 : 1, 3, 5…
    expect(steppedValue(2, 1, { min: 1, step: 2 })).toBe(3)
    expect(steppedValue(2, -1, { min: 1, step: 2 })).toBe(1)
  })
})

describe('Maj+molette sur un champ numérique', () => {
  let events: string[] = []

  /** Un panneau d'essai : un champ numérique dans son étiquette, un champ de texte à côté. */
  function panel(attributes = 'step="1" value="10"'): HTMLInputElement {
    document.body.innerHTML = `
      <label id="label"><span id="name">Largeur</span><input id="field" type="number" ${attributes} /></label>
      <input id="text" type="text" value="abc" />`
    const field = document.querySelector<HTMLInputElement>('#field')
    if (!field) throw new Error('champ attendu')
    events = []
    field.addEventListener('input', () => events.push('input'))
    field.addEventListener('change', () => events.push('change'))
    return field
  }

  /** Un cran de molette sur un élément ; rend l'événement, pour voir s'il a été retenu. */
  function wheel(selector: string, init: WheelEventInit): WheelEvent {
    const target = document.querySelector(selector)
    if (!target) throw new Error(`${selector} introuvable`)
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    window.addEventListener('wheel', wheelOnNumberField, { capture: true, passive: false })
  })

  afterEach(() => {
    window.removeEventListener('wheel', wheelOnNumberField, true)
    document.body.innerHTML = ''
  })

  it('monte d’un pas vers le haut, descend vers le bas, et valide le champ', () => {
    const field = panel()
    const up = wheel('#field', { deltaY: -100, shiftKey: true })
    expect(field.value).toBe('11')
    // Validé comme une saisie : `input` pour v-model, `change` pour les champs des panneaux.
    expect(events).toEqual(['input', 'change'])
    // La molette ne fait rien d'autre : pas de défilement.
    expect(up.defaultPrevented).toBe(true)
    wheel('#field', { deltaY: 100, shiftKey: true })
    wheel('#field', { deltaY: 100, shiftKey: true })
    expect(field.value).toBe('9')
  })

  it('lit le cran dans deltaX : avec Maj, Chromium fait défiler à l’horizontale', () => {
    const field = panel()
    wheel('#field', { deltaX: -100, deltaY: 0, shiftKey: true })
    expect(field.value).toBe('11')
    wheel('#field', { deltaX: 100, deltaY: 0, shiftKey: true })
    expect(field.value).toBe('10')
  })

  it('sans Maj, laisse la molette faire défiler le panneau', () => {
    const field = panel()
    const plain = wheel('#field', { deltaY: -100 })
    expect(field.value).toBe('10')
    expect(events).toEqual([])
    expect(plain.defaultPrevented).toBe(false)
    // Avec une autre touche en plus de Maj non plus.
    wheel('#field', { deltaY: -100, shiftKey: true, ctrlKey: true })
    expect(field.value).toBe('10')
  })

  it('vaut aussi sur le libellé du champ, mais pas sur un champ de texte', () => {
    const field = panel()
    expect(numberFieldAt(document.querySelector('#name'))).toBe(field)
    wheel('#name', { deltaY: -100, shiftKey: true })
    expect(field.value).toBe('11')
    expect(numberFieldAt(document.querySelector('#text'))).toBeNull()
    const other = wheel('#text', { deltaY: -100, shiftKey: true })
    expect(other.defaultPrevented).toBe(false)
    expect(document.querySelector<HTMLInputElement>('#text')?.value).toBe('abc')
  })

  it('suit le pas et les bornes du champ', () => {
    const field = panel('step="0.5" min="0.5" max="2" value="1.5"')
    wheel('#field', { deltaY: -100, shiftKey: true })
    expect(field.value).toBe('2')
    // À la borne : rien ne change, rien n'est validé, mais la molette reste retenue.
    events = []
    const stuck = wheel('#field', { deltaY: -100, shiftKey: true })
    expect(field.value).toBe('2')
    expect(events).toEqual([])
    expect(stuck.defaultPrevented).toBe(true)
  })

  it('ne touche ni à un champ désactivé ni à un champ vide', () => {
    const disabled = panel('value="10" disabled')
    wheel('#name', { deltaY: -100, shiftKey: true })
    expect(disabled.value).toBe('10')
    const empty = panel('value=""')
    wheel('#field', { deltaY: -100, shiftKey: true })
    expect(empty.value).toBe('')
    expect(events).toEqual([])
  })
})
