import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  MeboApi,
  MenuAction,
  MenuModel,
  ProjectReadResult,
  ProjectWriteResult,
  SaveDialogOptions,
  UnsavedChoice,
  UnsavedDialogLabels
} from './api'

const api: MeboApi = {
  loadMaterialsFile: (): Promise<string> => ipcRenderer.invoke('materials:load'),

  showOpenProjectDialog: (filterName: string): Promise<string | null> =>
    ipcRenderer.invoke('project:open-dialog', filterName),
  showSaveProjectDialog: (options: SaveDialogOptions): Promise<string | null> =>
    ipcRenderer.invoke('project:save-dialog', options),
  readProjectFile: (path: string): Promise<ProjectReadResult> =>
    ipcRenderer.invoke('project:read', path),
  writeProjectFile: (path: string, text: string): Promise<ProjectWriteResult> =>
    ipcRenderer.invoke('project:write', path, text),
  confirmUnsaved: (labels: UnsavedDialogLabels): Promise<UnsavedChoice> =>
    ipcRenderer.invoke('project:confirm-unsaved', labels),

  setProjectDirty: (dirty: boolean): void => {
    ipcRenderer.send('project:set-dirty', dirty)
  },
  confirmClose: (): void => {
    ipcRenderer.send('project:confirm-close')
  },

  updateMenu: (menu: MenuModel): void => {
    ipcRenderer.send('menu:update', menu)
  },
  onMenuAction: (listener: (action: MenuAction) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, action: MenuAction): void => {
      listener(action)
    }
    ipcRenderer.on('menu:action', handler)
    return () => {
      ipcRenderer.removeListener('menu:action', handler)
    }
  },
  onCloseRequested: (listener: () => void): (() => void) => {
    const handler = (): void => {
      listener()
    }
    ipcRenderer.on('window:close-requested', handler)
    return () => {
      ipcRenderer.removeListener('window:close-requested', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
