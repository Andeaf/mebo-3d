import { useEffect, useRef } from 'react'
import { canRedo, canUndo } from '@state/history'
import { isProjectDirty, useAppStore } from '@state/store'
import { useT } from '../i18n'
import { materialRepository } from '../materialRepository'
import { useProjectCommands } from './useProjectCommands'

const APP_NAME = 'Mebo 3D'

/**
 * Renders nothing. Keeps the window title, main's dirty mirror and the native
 * menu in step with the store, and routes menu actions and the close request
 * into the project commands.
 */
export function ProjectBridge(): null {
  const t = useT()
  const commands = useProjectCommands()
  const project = useAppStore((state) => state.project)
  // Derived, not stored: the scene is not the saved reference (an undo back
  // to it clears this without any bookkeeping).
  const dirty = useAppStore(isProjectDirty)
  const recentProjects = useAppStore((state) => state.recentProjects)
  const language = useAppStore((state) => state.language)
  const canUndoNow = useAppStore((state) => canUndo(state.history))
  const canRedoNow = useAppStore((state) => canRedo(state.history))

  // Title: "● Name — Mebo 3D" while dirty; Electron mirrors document.title
  // onto the window.
  useEffect(() => {
    const name = project.name ?? t('project.untitled')
    document.title = `${dirty ? '● ' : ''}${name} — ${APP_NAME}`
  }, [project.name, dirty, t])

  useEffect(() => {
    window.api.setProjectDirty(dirty)
  }, [dirty])

  // The menu is rebuilt whenever its labels (language), the recent list or
  // the undo/redo enabled states change (those flip rarely: the first edit,
  // the bottom of the stack, the top of the redo stack).
  useEffect(() => {
    window.api.updateMenu({
      labels: {
        file: t('menu.file'),
        new: t('menu.new'),
        open: t('menu.open'),
        openRecent: t('menu.openRecent'),
        noRecent: t('menu.noRecent'),
        save: t('menu.save'),
        saveAs: t('menu.saveAs'),
        exit: t('menu.exit'),
        edit: t('menu.edit'),
        undo: t('menu.undo'),
        redo: t('menu.redo'),
        prices: t('menu.prices'),
        openPriceList: t('menu.openPriceList'),
        reloadPrices: t('menu.reloadPrices')
      },
      recent: recentProjects.map((entry) => ({ path: entry.path, name: entry.name })),
      canUndo: canUndoNow,
      canRedo: canRedoNow
    })
  }, [language, recentProjects, canUndoNow, canRedoNow, t])

  // Subscriptions read the latest commands through a ref, so a language
  // switch mid-session does not tear down and re-register the IPC listeners.
  const commandsRef = useRef(commands)
  commandsRef.current = commands

  // One flow at a time: a second Ctrl+S while the save dialog is open, or a
  // menu click during the close guard, must not start a parallel dialog.
  const busyRef = useRef(false)
  useEffect(() => {
    const run = (flow: () => Promise<unknown>): void => {
      if (busyRef.current) {
        return
      }
      busyRef.current = true
      // Mirrored into the store: undo/redo are refused while a flow (and
      // its native dialog) is up, whichever way a key event arrives.
      useAppStore.getState().setFlowBusy(true)
      void flow().finally(() => {
        busyRef.current = false
        useAppStore.getState().setFlowBusy(false)
      })
    }
    const offMenu = window.api.onMenuAction((action) => {
      const current = commandsRef.current
      if (action === 'new') {
        run(current.newProject)
      } else if (action === 'open') {
        run(current.openProject)
      } else if (action === 'save') {
        run(current.save)
      } else if (action === 'save-as') {
        run(current.saveAs)
      } else if (action === 'undo') {
        // Straight to the store: no dialog, so not a flow for busyRef; the
        // store itself ignores it during a gesture.
        useAppStore.getState().undo()
      } else if (action === 'redo') {
        useAppStore.getState().redo()
      } else if (action === 'reload-prices') {
        // Not a document change and no dialog: the scene re-prices through
        // the priceDb selectors; the history and the dirty flag are untouched.
        void useAppStore.getState().loadMaterials(materialRepository)
      } else {
        run(() => current.openRecent(action.openRecent))
      }
    })
    const offClose = window.api.onCloseRequested(() => {
      run(commandsRef.current.requestClose)
    })
    // A .mebo double-clicked while the app runs. Arriving during a dialog it
    // is ignored (not queued); the window is focused, so the user sees the
    // dialog that is up.
    const offOpenFile = window.api.onOpenFileRequested((path) => {
      run(() => commandsRef.current.openExternal(path))
    })
    // The file this launch was started with, pulled now that the listeners exist.
    void window.api.getLaunchProjectPath().then((path) => {
      if (path !== null) {
        run(() => commandsRef.current.openExternal(path))
      }
    })
    return () => {
      offMenu()
      offClose()
      offOpenFile()
    }
  }, [])

  return null
}
