import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AppRequest,
  type OpenDialogOptions,
  type PinoutApi,
  type SaveDialogOptions
} from './api'

// Pont IPC typé : la seule surface que le rendu voit du processus principal.
const api: PinoutApi = {
  readTextFile: (path) => ipcRenderer.invoke(IPC.readTextFile, path),
  writeTextFile: (path, content) => ipcRenderer.invoke(IPC.writeTextFile, path, content),
  readBinaryFile: (path) => ipcRenderer.invoke(IPC.readBinaryFile, path),
  writeBinaryFile: (path, base64) => ipcRenderer.invoke(IPC.writeBinaryFile, path, base64),
  readDir: (path) => ipcRenderer.invoke(IPC.readDir, path),
  pathExists: (path) => ipcRenderer.invoke(IPC.pathExists, path),
  deleteFile: (path) => ipcRenderer.invoke(IPC.deleteFile, path),
  removeComponentFolder: (path) => ipcRenderer.invoke(IPC.removeComponentFolder, path),
  showOpenDialog: (options?: OpenDialogOptions) => ipcRenderer.invoke(IPC.showOpenDialog, options),
  showSaveDialog: (options?: SaveDialogOptions) => ipcRenderer.invoke(IPC.showSaveDialog, options),
  getAppPaths: () => ipcRenderer.invoke(IPC.getAppPaths),
  getLaunchFile: () => ipcRenderer.invoke(IPC.launchFile),
  setDirty: (dirty) => ipcRenderer.invoke(IPC.setDirty, dirty),
  confirmQuit: () => ipcRenderer.invoke(IPC.confirmQuit),
  cancelQuit: () => ipcRenderer.invoke(IPC.cancelQuit),
  onAppRequest: (handler) => {
    const listener = (_event: IpcRendererEvent, request: AppRequest): void => handler(request)
    ipcRenderer.on(IPC.appRequest, listener)
    return () => ipcRenderer.removeListener(IPC.appRequest, listener)
  }
}

contextBridge.exposeInMainWorld('pinout', api)
