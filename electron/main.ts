import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  IPC,
  type AppPaths,
  type DirEntry,
  type OpenDialogOptions,
  type SaveDialogOptions
} from './api'

// Seul code du projet qui touche Node : fenêtre, fichiers, dialogues.

app.setName('Pinout')

const isDev = !app.isPackaged

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
    documents: app.getPath('documents')
  }))
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
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
