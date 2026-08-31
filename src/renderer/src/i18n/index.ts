import type { Language } from '@state/language'
import { useAppStore } from '@state/store'
import { en } from './en'
import { nl, type TranslationKey } from './nl'
import { ro } from './ro'

export type { TranslationKey }

export const dictionaries: Record<Language, Record<TranslationKey, string>> = { nl, en, ro }

export type Translate = (key: TranslationKey) => string

/** Translation function bound to the current UI language in the store. */
export function useT(): Translate {
  const language = useAppStore((state) => state.language)
  const dictionary = dictionaries[language]
  return (key) => dictionary[key]
}
