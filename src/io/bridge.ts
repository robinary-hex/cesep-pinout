import type { PinoutApi } from '../../electron/api'

let override: PinoutApi | null = null

/** Remplace le pont par une implémentation en mémoire (tests). null = retour à Electron. */
export function setBridge(api: PinoutApi | null): void {
  override = api
}

/**
 * Accès au pont IPC. Lève une erreur claire hors d'Electron (navigateur, tests sans fausse
 * implémentation), plutôt qu'un « cannot read property of undefined » au premier appel.
 */
export function bridge(): PinoutApi {
  if (override) return override
  const api = (globalThis as { pinout?: PinoutApi }).pinout
  if (!api) {
    throw new Error('Pont Electron indisponible : l’application doit tourner dans Electron.')
  }
  return api
}
