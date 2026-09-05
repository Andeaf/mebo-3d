import type { ReactElement } from 'react'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

/** The in-app strip for a failed open or save: a refused file is never silent. */
export function ProjectNotice(): ReactElement | null {
  const t = useT()
  const projectError = useAppStore((state) => state.projectError)
  const setProjectError = useAppStore((state) => state.setProjectError)

  if (projectError === null) {
    return null
  }
  return (
    <div className="notice notice--error" role="alert">
      <p className="notice__text">{projectError}</p>
      <button type="button" className="notice__dismiss" onClick={() => setProjectError(null)}>
        {t('project.dismiss')}
      </button>
    </div>
  )
}
