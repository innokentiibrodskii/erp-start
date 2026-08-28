import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Аудит-лог змін самого продукту (назва/опис/категорія/статус) — хто й коли
   змінив. Пише тригер log_product_event() у базі (sql/manager_view_role.sql),
   тут лише читання — той самий патерн, що й useProductMaterialEvents.
   Знадобилось, коли "менеджер перегляд" отримав право створювати/редагувати
   продукт: усі зміни тепер логуються.
─────────────────────────────────────────────────────────── */

export type ProductEventType = 'created' | 'name_changed' | 'description_changed' | 'category_changed' | 'status_changed'

export interface ProductEvent {
  id: string
  eventType: ProductEventType
  actorName: string
  /** 'created' — { name: string }; інші — сирий рядок (назва/опис) чи uuid
   *  (category_id/status_id, резолвиться клієнтом за вже завантаженим каталогом). */
  oldValue: string | { name: string } | null
  newValue: string | { name: string } | null
  occurredAt: number
}

type PersonRef = { first_name: string; last_name: string } | null

export function useProductEvents(productId: string | null) {
  return useQuery({
    queryKey: ['product-events', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductEvent[]> => {
      const { data, error } = await supabase
        .from('product_events')
        .select('id, event_type, old_value, new_value, occurred_at, actor:users!product_events_actor_id_fkey(first_name, last_name)')
        .eq('product_id', productId as string)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data.map(e => {
        const actor = e.actor as unknown as PersonRef
        return {
          id: e.id,
          eventType: e.event_type as ProductEventType,
          actorName: actor ? `${actor.first_name} ${actor.last_name}`.trim() : '—',
          oldValue: e.old_value,
          newValue: e.new_value,
          occurredAt: new Date(e.occurred_at).getTime(),
        }
      })
    },
  })
}
