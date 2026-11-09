import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { access, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  IPC,
  type AppPaths,
  type AppRequest,
  type DirEntry,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type UpdateStatus
} from './api'

// Seul code du projet qui touche Node : fenêtre, fichiers, dialogues, garde à la fermeture.

app.setName('Pinout')

const isDev = !app.isPackaged
const QUIT_FALLBACK_MS = 3000
const RELEASES_URL = 'https://github.com/robinary-hex/cesep-pinout/releases/latest'

/** Projet passé en argument (double-clic « Ouvrir avec » ou ligne de commande). */
const launchFile =
  process.argv.slice(1).find((arg) => /\.json$/i.test(arg) && !arg.startsWith('-')) ?? null

/** Le rendu tient cet indicateur à jour ; il décide de la question à la fermeture. */
let dirty = false
/** Vrai une fois la fermeture acceptée : la fenêtre se ferme sans redemander. */
let quitting = false
/** Fermeture forcée si le rendu ne répond pas après « Ne pas enregistrer ». */
let quitFallback: ReturnType<typeof setTimeout> | null = null

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.readTextFile, (_event, path: string) => readFile(path, 'utf8'))

  ipcMain.handle(IPC.writeTextFile, async (_event, path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
  })

  ipcMain.handle(IPC.readBinaryFile, async (_event, path: string) =>
    (await readFile(path)).toString('base64')
  )

  ipcMain.handle(IPC.writeBinaryFile, async (_event, path: string, base64: string) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(base64, 'base64'))
  })

  ipcMain.handle(IPC.readDir, async (_event, path: string): Promise<DirEntry[]> => {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  })

  ipcMain.handle(IPC.pathExists, (_event, path: string) => exists(path))

  ipcMain.handle(IPC.deleteFile, async (_event, path: string) => {
    try {
      await unlink(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  })

  ipcMain.handle(IPC.removeComponentFolder, async (_event, path: string) => {
    if (!(await exists(join(path, 'component.json')))) {
      throw new Error(`Le dossier ${path} ne contient pas de component.json : suppression refusée`)
    }
    await rm(path, { recursive: true, force: true })
  })

  ipcMain.handle(IPC.showOpenDialog, async (event, options: OpenDialogOptions = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const { directory, ...rest } = options
    const properties: Array<'openFile' | 'openDirectory'> = [
      directory ? 'openDirectory' : 'openFile'
    ]
    const settings = { ...rest, properties }
    const result = owner
      ? await dialog.showOpenDialog(owner, settings)
      : await dialog.showOpenDialog(settings)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.showSaveDialog, async (event, options: SaveDialogOptions = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle(IPC.getAppPaths, (): AppPaths => ({
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    oneDrive: process.env['OneDriveCommercial'] ?? process.env['OneDrive'] ?? null
  }))

  ipcMain.handle(IPC.launchFile, async () =>
    launchFile !== null && (await exists(launchFile)) ? launchFile : null
  )

  ipcMain.handle(IPC.setDirty, (_event, value: boolean) => {
    dirty = value
  })

  ipcMain.handle(IPC.confirmQuit, (event) => {
    if (quitFallback) clearTimeout(quitFallback)
    quitting = true
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC.cancelQuit, () => {
    if (quitFallback) clearTimeout(quitFallback)
    quitFallback = null
  })

  ipcMain.handle(IPC.downloadUpdate, async () => {
    if (app.isPackaged) await autoUpdater.downloadUpdate()
  })

  ipcMain.handle(IPC.installUpdate, () => {
    if (!app.isPackaged) return
    quitting = true
    autoUpdater.quitAndInstall()
  })
}

/**
 * Mise à jour automatique depuis les releases GitHub : vérification au lancement, téléchargement
 * quand l'utilisateur le demande, installation au clic. La version portable ne peut pas se
 * réinstaller : elle est renvoyée vers la page de la release. Rien en développement.
 */
function setupUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) return
  const portable = process.env['PORTABLE_EXECUTABLE_DIR'] !== undefined
  const send = (status: UpdateStatus): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.updateStatus, status)
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.setFeedURL({ provider: 'github', owner: 'robinary-hex', repo: 'cesep-pinout' })
  autoUpdater.on('update-available', (info) => {
    send(
      portable
        ? { state: 'manual', version: info.version, url: RELEASES_URL }
        : { state: 'available', version: info.version }
    )
  })
  autoUpdater.on('download-progress', (progress) => {
    send({ state: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) =>
    send({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (error) => send({ state: 'error', message: error.message }))
  // Hors ligne ou GitHub injoignable : on se tait, l'application démarre normalement.
  autoUpdater.checkForUpdates().catch(() => undefined)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Pinout',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  setupUpdater(mainWindow)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Garde à la fermeture : avec des modifications non enregistrées, on propose d'enregistrer ;
  // le rendu enregistre, ou abandonne (la copie de secours est effacée : au prochain lancement,
  // rien n'est proposé), puis confirme ; il annule si l'utilisateur renonce au choix du fichier.
  // Une copie de secours ne survit donc qu'à un arrêt brutal, et c'est alors qu'elle est proposée.
  mainWindow.on('close', (event) => {
    if (quitting || !dirty) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Pinout',
      message: 'Enregistrer les modifications avant de quitter ?',
      detail: 'Sans enregistrement, les modifications sont perdues.',
      buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (choice === 2) return
    const request: AppRequest = choice === 0 ? 'save-then-quit' : 'discard-then-quit'
    mainWindow.webContents.send(IPC.appRequest, request)
    // Un enregistrement peut attendre un choix de fichier : pas de délai dans ce cas.
    if (request === 'discard-then-quit') {
      quitFallback = setTimeout(() => {
        if (!quitting && !mainWindow.isDestroyed()) {
          quitting = true
          mainWindow.destroy()
        }
      }, QUIT_FALLBACK_MS)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  app.setAppUserModelId('be.robin.pinout')
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
