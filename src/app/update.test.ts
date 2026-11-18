import { describe, expect, it } from 'vitest'
import { TIP_MAX_LENGTH } from '@/ui/tooltip'
import { updateButtonLabel, updateButtonTitle, updateCheckMessage } from './update'

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
    expect(updateButtonTitle({ state: 'installing', version: '1.2.0' })).toBe(
      'Réponds à la question de Windows'
    )
    expect(updateButtonLabel({ state: 'manual', version: '1.2.0', url: 'https://x' })).toBe(
      'Nouvelle version 1.2.0 : télécharger'
    )
    expect(updateButtonTitle({ state: 'error', message: 'Pas de réseau' })).toBe('Pas de réseau')
    // Ses infobulles sont courtes, comme toutes celles de l'application.
    for (const title of [
      updateButtonTitle({ state: 'available', version: '1.2.0' }),
      updateButtonTitle({ state: 'downloading', percent: 42 }),
      updateButtonTitle({ state: 'downloaded', version: '1.2.0' }),
      updateButtonTitle({ state: 'installing', version: '1.2.0' }),
      updateButtonTitle({ state: 'manual', version: '1.2.0', url: 'https://x' })
    ]) {
      expect(title.length, title).toBeLessThanOrEqual(TIP_MAX_LENGTH)
    }
  })
})

describe('recherche d’une mise à jour demandée par le menu', () => {
  it('dit ce qu’il en est : disponible, à jour, ou recherche sans résultat', () => {
    expect(updateCheckMessage({ outcome: 'available', version: '1.9.1' })).toEqual({
      message: 'La version 1.9.1 est disponible.',
      detail: 'Le bouton en haut à droite s’en occupe.'
    })
    // Au premier lancement, la barre d'application est cachée : le bouton est dans la boîte.
    expect(updateCheckMessage({ outcome: 'available', version: '1.9.1' }, true).detail).toBe(
      'Le bouton de la boîte « Dossier de Pinout » s’en occupe.'
    )
    expect(updateCheckMessage({ outcome: 'none', version: '1.9.0' })).toEqual({
      message: 'Pinout 1.9.0 est à jour.',
      detail: ''
    })
    // L'échec donne sa raison, et dit que Pinout réessaiera.
    const failed = updateCheckMessage({ outcome: 'failed', message: 'net::ERR_NAME_NOT_RESOLVED' })
    expect(failed.message).toBe('La recherche d’une mise à jour n’a pas abouti.')
    expect(failed.detail).toContain('net::ERR_NAME_NOT_RESOLVED')
    expect(failed.detail).toContain('réessaiera')
    expect(updateCheckMessage({ outcome: 'unsupported' }).message).toContain('Pas de mise à jour')
  })
})
