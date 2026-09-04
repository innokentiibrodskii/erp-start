import type { MaterialCategory } from '../hooks/useCatalog'

export function fmt(n: number) { return Number.isInteger(n) ? n.toString() : n.toFixed(2) }

export function dateStr(ts: number) {
  return new Date(ts).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** `tn` — опційна функція білінгвального відображення (з useLocale()); якщо не
 *  передана, шлях будується з української назви без англійського відповідника. */
export function buildCatPath(id: string | null, all: MaterialCategory[], tn?: (name: string, nameEn: string | null | undefined) => string): string {
  if (!id) return ''
  const parts: string[] = []
  let cur: string | null = id
  while (cur) {
    const cat = all.find(c => c.id === cur)
    if (!cat) break
    parts.unshift(tn ? tn(cat.name, cat.nameEn) : cat.name)
    cur = cat.parentId
  }
  return parts.join(' / ')
}

/** Код партії приходу: дата + порядковий номер за день (клієнтська пропозиція) */
export function genBatchCode(seq: number) {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}-${String(seq).padStart(3, '0')}`
}

/** Ділить кількість партії на N серій з власними кодами (залишок — в останню серію) */
export function genSeries(batchCode: string, count: number, totalQty: number): { code: string; qty: number }[] {
  if (count < 1) return []
  const base = Math.floor((totalQty / count) * 100) / 100
  return Array.from({ length: count }, (_, i) => ({
    code: `${batchCode}/С-${String(i + 1).padStart(2, '0')}`,
    qty: i === count - 1 ? +(totalQty - base * (count - 1)).toFixed(2) : base,
  }))
}

/** Префікс артикула зі скорочень категорій від кореня до листа,
 *  великими літерами, розділені "-" (напр. "M-S"). */
export function buildArticlePrefix(categoryId: string | null, all: MaterialCategory[]): string {
  if (!categoryId) return ''
  const chain: MaterialCategory[] = []
  let cur: string | null = categoryId
  while (cur) {
    const cat = all.find(c => c.id === cur)
    if (!cat) break
    chain.unshift(cat)
    cur = cat.parentId
  }
  if (chain.length === 0) return ''
  return chain
    .map(c => (c.shortCode || c.name.charAt(0) || '?').toUpperCase())
    .join('-')
}

/** Артикул матеріалу для режиму "Авто" (organizations.material_sku_mode,
 *  sql/material_sku_mode.sql) — префікс зі скорочень категорій (buildArticlePrefix,
 *  напр. "T-O") + "-" + порядковий номер У МЕЖАХ ЦІЄЇ Ж КАТЕГОРІЇ (напр. "T-O-01").
 *  Береться МАКСИМАЛЬНИЙ уже використаний номер серед матеріалів цієї категорії
 *  з таким префіксом, а не їх кількість — інакше "дірка" в послідовності (напр.
 *  видалений матеріал) дає номер, який уже зайнятий (той самий урок, що й
 *  genProductArticle у hooks/useProducts.ts). */
export function genMaterialArticle(categoryId: string | null, all: MaterialCategory[], materials: { categoryId: string | null; code: string | null }[]): string {
  const prefix = buildArticlePrefix(categoryId, all)
  if (!prefix) return ''
  const maxSeq = materials.reduce((max, m) => {
    if (m.categoryId !== categoryId || !m.code || !m.code.startsWith(`${prefix}-`)) return max
    const n = Number(m.code.slice(prefix.length + 1))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `${prefix}-${String(maxSeq + 1).padStart(2, '0')}`
}
