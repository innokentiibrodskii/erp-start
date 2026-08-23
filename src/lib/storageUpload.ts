import { supabase } from './supabase'

/* ───────────────────────────────────────────────────────────
   Завантаження файлу в Supabase Storage з реальним прогресом (%).

   supabase-js .upload() йде через fetch і не віддає подій прогресу,
   тож для великих відео "Збереження…" виглядає як зависання. Тут той
   самий контракт запиту, що й у storage-js (POST /object/:bucket/:path,
   ті самі заголовки), але через XMLHttpRequest — у нього є
   xhr.upload.onprogress.
─────────────────────────────────────────────────────────── */

export function uploadFileWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const token = session?.access_token ?? anonKey
      const url = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`

      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)
      xhr.setRequestHeader('apikey', anonKey)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.setRequestHeader('cache-control', 'max-age=3600')
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')

      xhr.upload.onprogress = e => {
        if (onProgress) onProgress(e.lengthComputable ? e.loaded : 0)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(file.size)
          resolve()
        } else {
          let message = `Upload failed (${xhr.status})`
          try { message = JSON.parse(xhr.responseText).message ?? message } catch { /* non-JSON response body */ }
          reject(new Error(message))
        }
      }
      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.send(file)
    }).catch(reject)
  })
}
