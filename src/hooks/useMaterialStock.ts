import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import { friendlyReferenceError as friendlyError } from '../lib/errors'
import { showErrorToast } from '../lib/toast'

/* ───────────────────────────────────────────────────────────
   Залишки матеріалів на складах: журнал рухів (прихід/списання),
   поточний залишок обчислюється як сума приходів мінус списання
   для пари матеріал+склад.

   Прихід може бути оформлений як партія (batch_code, автогенерована
   дата+порядковий номер) і опційно розбитий на серії — підпартії
   з власним кодом і кількістю, що в сумі дають кількість партії.
─────────────────────────────────────────────────────────── */

export type MovementType = 'in' | 'out'

export interface MovementSeries {
  id: string
  code: string
  qty: number
}

export interface StockMovement {
  id: string
  materialId: string
  warehouseId: string
  productId: string | null
  type: MovementType
  qty: number
  cost: number | null
  batchCode: string | null
  note: string | null
  series: MovementSeries[]
  createdAt: number
}

export interface StockBalance {
  materialId: string
  warehouseId: string
  qty: number
}

export function useStockMovements() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['material-stock-movements', orgId],
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from('material_stock_movements')
        .select('id, material_id, warehouse_id, product_id, type, qty, cost, batch_code, note, created_at, material_stock_movement_series(id, code, qty)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(m => ({
        id: m.id,
        materialId: m.material_id,
        warehouseId: m.warehouse_id,
        productId: m.product_id,
        type: m.type as MovementType,
        qty: Number(m.qty),
        cost: m.cost !== null ? Number(m.cost) : null,
        batchCode: m.batch_code,
        note: m.note,
        series: (m.material_stock_movement_series ?? []).map((s: { id: string; code: string; qty: number }) => ({ id: s.id, code: s.code, qty: Number(s.qty) })),
        createdAt: new Date(m.created_at).getTime(),
      }))
    },
  })
}

/** Групує рухи в поточні залишки по парах матеріал+склад */
export function computeBalances(movements: StockMovement[]): StockBalance[] {
  const map = new Map<string, number>()
  for (const m of movements) {
    const key = `${m.materialId}::${m.warehouseId}`
    const delta = m.type === 'in' ? m.qty : -m.qty
    map.set(key, (map.get(key) ?? 0) + delta)
  }
  return Array.from(map.entries()).map(([key, qty]) => {
    const [materialId, warehouseId] = key.split('::')
    return { materialId, warehouseId, qty }
  })
}

export function balanceFor(balances: StockBalance[], materialId: string, warehouseId: string): number {
  return balances.find(b => b.materialId === materialId && b.warehouseId === warehouseId)?.qty ?? 0
}

export function totalFor(balances: StockBalance[], materialId: string): number {
  return balances.filter(b => b.materialId === materialId).reduce((sum, b) => sum + b.qty, 0)
}

export function useStockMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['material-stock-movements', orgId] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const add = useMutation({
    mutationFn: async ({ materialId, warehouseId, qty, cost, batchCode, note, series }: {
      materialId: string; warehouseId: string; qty: number; cost: number | null
      batchCode: string | null; note: string | null; series: { code: string; qty: number }[]
    }) => {
      const { data, error } = await supabase
        .from('material_stock_movements')
        .insert({ material_id: materialId, warehouse_id: warehouseId, type: 'in', qty, cost, batch_code: batchCode, note, organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      if (series.length > 0) {
        const rows = series.map(s => ({ movement_id: data.id as string, code: s.code, qty: s.qty, organization_id: orgId }))
        const { error: seriesError } = await supabase.from('material_stock_movement_series').insert(rows)
        if (seriesError) throw seriesError
      }
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const writeOff = useMutation({
    mutationFn: async ({ materialId, warehouseId, qty, productId, note }: {
      materialId: string; warehouseId: string; qty: number; productId: string; note: string | null
    }) => {
      const { error } = await supabase.from('material_stock_movements').insert({
        material_id: materialId, warehouse_id: warehouseId, type: 'out', qty, product_id: productId, note, organization_id: orgId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addStock: (args: { materialId: string; warehouseId: string; qty: number; cost: number | null; batchCode: string | null; note: string | null; series: { code: string; qty: number }[] }) =>
      add.mutateAsync(args),
    writeOffStock: (args: { materialId: string; warehouseId: string; qty: number; productId: string; note: string | null }) =>
      writeOff.mutateAsync(args),
    isSaving: add.isPending || writeOff.isPending,
  }
}
