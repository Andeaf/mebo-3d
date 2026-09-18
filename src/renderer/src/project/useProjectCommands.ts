import { useMemo } from 'react'
import { parseProject, serializeProject, type ProjectMetadata } from '@core/project'
import { projectNameFromPath } from '@state/projectStatus'
import { pushRecent, removeRecent } from '@state/recentProjects'
import { useAppStore } from '@state/store'
import { useT, type Translate } from '../i18n'

/**
 * The project lifecycle flows — New, Open, Save, Save As, close — composed
 * from translated labels, the native dialogs behind `window.api` and the
 * store's small synchronous setters. Orchestration lives here rather than in
 * the store so `src/state` never imports renderer dictionaries.
 *
 * Every flow resolves to whether it COMPLETED: a cancelled dialog, a refused
 * file or a failed write all resolve `false`, and the failure is put on the
 * store's `projectError` so it is never silent.
 */
export interface ProjectCommands {
  /** Clean → true; dirty → ask; save (or its failure) / discard / cancel decide. */
  readonly guardUnsaved: () => Promise<boolean>
  readonly newProject: () => Promise<boolean>
  readonly openProject: () => Promise<boolean>
  readonly openRecent: (path: string) => Promise<boolean>
  /** A file handed over by the OS (double-clicked .mebo, first or second instance): guard, then open. */
  readonly openExternal: (path: string) => Promise<boolean>
  readonly save: () => Promise<boolean>
  readonly saveAs: () => Promise<boolean>
  /** The window is closing: run the guard, then let main close for real. */
  readonly requestClose: () => Promise<void>
}

function dirname(path: string): string | null {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separator === -1 ? null : path.slice(0, separator)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildCommands(t: Translate): ProjectCommands {
  const api = window.api
  const store = useAppStore

  const rememberRecent = (path: string): void => {
    const { recentProjects, setRecentProjects } = store.getState()
    setRecentProjects(
      pushRecent(recentProjects, {
        path,
        name: projectNameFromPath(path),
        openedAt: new Date().toISOString()
      })
    )
  }

  const saveTo = async (path: string): Promise<boolean> => {
    const { scene, project, setProjectError, markProjectSaved } = store.getState()
    const now = new Date().toISOString()
    const metadata: ProjectMetadata = {
      projectName: projectNameFromPath(path),
      createdAt: project.createdAt ?? now,
      modifiedAt: now,
      appVersion: __APP_VERSION__
    }
    const result = await api.writeProjectFile(path, serializeProject(scene, metadata))
    if (!result.ok) {
      setProjectError(`${t('project.saveError')} ${result.message}`)
      return false
    }
    markProjectSaved(path, now)
    setProjectError(null)
    rememberRecent(path)
    return true
  }

  const saveAs = async (): Promise<boolean> => {
    const { project } = store.getState()
    const path = await api.showSaveProjectDialog({
      suggestedName: project.name ?? t('project.untitled'),
      currentDir: project.path === null ? null : dirname(project.path),
      filterName: t('project.fileFilter')
    })
    return path === null ? false : saveTo(path)
  }

  const save = async (): Promise<boolean> => {
    const { project } = store.getState()
    return project.path === null ? saveAs() : saveTo(project.path)
  }

  const guardUnsaved = async (): Promise<boolean> => {
    if (!store.getState().project.dirty) {
      return true
    }
    const choice = await api.confirmUnsaved({
      title: t('project.unsavedTitle'),
      message: t('project.unsavedMessage'),
      save: t('project.saveButton'),
      discard: t('project.discardButton'),
      cancel: t('project.cancelButton')
    })
    switch (choice) {
      case 'save':
        return save()
      case 'discard':
        return true
      case 'cancel':
        return false
    }
  }

  const openPath = async (path: string, fromRecent: boolean): Promise<boolean> => {
    const { setProjectError, loadProject, recentProjects, setRecentProjects } = store.getState()
    const result = await api.readProjectFile(path)
    if (!result.ok) {
      if (fromRecent && result.reason === 'not-found') {
        setRecentProjects(removeRecent(recentProjects, path))
        setProjectError(`${t('project.fileMissing')} ${path}`)
      } else {
        setProjectError(`${t('project.openError')} ${result.message}`)
      }
      return false
    }
    try {
      loadProject(parseProject(result.text), path)
    } catch (error) {
      setProjectError(`${t('project.openError')} ${messageOf(error)}`)
      return false
    }
    rememberRecent(path)
    return true
  }

  const openProject = async (): Promise<boolean> => {
    if (!(await guardUnsaved())) {
      return false
    }
    const path = await api.showOpenProjectDialog(t('project.fileFilter'))
    return path === null ? false : openPath(path, false)
  }

  const openRecent = async (path: string): Promise<boolean> => {
    if (!(await guardUnsaved())) {
      return false
    }
    return openPath(path, true)
  }

  const newProject = async (): Promise<boolean> => {
    if (!(await guardUnsaved())) {
      return false
    }
    store.getState().resetProject()
    return true
  }

  const openExternal = async (path: string): Promise<boolean> => {
    if (!(await guardUnsaved())) {
      return false
    }
    return openPath(path, false)
  }

  const requestClose = async (): Promise<void> => {
    if (await guardUnsaved()) {
      api.confirmClose()
    }
  }

  return { guardUnsaved, newProject, openProject, openRecent, openExternal, save, saveAs, requestClose }
}

export function useProjectCommands(): ProjectCommands {
  const t = useT()
  // Rebuilt when the language changes so dialogs speak the current language.
  return useMemo(() => buildCommands(t), [t])
}
