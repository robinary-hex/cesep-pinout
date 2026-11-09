import type { UpdateStatus } from '../../electron/api'

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
    case 'manual':
      return `Nouvelle version ${status.version} : télécharger`
    case 'error':
      return 'Mise à jour impossible : réessayer'
  }
}

export function updateButtonTitle(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
      return 'Une nouvelle version est publiée sur GitHub ; clic pour la télécharger en arrière-plan.'
    case 'downloading':
      return 'Téléchargement en cours ; tu peux continuer à travailler.'
    case 'downloaded':
      return 'La mise à jour est prête : clic pour l’installer et relancer Pinout.'
    case 'manual':
      return 'Version portable : ouvre la page de la release pour télécharger le nouvel exécutable.'
    case 'error':
      return status.message
  }
}
