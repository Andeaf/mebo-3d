import { useEffect, useRef } from 'react'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
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
  const recentProjects = useAppStore((state) => state.recentProjects)
  const language = useAppStore((state) => state.language)

  // Title: "● Name — Mebo 3D" while dirty; Electron mirrors document.title
  // onto the window.
  useEffect(() => {
    const name = project.name ?? t('project.untitled')
    document.title = `${project.dirty ? '● ' : ''}${name} — ${APP_NAME}`
  }, [project.name, project.dirty, t])

  useEffect(() => {
    window.api.setProjectDirty(project.dirty)
  }, [project.dirty])

  // The menu is rebuilt whenever its labels (language) or the recent list change.
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
        exit: t('menu.exit')
      },
      recent: recentProjects.map((entry) => ({ path: entry.path, name: entry.name }))
    })
  }, [language, recentProjects, t])

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
      void flow().finally(() => {
        busyRef.current = false
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
      } else {
        run(() => current.openRecent(action.openRecent))
      }
    })
    const offClose = window.api.onCloseRequested(() => {
      run(commandsRef.current.requestClose)
    })
    return () => {
      offMenu()
      offClose()
    }
  }, [])

  return null
}
