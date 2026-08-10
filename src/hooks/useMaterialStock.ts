import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/* ───────────────────────────────────────────────────────────
   Залишки матеріалів на складах: журнал рухів (прихід/списання),
   поточний залишок обчислюється як сума приходів мінус списання
   для пари матеріал+склад.
─────────────────────────────────────────────────────────── */

export type MovementType = 'in' | 'out'

export interface StockMovement {
  id: string
  materialId: string
  warehouseId: string
  productId: string | null
  type: MovementType
  qty: number
  cost: number | null
  createdAt: number
}

export interface StockBalance {
  materialId: string
  warehouseId: string
  qty: number
}

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23503') return 'Помилка зв\'язку з довідником'
  return error.message
}

export function useStockMovements() {
  return useQuery({
    queryKey: ['material-stock-movements'],
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from('material_stock_movements')
        .select('id, material_id, warehouse_id, product_id, type, qty, cost, created_at')
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ['material-stock-movements'] })
  const onErr = (error: { message: string; code?: string }) => alert(friendlyError(error))

  const move = useMutation({
    mutationFn: async ({ materialId, warehouseId, type, qty, productId, cost }: { materialId: string; warehouseId: string; type: MovementType; qty: number; productId: string | null; cost: number | null }) => {
      const { error } = await supabase.from('material_stock_movements').insert({ material_id: materialId, warehouse_id: warehouseId, type, qty, product_id: productId, cost })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addStock: (args: { materialId: string; warehouseId: string; qty: number; cost: number | null }) => move.mutateAsync({ ...args, type: 'in', productId: null }),
    writeOffStock: (args: { materialId: string; warehouseId: string; qty: number; productId: string }) => move.mutateAsync({ ...args, type: 'out', cost: null }),
    isSaving: move.isPending,
  }
}
