/**
 * Contrat du pont IPC entre le rendu (Vue) et le processus principal (Node).
 * Fichier partagé : importé en valeur par main et preload, en types seulement par le rendu.
 * Le rendu ne touche jamais Node directement : tout passe par ces fonctions.
 */

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
  /** Choisir un dossier plutôt qu'un fichier. */
  directory?: boolean
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

export interface AppPaths {
  /** Dossier de données de l'application (%APPDATA%\Pinout). */
  userData: string
  /** Dossier Documents de l'utilisateur. */
  documents: string
  /** Racine OneDrive de la machine (OneDriveCommercial, sinon OneDrive), ou null sans OneDrive. */
  oneDrive: string | null
  /**
   * Dossier de Pinout imposé par la variable d'environnement PINOUT_DATA_DIR, ou null. Pour les
   * essais automatisés : ils ne doivent ni rencontrer la question du premier lancement, ni
   * toucher aux données de l'utilisateur.
   */
  presetDataDir: string | null
}

export interface DirEntry {
  name: string
  isDirectory: boolean
}

/**
 * Demandes du processus principal au rendu. ask-then-quit : la fenêtre se ferme avec des
 * modifications, le rendu pose la question « enregistrer ? » dans sa propre boîte. Les deux
 * autres viennent du dialogue de Windows, qui ne sert plus que si le rendu ne répond pas :
 * discard-then-quit, abandonner les modifications (copie de secours effacée) ; save-then-quit,
 * enregistrer d'abord.
 */
export type AppRequest = 'ask-then-quit' | 'discard-then-quit' | 'save-then-quit'

/** État de la mise à jour automatique, envoyé par le principal au fil de l'eau. */
export type UpdateStatus =
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  /** Installeur demandé : Windows pose sa question, l'application se ferme dès qu'il tourne. */
  | { state: 'installing'; version: string }
  /** Version portable : pas d'installation possible, on renvoie vers la page de la release. */
  | { state: 'manual'; version: string; url: string }
  /** Un téléchargement ou une installation a échoué ; une recherche qui échoue ne se dit pas. */
  | { state: 'error'; message: string }

/** Ce que donne une recherche de mise à jour demandée par l'utilisateur. */
export type UpdateCheckResult =
  /** Une version plus récente est publiée : le bouton de la barre d'application s'en occupe. */
  | { outcome: 'available'; version: string }
  /** L'application est à jour ; `version` est celle qui tourne. */
  | { outcome: 'none'; version: string }
  /** La recherche n'a pas abouti (hors ligne, GitHub injoignable). */
  | { outcome: 'failed'; message: string }
  /** Pas de mise à jour automatique ici (en développement). */
  | { outcome: 'unsupported' }

export interface PinoutApi {
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  /** Contenu binaire encodé en base64. */
  readBinaryFile(path: string): Promise<string>
  writeBinaryFile(path: string, base64: string): Promise<void>
  /** Entrées d'un dossier ; liste vide si le dossier n'existe pas. */
  readDir(path: string): Promise<DirEntry[]>
  pathExists(path: string): Promise<boolean>
  /** Crée un dossier, et ceux qui le contiennent ; sans effet s'il existe déjà. */
  ensureDir(path: string): Promise<void>
  /** Supprime un fichier (pas un dossier) ; sans effet s'il n'existe pas. */
  deleteFile(path: string): Promise<void>
  /** Supprime un dossier de composant ; refusé s'il ne contient pas component.json. */
  removeComponentFolder(path: string): Promise<void>
  /** Montre un fichier ou un dossier dans l'Explorateur de fichiers, sélectionné. */
  showInFolder(path: string): Promise<void>
  /** Retourne le chemin choisi, ou null si l'utilisateur annule. */
  showOpenDialog(options?: OpenDialogOptions): Promise<string | null>
  /** Retourne le chemin choisi, ou null si l'utilisateur annule. */
  showSaveDialog(options?: SaveDialogOptions): Promise<string | null>
  getAppPaths(): Promise<AppPaths>
  /** Fichier (.pinout ou .json) passé au lancement par un double-clic ou « Ouvrir avec ». */
  getLaunchFile(): Promise<string | null>
  /**
   * Écoute les fichiers à ouvrir que le principal transmet quand on en double-clique un alors
   * que Pinout tourne déjà ; retourne la fonction qui désabonne.
   */
  onOpenFile(handler: (path: string) => void): () => void
  /** Chemin sur disque d'un fichier déposé dans la fenêtre (objet File) ; vide s'il n'en a pas. */
  pathForFile(file: unknown): string
  /** Informe le principal qu'il y a des modifications non enregistrées (garde à la fermeture). */
  setDirty(dirty: boolean): Promise<void>
  /** Accuse réception de `ask-then-quit` : le rendu pose la question, pas le dialogue de Windows. */
  quitAsked(): Promise<void>
  /** Après la copie de secours ou l'enregistrement, autorise la fermeture demandée. */
  confirmQuit(): Promise<void>
  /** L'enregistrement demandé avant de quitter a été abandonné : la fenêtre reste ouverte. */
  cancelQuit(): Promise<void>
  /** Écoute les demandes du principal ; retourne la fonction qui désabonne. */
  onAppRequest(handler: (request: AppRequest) => void): () => void
  /** Version de l'application qui tourne. */
  getAppVersion(): Promise<string>
  /** Écoute l'état de la mise à jour automatique ; retourne la fonction qui désabonne. */
  onUpdateStatus(handler: (status: UpdateStatus) => void): () => void
  /**
   * Dernier état de la mise à jour, ou null s'il n'y a rien à faire. À demander une fois à
   * l'écoute : l'état a pu être envoyé avant que le rendu ne soit prêt à le recevoir.
   */
  getUpdateStatus(): Promise<UpdateStatus | null>
  /** Cherche une mise à jour maintenant, à la demande, et dit ce qu'il en est. */
  checkForUpdate(): Promise<UpdateCheckResult>
  /** Télécharge la mise à jour disponible en arrière-plan. */
  downloadUpdate(): Promise<void>
  /**
   * Installe la mise à jour téléchargée et relance l'application. La promesse est tenue quand
   * l'installeur tourne (l'application se ferme alors) ou qu'il n'a pas démarré (refus, échec).
   */
  installUpdate(): Promise<void>
}

export const IPC = {
  readTextFile: 'fs:read-text-file',
  writeTextFile: 'fs:write-text-file',
  readBinaryFile: 'fs:read-binary-file',
  writeBinaryFile: 'fs:write-binary-file',
  readDir: 'fs:read-dir',
  pathExists: 'fs:path-exists',
  ensureDir: 'fs:ensure-dir',
  deleteFile: 'fs:delete-file',
  removeComponentFolder: 'fs:remove-component-folder',
  showInFolder: 'shell:show-in-folder',
  showOpenDialog: 'dialog:open',
  showSaveDialog: 'dialog:save',
  getAppPaths: 'app:paths',
  launchFile: 'app:launch-file',
  openFile: 'app:open-file',
  setDirty: 'app:set-dirty',
  quitAsked: 'app:quit-asked',
  confirmQuit: 'app:confirm-quit',
  cancelQuit: 'app:cancel-quit',
  appRequest: 'app:request',
  appVersion: 'app:version',
  updateStatus: 'update:status',
  getUpdateStatus: 'update:get-status',
  checkForUpdate: 'update:check',
  downloadUpdate: 'update:download',
  installUpdate: 'update:install'
} as const
