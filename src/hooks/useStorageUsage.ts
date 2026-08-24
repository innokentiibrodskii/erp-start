import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useProducts } from './useProducts'
import { useMaterials } from './useMaterials'

/* ───────────────────────────────────────────────────────────
   Приблизний обсяг сховища організації — для індикатора на сторінці
   "Про застосунок" (ціновий план залежить від того, вкладається компанія
   в 1 ГБ чи ні). Рахуємо фото й відео продуктів та фото матеріалів —
   основний внесок у розмір; файли кастомних полів (custom-field-files)
   свідомо не враховуємо, щоб не множити кількість запитів до Storage API
   ще на один рівень (там треба спершу дізнатись підпапки полів для
   кожної сутності) — цифра залишається наближеною, не точною до байта.
─────────────────────────────────────────────────────────── */

/** list() віддає лише один рівень вкладеності, але наші файли лежать
 *  прямо в <id>/<file>, без підпапок — одного виклику на папку достатньо. */
async function folderSizeBytes(bucket: string, folder: string): Promise<number> {
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 })
  if (error || !data) return 0
  return data.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0)
}

export interface StorageUsage {
  usedBytes: number
  isLoading: boolean
}

export function useStorageUsage(): StorageUsage {
  const orgId = useActiveOrgId()
  const productsQ = useProducts()
  const materialsQ = useMaterials()
  const productIds = (productsQ.data ?? []).map(p => p.id)
  const materialIds = (materialsQ.data ?? []).map(m => m.id)
  const dataReady = !productsQ.isLoading && !materialsQ.isLoading

  const usageQ = useQuery({
    queryKey: ['storage-usage', orgId, productIds.length, materialIds.length],
    enabled: dataReady,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const [photoSizes, videoSizes, materialSizes] = await Promise.all([
        Promise.all(productIds.map(id => folderSizeBytes('product-photos', id))),
        Promise.all(productIds.map(id => folderSizeBytes('product-videos', id))),
        Promise.all(materialIds.map(id => folderSizeBytes('material-photos', id))),
      ])
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
      return sum(photoSizes) + sum(videoSizes) + sum(materialSizes)
    },
  })

  return {
    usedBytes: usageQ.data ?? 0,
    isLoading: !dataReady || usageQ.isLoading,
  }
}
