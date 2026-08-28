import type { TranslationKey } from '../i18n'

type PgErrorCode = '23503' | '23505'

/** Перетворює помилку PostgREST (за кодом обмеження — 23503 "порушення
 *  зв'язку", 23505 "дублікат") на дружнє повідомлення за наданою мапою
 *  code → ключ перекладу; якщо коду немає в мапі — "сирий" `error.message`. */
export function friendlyPgError(
  error: { message: string; code?: string },
  codeMap: Partial<Record<PgErrorCode, TranslationKey>>,
  t: (key: TranslationKey) => string,
): string {
  const key = error.code ? codeMap[error.code as PgErrorCode] : undefined
  return key ? t(key) : error.message
}

/** Найпоширеніший випадок: видалення заблоковане зв'язком (23503) або запис
 *  із таким значенням уже існує (23505). */
export function friendlyReferenceOrDuplicateError(
  error: { message: string; code?: string },
  t: (key: TranslationKey) => string,
): string {
  return friendlyPgError(error, { '23503': 'errors.cannotDeleteInUse', '23505': 'errors.alreadyExists' }, t)
}

/** Лише зв'язок (23503) — без окремого повідомлення на дублікат. */
export function friendlyReferenceError(
  error: { message: string; code?: string },
  t: (key: TranslationKey) => string,
): string {
  return friendlyPgError(error, { '23503': 'errors.referenceError' }, t)
}
