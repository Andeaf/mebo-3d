import { useState, type ReactElement } from 'react'
import { useT, type TranslationKey } from '../i18n'

interface TextFieldProps {
  readonly id: string
  readonly labelKey: TranslationKey
  readonly placeholderKey: TranslationKey
  readonly value: string
  readonly maxLength: number
  readonly onChange: (value: string) => void
}

/** Single-line text; commits on blur/Enter so every keystroke is not a scene change. */
export function TextField({
  id,
  labelKey,
  placeholderKey,
  value,
  maxLength,
  onChange
}: TextFieldProps): ReactElement {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (): void => {
    if (draft !== null) {
      const trimmed = draft.trim()
      if (trimmed !== value) {
        onChange(trimmed)
      }
      setDraft(null)
    }
  }

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {t(labelKey)}
        </label>
      </div>
      <input
        id={id}
        className="field__text"
        type="text"
        maxLength={maxLength}
        placeholder={t(placeholderKey)}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
        }}
      />
    </div>
  )
}
