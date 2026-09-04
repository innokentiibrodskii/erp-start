import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Аудит-лог змін самого матеріалу (назва/категорія/артикул/вартість/
   основний постачальник/архівація) — хто й коли змінив. Пише тригер
   log_material_event() у базі (sql/material_events.sql), тут лише
   читання — точна копія useProductEvents.ts (ProductView.tsx → "Історія").
─────────────────────────────────────────────────────────── */

export type MaterialEventType =
  | 'created' | 'name_changed' | 'category_changed' | 'code_changed'
  | 'cost_changed' | 'primary_supplier_changed' | 'archived_changed'

export interface MaterialEvent {
  id: string
  eventType: MaterialEventType
  actorName: string
  /** 'created' — { name: string }; інші — сирий рядок/число/boolean чи uuid
   *  (category_id/primary_supplier_id, резолвиться клієнтом за вже
   *  завантаженим каталогом). */
  oldValue: string | number | boolean | { name: string } | null
  newValue: string | number | boolean | { name: string } | null
  occurredAt: number
}

type PersonRef = { first_name: string; last_name: string } | null

export function useMaterialEvents(materialId: string | null) {
  return useQuery({
    queryKey: ['material-events', materialId],
    enabled: materialId !== null,
    queryFn: async (): Promise<MaterialEvent[]> => {
      const { data, error } = await supabase
        .from('material_events')
        .select('id, event_type, old_value, new_value, occurred_at, actor:users!material_events_actor_id_fkey(first_name, last_name)')
        .eq('material_id', materialId as string)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data.map(e => {
        const actor = e.actor as unknown as PersonRef
        return {
          id: e.id,
          eventType: e.event_type as MaterialEventType,
          actorName: actor ? `${actor.first_name} ${actor.last_name}`.trim() : '—',
          oldValue: e.old_value,
          newValue: e.new_value,
          occurredAt: new Date(e.occurred_at).getTime(),
        }
      })
    },
  })
}
