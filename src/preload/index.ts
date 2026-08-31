import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** Raw text of data/materials.json; parsing/validation happens in the core. */
  loadMaterialsFile: (): Promise<string> => ipcRenderer.invoke('materials:load')
}

export type MeboApi = typeof api

contextBridge.exposeInMainWorld('api', api)
