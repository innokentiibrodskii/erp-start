import { escapeHtml } from './html'

/* ───────────────────────────────────────────────────────────
   Друк QR-етикетки (40×58мм) — спільна логіка для карток
   продукту (ProductCatalog.tsx) і матеріалу (MaterialStock.tsx):
   малювання на canvas, друк через діалог браузера, збереження PNG.
─────────────────────────────────────────────────────────── */

// Термопринтери друкують у фіксованому фізичному розмірі (203 dpi — стандарт
// для 40×58мм етикеток), тож малюємо мітку на canvas у точних пікселях, а не
// покладаємось на діалог друку браузера сам масштабувати SVG/текст.
const DPI = 203
const mm = (v: number) => Math.round((v * DPI) / 25.4)
const LABEL_W = mm(40)
const LABEL_H = mm(58)

export interface QrLabelContent {
  /** id DOM-елемента з SVG QR-коду (react-qr-code рендерить <svg id=...>) */
  svgElementId: string
  name: string
  code?: string | null
}

/** Прокладає шлях заокругленого прямокутника вручну (замість `ctx.roundRect`),
 *  щоб коректно працювати і в старіших вбудованих браузерах застосунків
 *  Bluetooth-термопринтерів. */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Малює етикетку (40×58мм при 203 dpi) на canvas — за макетом з Figma
 *  (назва → код → QR у білій картці із заокругленими кутами й тонкою рамкою).
 *  Використовується і для збереження PNG, і для друку, щоб обидва виходи
 *  мали однаковий розмір і вигляд. */
async function buildQrLabelCanvas({ svgElementId, name, code }: QrLabelContent): Promise<HTMLCanvasElement> {
  const svgEl = document.getElementById(svgElementId)
  if (!svgEl) throw new Error('QR не знайдено')

  // Дочекатись завантаження шрифтів застосунку (DM Serif Display / DM Sans),
  // інакше canvas може намалювати текст системним шрифтом за замовчуванням.
  await document.fonts.ready

  const svgData = new XMLSerializer().serializeToString(svgEl)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Не вдалося завантажити QR'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`
  })

  const canvas = document.createElement('canvas')
  canvas.width = LABEL_W
  canvas.height = LABEL_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступний')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, LABEL_W, LABEL_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const maxWidth = LABEL_W - mm(6)
  let y = mm(8.5)

  // Назва — DM Serif Display, той самий стиль заголовків, що й у застосунку
  ctx.font = `${mm(3.4)}px 'DM Serif Display', serif`
  ctx.fillStyle = '#1d293d'
  const words = name.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (cur && ctx.measureText(test).width > maxWidth) { lines.push(cur); cur = w } else cur = test
  }
  if (cur) lines.push(cur)
  for (const line of lines.slice(0, 2)) { ctx.fillText(line, LABEL_W / 2, y); y += mm(4.2) }

  // Код — DM Sans
  if (code) {
    y += mm(0.8)
    ctx.font = `${mm(2.3)}px 'DM Sans', sans-serif`
    ctx.fillStyle = '#1d293d'
    ctx.fillText(code, LABEL_W / 2, y)
    y += mm(5)
  } else {
    y += mm(2)
  }

  // QR — у білій картці із заокругленими кутами й тонкою рамкою (як у Figma-шаблоні)
  const boxSize = Math.min(LABEL_W - mm(6), LABEL_H - y - mm(3))
  const boxX = (LABEL_W - boxSize) / 2
  const boxY = y
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(157,200,255,0.6)'
  ctx.lineWidth = Math.max(1, mm(0.08))
  drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, mm(2))
  ctx.fill()
  ctx.stroke()

  const qrPadding = mm(2.5)
  const qrSize = boxSize - qrPadding * 2
  ctx.drawImage(img, boxX + qrPadding, boxY + qrPadding, qrSize, qrSize)

  return canvas
}

/** Друк через діалог браузера — та ж сама картинка, що й у збереженому PNG,
 *  тож фізичний розмір етикетки завжди 40×58мм незалежно від драйвера принтера. */
export async function printQrLabel(content: QrLabelContent, windowTitle: string) {
  const canvas = await buildQrLabelCanvas(content).catch(() => null)
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/png')
  const win = window.open('', '_blank', 'width=400,height=320')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>QR — ${escapeHtml(windowTitle)}</title>
  <style>
    @page{size:40mm 58mm;margin:0}
    *{margin:0;padding:0}
    html,body{width:40mm;height:58mm}
    img{width:40mm;height:58mm;display:block}
  </style></head><body>
  <img src="${dataUrl}" alt="QR label" />
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script>
  </body></html>`)
  win.document.close()
}

/** Готовий PNG-файл точного розміру етикетки (40×58мм при 203 dpi) — для друку
 *  через застосунки мобільних Bluetooth-термопринтерів, куди файл передається
 *  напряму (не через діалог друку браузера). */
export async function downloadQrLabelPng(content: QrLabelContent, fileName: string) {
  const canvas = await buildQrLabelCanvas(content).catch(() => null)
  if (!canvas) return
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
