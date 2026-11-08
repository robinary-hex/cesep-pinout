import type { PinoutApi } from '../../electron/api'

/**
 * Accès au pont IPC. Lève une erreur claire hors d'Electron (tests, navigateur),
 * plutôt qu'un « cannot read property of undefined » au premier appel.
 */
export function bridge(): PinoutApi {
  const api = (globalThis as { pinout?: PinoutApi }).pinout
  if (!api) {
    throw new Error('Pont Electron indisponible : l’application doit tourner dans Electron.')
  }
  return api
}
