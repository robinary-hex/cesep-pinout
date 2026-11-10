import type { AppRequest, DirEntry, PinoutApi, SaveChoice } from '../../../electron/api'

/**
 * Système de fichiers en mémoire qui imite le pont Electron, pour les tests.
 * Les chemins sont normalisés avec « / » ; un dossier existe dès qu'un fichier s'y trouve.
 */
export class FakeFs implements PinoutApi {
  readonly texts = new Map<string, string>()
  readonly binaries = new Map<string, string>()
  /** Réponses programmées des dialogues : chaque appel consomme la première. */
  readonly openDialogAnswers: Array<string | null> = []
  readonly saveDialogAnswers: Array<string | null> = []
  /** Réponses programmées au dialogue « Enregistrer les modifications ? » ; Annuler par défaut. */
  readonly confirmSaveAnswers: SaveChoice[] = []
  dirty = false
  quitConfirmed = false
  private readonly requestHandlers = new Set<(request: AppRequest) => void>()
  private readonly openFileHandlers = new Set<(path: string) => void>()

  private norm(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '')
  }

  private keys(): string[] {
    return [...this.texts.keys(), ...this.binaries.keys()]
  }

  async readTextFile(path: string): Promise<string> {
    const text = this.texts.get(this.norm(path))
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return text
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    this.texts.set(this.norm(path), content)
  }

  async readBinaryFile(path: string): Promise<string> {
    const data = this.binaries.get(this.norm(path))
    if (data === undefined) throw new Error(`ENOENT: ${path}`)
    return data
  }

  async writeBinaryFile(path: string, base64: string): Promise<void> {
    this.binaries.set(this.norm(path), base64)
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const prefix = this.norm(path) + '/'
    const names = new Map<string, boolean>()
    for (const key of this.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) names.set(rest, false)
      else names.set(rest.slice(0, slash), true)
    }
    return [...names].map(([name, isDirectory]) => ({ name, isDirectory }))
  }

  async pathExists(path: string): Promise<boolean> {
    const n = this.norm(path)
    return this.keys().some((key) => key === n || key.startsWith(n + '/'))
  }

  async deleteFile(path: string): Promise<void> {
    const n = this.norm(path)
    this.texts.delete(n)
    this.binaries.delete(n)
  }

  async removeComponentFolder(path: string): Promise<void> {
    const n = this.norm(path)
    if (!this.texts.has(n + '/component.json')) throw new Error('pas un dossier de composant')
    for (const key of this.keys()) {
      if (key.startsWith(n + '/')) {
        this.texts.delete(key)
        this.binaries.delete(key)
      }
    }
  }

  async showOpenDialog(): Promise<string | null> {
    return this.openDialogAnswers.shift() ?? null
  }

  async showSaveDialog(): Promise<string | null> {
    return this.saveDialogAnswers.shift() ?? null
  }

  async confirmSave(): Promise<SaveChoice> {
    return this.confirmSaveAnswers.shift() ?? 'cancel'
  }

  /** Racine OneDrive simulée ; null par défaut, comme une machine sans OneDrive. */
  oneDrive: string | null = null

  async getAppPaths(): Promise<{ userData: string; documents: string; oneDrive: string | null }> {
    return { userData: 'C:/fake/Pinout', documents: 'C:/fake/Documents', oneDrive: this.oneDrive }
  }

  async getLaunchFile(): Promise<string | null> {
    return null
  }

  async setDirty(dirty: boolean): Promise<void> {
    this.dirty = dirty
  }

  async confirmQuit(): Promise<void> {
    this.quitConfirmed = true
  }

  async cancelQuit(): Promise<void> {
    this.quitConfirmed = false
  }

  onAppRequest(handler: (request: AppRequest) => void): () => void {
    this.requestHandlers.add(handler)
    return () => this.requestHandlers.delete(handler)
  }

  /** Pas de mise à jour dans les tests : l'abonnement ne reçoit jamais rien. */
  onUpdateStatus(): () => void {
    return () => undefined
  }

  downloadUpdate(): Promise<void> {
    return Promise.resolve()
  }

  installUpdate(): Promise<void> {
    return Promise.resolve()
  }

  onOpenFile(handler: (path: string) => void): () => void {
    this.openFileHandlers.add(handler)
    return () => this.openFileHandlers.delete(handler)
  }

  /** Un « fichier » déposé est ici un objet portant son chemin. */
  pathForFile(file: unknown): string {
    const path = (file as { path?: unknown } | null)?.path
    return typeof path === 'string' ? path : ''
  }

  /** Simule un double-clic sur un fichier alors que l'application tourne. */
  emitOpenFile(path: string): void {
    for (const handler of this.openFileHandlers) handler(path)
  }

  /** Simule une demande du processus principal. */
  emitRequest(request: AppRequest): void {
    for (const handler of this.requestHandlers) handler(request)
  }
}
