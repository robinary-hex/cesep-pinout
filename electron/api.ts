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
}

export interface DirEntry {
  name: string
  isDirectory: boolean
}

/** Demandes du processus principal au rendu. */
export type AppRequest = 'autosave-then-quit' | 'save-then-quit'

export interface PinoutApi {
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  /** Contenu binaire encodé en base64. */
  readBinaryFile(path: string): Promise<string>
  writeBinaryFile(path: string, base64: string): Promise<void>
  /** Entrées d'un dossier ; liste vide si le dossier n'existe pas. */
  readDir(path: string): Promise<DirEntry[]>
  pathExists(path: string): Promise<boolean>
  /** Supprime un fichier (pas un dossier) ; sans effet s'il n'existe pas. */
  deleteFile(path: string): Promise<void>
  /** Supprime un dossier de composant ; refusé s'il ne contient pas component.json. */
  removeComponentFolder(path: string): Promise<void>
  /** Retourne le chemin choisi, ou null si l'utilisateur annule. */
  showOpenDialog(options?: OpenDialogOptions): Promise<string | null>
  /** Retourne le chemin choisi, ou null si l'utilisateur annule. */
  showSaveDialog(options?: SaveDialogOptions): Promise<string | null>
  getAppPaths(): Promise<AppPaths>
  /** Fichier .json passé au lancement (« Ouvrir avec »), s'il existe. */
  getLaunchFile(): Promise<string | null>
  /** Informe le principal qu'il y a des modifications non enregistrées (garde à la fermeture). */
  setDirty(dirty: boolean): Promise<void>
  /** Après la copie de secours ou l'enregistrement, autorise la fermeture demandée. */
  confirmQuit(): Promise<void>
  /** L'enregistrement demandé avant de quitter a été abandonné : la fenêtre reste ouverte. */
  cancelQuit(): Promise<void>
  /** Écoute les demandes du principal ; retourne la fonction qui désabonne. */
  onAppRequest(handler: (request: AppRequest) => void): () => void
}

export const IPC = {
  readTextFile: 'fs:read-text-file',
  writeTextFile: 'fs:write-text-file',
  readBinaryFile: 'fs:read-binary-file',
  writeBinaryFile: 'fs:write-binary-file',
  readDir: 'fs:read-dir',
  pathExists: 'fs:path-exists',
  deleteFile: 'fs:delete-file',
  removeComponentFolder: 'fs:remove-component-folder',
  showOpenDialog: 'dialog:open',
  showSaveDialog: 'dialog:save',
  getAppPaths: 'app:paths',
  launchFile: 'app:launch-file',
  setDirty: 'app:set-dirty',
  confirmQuit: 'app:confirm-quit',
  cancelQuit: 'app:cancel-quit',
  appRequest: 'app:request'
} as const
