import { describe, expect, it } from 'vitest'
import { updateButtonLabel, updateButtonTitle } from './update'

describe('bouton de mise à jour', () => {
  it('dit quoi faire à chaque étape', () => {
    expect(updateButtonLabel({ state: 'available', version: '1.2.0' })).toBe(
      'Mise à jour 1.2.0 : télécharger'
    )
    expect(updateButtonLabel({ state: 'downloading', percent: 42 })).toBe('Téléchargement 42 %')
    expect(updateButtonLabel({ state: 'downloaded', version: '1.2.0' })).toBe(
      'Installer 1.2.0 et relancer'
    )
    // Installeur demandé : le bouton le dit, et renvoie à la question de Windows.
    expect(updateButtonLabel({ state: 'installing', version: '1.2.0' })).toBe(
      'Installation de 1.2.0…'
    )
    expect(updateButtonTitle({ state: 'installing', version: '1.2.0' })).toContain(
      'Windows demande l’autorisation'
    )
    expect(updateButtonLabel({ state: 'manual', version: '1.2.0', url: 'https://x' })).toBe(
      'Nouvelle version 1.2.0 : télécharger'
    )
    expect(updateButtonTitle({ state: 'error', message: 'Pas de réseau' })).toBe('Pas de réseau')
  })
})
