export type Language = 'nl' | 'en' | 'ro'

export const LANGUAGES: readonly Language[] = ['nl', 'en', 'ro']

export const DEFAULT_LANGUAGE: Language = 'nl'

const STORAGE_KEY = 'mebo.language'

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** Restores the persisted UI language; falls back to Dutch when unavailable. */
export function loadStoredLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Persistence is best-effort; the in-memory choice still applies.
  }
}
