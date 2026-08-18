import type { MaterialCategory } from '../hooks/useCatalog'

export function fmt(n: number) { return Number.isInteger(n) ? n.toString() : n.toFixed(2) }

export function dateStr(ts: number) {
  return new Date(ts).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function buildCatPath(id: string | null, all: MaterialCategory[]): string {
  if (!id) return ''
  const parts: string[] = []
  let cur: string | null = id
  while (cur) {
    const cat = all.find(c => c.id === cur)
    if (!cat) break
    parts.unshift(cat.name)
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

/** Артикул матеріалу: префікс категорії + "-" + порядковий номер у цій категорії */
export function genMaterialArticle(categoryId: string | null, all: MaterialCategory[], seq: number): string {
  const prefix = buildArticlePrefix(categoryId, all)
  if (!prefix) return ''
  return `${prefix}-${String(seq).padStart(2, '0')}`
}
