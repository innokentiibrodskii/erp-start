import uk, { type TranslationKey } from './uk'
import en from './en'

export type Locale = 'uk' | 'en'
export type { TranslationKey }

export const translations: Record<Locale, Record<TranslationKey, string>> = { uk, en }

/** Підпис самої мови на перемикачі (не залежить від того, яка мова зараз активна). */
export const LOCALE_LABEL: Record<Locale, string> = { uk: 'УКР', en: 'ENG' }
