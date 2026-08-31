import type { ReactElement } from 'react'
import { LANGUAGES } from '@state/language'
import { useAppStore } from '@state/store'
import { useT } from './i18n'

export function LanguageSwitcher(): ReactElement {
  const t = useT()
  const language = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)

  return (
    <div className="language-switcher" role="group" aria-label={t('app.language')}>
      {LANGUAGES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={
            candidate === language
              ? 'language-switcher__option language-switcher__option--active'
              : 'language-switcher__option'
          }
          onClick={() => setLanguage(candidate)}
        >
          {candidate.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
