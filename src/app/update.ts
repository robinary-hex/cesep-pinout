import type { UpdateCheckResult, UpdateStatus } from '../../electron/api'

// Libellés du bouton de mise à jour de la barre d'application, selon l'état envoyé par le
// processus principal (vérification sur les releases GitHub au lancement).

export function updateButtonLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
      return `Mise à jour ${status.version} : télécharger`
    case 'downloading':
      return `Téléchargement ${status.percent} %`
    case 'downloaded':
      return `Installer ${status.version} et relancer`
    case 'installing':
      return `Installation de ${status.version}…`
    case 'manual':
      return `Nouvelle version ${status.version} : télécharger`
    case 'error':
      return 'Mise à jour impossible : réessayer'
  }
}

export function updateButtonTitle(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
      return 'Télécharger en arrière-plan'
    case 'downloading':
      return 'Tu peux continuer à travailler'
    case 'downloaded':
      return 'Prête à installer'
    case 'installing':
      return 'Réponds à la question de Windows'
    case 'manual':
      return 'Ouvrir la page de la release'
    case 'error':
      return status.message
  }
}

/** Ce que dit la boîte après une recherche demandée par le menu Fichier : le message, sa précision. */
export function updateCheckMessage(result: UpdateCheckResult): { message: string; detail: string } {
  switch (result.outcome) {
    case 'available':
      return {
        message: `La version ${result.version} est disponible.`,
        detail: 'Le bouton en haut à droite s’en occupe.'
      }
    case 'none':
      return { message: `Pinout ${result.version} est à jour.`, detail: '' }
    case 'failed':
      return {
        message: 'La recherche d’une mise à jour n’a pas abouti.',
        detail: `${result.message}\n\nPinout réessaiera de lui-même dans quelques minutes.`
      }
    case 'unsupported':
      return {
        message: 'Pas de mise à jour automatique dans cette version de travail.',
        detail: ''
      }
  }
}
