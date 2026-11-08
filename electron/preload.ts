import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type OpenDialogOptions, type PinoutApi, type SaveDialogOptions } from './api'

// Pont IPC typé : la seule surface que le rendu voit du processus principal.
const api: PinoutApi = {
  readTextFile: (path) => ipcRenderer.invoke(IPC.readTextFile, path),
  writeTextFile: (path, content) => ipcRenderer.invoke(IPC.writeTextFile, path, content),
  showOpenDialog: (options?: OpenDialogOptions) => ipcRenderer.invoke(IPC.showOpenDialog, options),
  showSaveDialog: (options?: SaveDialogOptions) => ipcRenderer.invoke(IPC.showSaveDialog, options),
  getAppPaths: () => ipcRenderer.invoke(IPC.getAppPaths)
}

contextBridge.exposeInMainWorld('pinout', api)
