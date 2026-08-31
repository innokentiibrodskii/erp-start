import { escapeHtml } from './html'
import { isCustomFieldKey, customFieldDefinitionId, isPhotoStatusFieldKey, photoStatusIdFromFieldKey } from '../hooks/usePrintFormTemplates'
import type { Product, ProductStatus } from '../hooks/useProducts'
import type { ProductCategory } from '../hooks/useCatalog'
import type { CustomFieldDefinition, BulkCustomFieldValue } from '../hooks/useCustomFields'

/* ───────────────────────────────────────────────────────────
   Друк "Друкованої форми" для продуктів — A4, один продукт = одна сторінка
   (референс: Figma https://www.figma.com/design/uKHK2G4Hz4GinuHHZZu5xu/R-D
   ?node-id=185-27294 — фото зліва, обрані поля + QR праворуч, назва
   організації в шапці). Той самий патерн document.write()+window.print(),
   що вже є в ProductCatalog.tsx (друк собівартості) і lib/qrLabel.ts.

   Фото: перше (обкладинка) — великим планом угорі поряд з полями/QR, до
   3 наступних із галереї — сіткою нижче (не більше 4 фото на сторінці разом,
   за проханням користувача).

   QR передається сюди вже готовим SVG-рядком на продукт (qrSvgByProductId) —
   зчитаним з реально змонтованих у DOM <QRCodeLib> (PrintFormsPage.tsx), тим
   самим прийомом, що вже є в lib/qrLabel.ts. Без react-dom/server: SSR-рендерер
   у клієнтському бандлі додав би ~200 kB/60 kB gzip лише заради серіалізації
   одного SVG — непропорційно для цієї задачі. */

const MAX_PHOTOS = 4

/** Одним рядком "Мітка: значення" — так само, як у Figma-референсі
 *  ("SKU: COF-008", "Статус:") — порожнє значення лишає тільки мітку
 *  з двокрапкою, без тире-заглушки. */
function fieldValueRow(label: string, value: string): string {
  return `<p class="field-row"><span class="field-label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`
}

function buildProductPageHtml(
  product: Product,
  fieldKeys: string[],
  labelOf: (key: string) => string,
  categories: ProductCategory[],
  statuses: ProductStatus[],
  customDefs: CustomFieldDefinition[],
  customValues: BulkCustomFieldValue[],
  qrSvgByProductId: Record<string, string>,
  orgName: string,
  selectedPhotoStatusIds: Set<string>,
  tn: (name: string, nameEn: string | null | undefined) => string,
): string {
  const rows: string[] = []
  let heroPhotoHtml = ''
  let extraPhotosHtml = ''
  let qrHtml = ''

  for (const key of fieldKeys) {
    if (key === 'photo') {
      // Якщо шаблон явно обрав конкретні статуси фото (Довідники → "Статуси
      // фото") — беремо лише їх; інакше фолбечимось на загальний is_visible
      // (той самий гейтинг, що й у звичайному перегляді продукту).
      const photos = (product.photos ?? [])
        .filter(p => selectedPhotoStatusIds.size > 0 ? (p.statusId !== null && selectedPhotoStatusIds.has(p.statusId)) : p.isVisible)
        .map(p => p.url)
      heroPhotoHtml = photos[0]
        ? `<img class="photo hero-photo" src="${escapeHtml(photos[0])}" alt="" />`
        : `<div class="photo hero-photo photo-empty"></div>`
      const extra = photos.slice(1, MAX_PHOTOS)
      extraPhotosHtml = extra.length > 0
        ? `<div class="extra-photos">${extra.map(url => `<img class="photo extra-photo" src="${escapeHtml(url)}" alt="" />`).join('')}</div>`
        : ''
      continue
    }
    if (key === 'qr') {
      const svg = qrSvgByProductId[product.id]
      qrHtml = svg ? `<div class="qr">${svg}</div>` : ''
      continue
    }
    if (key === 'name') { rows.push(`<p class="hero-title">${escapeHtml(product.name)}</p>`); continue }
    if (key === 'sku') { rows.push(fieldValueRow(labelOf(key), product.sku)); continue }
    if (key === 'description') { rows.push(fieldValueRow(labelOf(key), product.description)); continue }
    if (key === 'status') {
      const status = statuses.find(s => s.id === product.statusId)
      rows.push(fieldValueRow(labelOf(key), status ? tn(status.name, status.nameEn) : ''))
      continue
    }
    if (key === 'category') {
      const cat = categories.find(c => c.id === product.categoryId)
      rows.push(fieldValueRow(labelOf(key), cat ? tn(cat.name, cat.nameEn) : ''))
      continue
    }
    if (isCustomFieldKey(key)) {
      const defId = customFieldDefinitionId(key)
      const def = customDefs.find(d => d.id === defId)
      if (!def) continue
      const value = customValues.find(v => v.entityId === product.id && v.fieldDefinitionId === defId)
      let text = ''
      if (value) {
        if (def.fieldType === 'boolean') text = value.valueBoolean ? '✓' : ''
        else if (def.fieldType === 'number') text = value.valueNumber !== null ? String(value.valueNumber) : ''
        else if (def.fieldType === 'select') {
          const opt = def.options.find(o => o.id === value.valueOptionId)
          text = opt ? tn(opt.value, opt.valueEn) : ''
        } else text = value.valueText ?? ''
      }
      rows.push(fieldValueRow(tn(def.name, def.nameEn), text))
    }
  }

  return `<section class="page">
    <header class="page-header">${escapeHtml(orgName)}</header>
    <div class="hero">
      ${heroPhotoHtml}
      <div class="hero-body">${rows.join('')}</div>
      ${qrHtml}
    </div>
    ${extraPhotosHtml}
  </section>`
}

export function printProductForm(
  products: Product[],
  fieldKeys: string[],
  categories: ProductCategory[],
  statuses: ProductStatus[],
  customDefs: CustomFieldDefinition[],
  customValues: BulkCustomFieldValue[],
  qrSvgByProductId: Record<string, string>,
  orgName: string,
  windowTitle: string,
  labelOf: (key: string) => string,
  tn: (name: string, nameEn: string | null | undefined) => string,
) {
  if (products.length === 0) return

  const selectedPhotoStatusIds = new Set(fieldKeys.filter(isPhotoStatusFieldKey).map(photoStatusIdFromFieldKey))
  const pages = products
    .map(p => buildProductPageHtml(p, fieldKeys, labelOf, categories, statuses, customDefs, customValues, qrSvgByProductId, orgName, selectedPhotoStatusIds, tn))
    .join('')

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(windowTitle)}</title>
  <meta charset="utf-8" />
  <style>
    *{box-sizing:border-box}
    body{font-family:'DM Sans',Arial,sans-serif;margin:0;color:#1d293d}
    .page{width:210mm;min-height:297mm;padding:16mm;page-break-after:always}
    .page:last-child{page-break-after:auto}
    .page-header{text-align:right;color:#e17100;font-size:18px;margin-bottom:14mm}
    .hero{display:flex;align-items:flex-start;gap:28px}
    .photo{object-fit:contain;background:#f1f5f9;border-radius:8px}
    .hero-photo{width:340px;height:340px;flex-shrink:0}
    .photo-empty{background:#f1f5f9}
    .hero-body{flex:1;min-width:0;padding-top:6px}
    .hero-title{font-family:'DM Sans',Arial,sans-serif;font-weight:600;font-size:20px;color:#1d293d;margin:0 0 8px;line-height:26px}
    .field-row{font-size:14px;color:#90a1b9;line-height:22px;margin:0}
    .field-row .field-label{color:#90a1b9}
    .qr{flex-shrink:0;width:170px;height:170px;margin-left:auto}
    .qr svg{width:100%;height:100%}
    .extra-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:14mm}
    .extra-photo{width:100%;height:100mm}
    @media print { @page { size: A4; margin: 0 } }
  </style></head><body>
  ${pages}
  <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`)
  win.document.close()
}
