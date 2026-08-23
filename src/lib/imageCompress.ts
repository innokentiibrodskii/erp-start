/* ───────────────────────────────────────────────────────────
   Стиснення фото на клієнті, якщо файл перевищує ліміт розміру.

   Замість того, щоб просто відхиляти завелике фото (типово — пряме
   фото з камери телефону, кілька МБ), перекодовуємо його в JPEG,
   поступово знижуючи якість і, за потреби, розміри, доки не
   влізе в ліміт. Для реальних фото продукту втрата якості
   непомітна навіть при стисканні вдвічі-втричі.
─────────────────────────────────────────────────────────── */

async function encode(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Повертає стиснений файл, якщо вдалось влізти в ліміт, інакше — null
 *  (файл лишається завеликим навіть після спроб — хай його відхилить виклик). */
export async function compressImageToLimit(file: File, maxBytes: number): Promise<File | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null // не вдалось декодувати (пошкоджений файл / непідтримуваний формат) — хай впаде на валідації розміру
  }

  let { width, height } = bitmap
  let quality = 0.85
  let blob: Blob | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    blob = await encode(bitmap, width, height, quality)
    if (blob && blob.size <= maxBytes) break
    if (quality > 0.5) quality -= 0.1
    else { width = Math.round(width * 0.8); height = Math.round(height * 0.8) }
  }
  bitmap.close()

  if (!blob || blob.size > maxBytes) return null
  const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}
