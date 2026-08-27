import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Аудит-лог специфікації матеріалів продукту ("Історія") — хто й коли
   додав матеріал, змінив кількість/операцію чи видалив рядок. Пише
   тригер log_product_material_event() у базі (sql/product_material_events.sql),
   тут лише читання — той самий патерн, що й useAssignmentEvents
   (hooks/usePayroll.ts).
─────────────────────────────────────────────────────────── */

export type ProductMaterialEventType = 'added' | 'qty_changed' | 'operation_changed' | 'removed'

export interface ProductMaterialEvent {
  id: string
  materialId: string
  eventType: ProductMaterialEventType
  actorName: string
  oldValue: { qty?: number; operation_id?: string | null } | number | string | null
  newValue: { qty?: number; operation_id?: string | null } | number | string | null
  occurredAt: number
}

type PersonRef = { first_name: string; last_name: string } | null

export function useProductMaterialEvents(productId: string | null) {
  return useQuery({
    queryKey: ['product-material-events', productId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductMaterialEvent[]> => {
      const { data, error } = await supabase
        .from('product_material_events')
        .select('id, material_id, event_type, old_value, new_value, occurred_at, actor:users!product_material_events_actor_id_fkey(first_name, last_name)')
        .eq('product_id', productId as string)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data.map(e => {
        const actor = e.actor as unknown as PersonRef
        return {
          id: e.id,
          materialId: e.material_id,
          eventType: e.event_type as ProductMaterialEventType,
          actorName: actor ? `${actor.first_name} ${actor.last_name}`.trim() : '—',
          oldValue: e.old_value,
          newValue: e.new_value,
          occurredAt: new Date(e.occurred_at).getTime(),
        }
      })
    },
  })
}
