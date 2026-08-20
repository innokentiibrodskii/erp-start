import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Locale, type TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   Мова інтерфейсу (UK/EN) — стосується лише текстів застосунку
   (кнопки, лейбли, заголовки). Дані, які вносить користувач,
   цим контекстом не перекладаються.

   Вибір зберігається в localStorage і діє одразу для всієї сесії,
   без прив'язки до організації — той самий патерн, що й для
   локальних налаштувань сортування/фільтрів (ls/lsSet у сторінках).
─────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'rd_locale'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Переклад ключа інтерфейсу; {{var}} у рядку підставляється зі vars. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  /** Показ довідникової назви залежно від мови інтерфейсу (name_en у БД):
   *  укр. — лише українська назва;
   *  англ. — лише англійський варіант, з фолбеком на українську, якщо
   *  англ. ще не внесли (щоб ніколи не показати порожній рядок). */
  tn: (name: string, nameEn: string | null | undefined) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'uk'
  } catch {
    return 'uk'
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    let text = translations[locale][key] ?? translations.uk[key] ?? key
    if (vars) {
      for (const [name, value] of Object.entries(vars)) text = text.split(`{{${name}}}`).join(String(value))
    }
    return text
  }

  const tn = (name: string, nameEn: string | null | undefined): string => {
    const trimmedEn = nameEn?.trim() || null
    if (locale === 'en') return trimmedEn ?? name
    return name
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t, tn }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale має використовуватись всередині LocaleProvider')
  return ctx
}
