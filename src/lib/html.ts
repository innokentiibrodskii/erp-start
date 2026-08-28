/** Екранує спецсимволи HTML — обов'язково для будь-якого рядка з даних
 *  користувача (назва товару/матеріалу тощо), що вставляється напряму в
 *  розмітку через `document.write()` (друк QR-етикеток, експорт собівартості).
 *  Без цього назва на кшталт `</title><script>...` виконалась би в тому ж
 *  origin, що й сам застосунок (window.opener, localStorage). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
