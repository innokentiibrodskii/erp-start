import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import type { Currency } from './useOrgSettings'

/* ───────────────────────────────────────────────────────────
   Фіксація собівартості продукції (sql/product_cost_locks.sql) —
   ProductCostPage.tsx: "Зафіксувати" записує знімок поточної
   собівартості (курс/валюта прорахунку на момент фіксації + сама
   собівартість кожного продукту) — один клік = один batch-рядок
   (product_cost_lock_batches) + по одному рядку на продукт
   (product_cost_locks). Незмінна історія, лише insert/select.
─────────────────────────────────────────────────────────── */

export interface LatestProductCostLock {
  productId: string
  batchId: string
  lockedAt: number
  calcCurrency: Currency
  materialsCost: number
  operationsCost: number
  totalCost: number
}

/** Останній (найсвіжіший) знімок собівартості на кожен продукт — для нової
 *  колонки "Собівартість станом на DD.MM.YYYY" у таблиці. */
export function useLatestProductCostLocks() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['product-cost-locks-latest', orgId],
    queryFn: async (): Promise<Map<string, LatestProductCostLock>> => {
      const { data, error } = await supabase
        .from('product_cost_locks')
        .select('product_id, materials_cost, operations_cost, total_cost, product_cost_lock_batches!inner(id, locked_at, calc_currency)')
        .eq('organization_id', orgId)
        .order('locked_at', { referencedTable: 'product_cost_lock_batches', ascending: false })
      if (error) throw error
      const rows = data as unknown as {
        product_id: string; materials_cost: number; operations_cost: number; total_cost: number
        product_cost_lock_batches: { id: string; locked_at: string; calc_currency: Currency }
      }[]
      // Рядки прийшли відсортовані від найновішого batch — перший на productId і є останнім знімком.
      const map = new Map<string, LatestProductCostLock>()
      for (const r of rows) {
        if (map.has(r.product_id)) continue
        map.set(r.product_id, {
          productId: r.product_id,
          batchId: r.product_cost_lock_batches.id,
          lockedAt: new Date(r.product_cost_lock_batches.locked_at).getTime(),
          calcCurrency: r.product_cost_lock_batches.calc_currency,
          materialsCost: Number(r.materials_cost),
          operationsCost: Number(r.operations_cost),
          totalCost: Number(r.total_cost),
        })
      }
      return map
    },
  })
}

export interface ProductCostLockHistoryEntry {
  batchId: string
  lockedAt: number
  lockedByName: string
  calcCurrency: Currency
  rate: number | null
  materialCurrency: Currency
  operationCurrency: Currency
  materialsCost: number
  operationsCost: number
  totalCost: number
}

/** Історія всіх фіксацій одного продукту (найновіші перші) — "⋮" → "Історія собівартості". */
export function useProductCostLockHistory(productId: string | null) {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['product-cost-locks-history', productId, orgId],
    enabled: productId !== null,
    queryFn: async (): Promise<ProductCostLockHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('product_cost_locks')
        .select(`
          materials_cost, operations_cost, total_cost,
          product_cost_lock_batches!inner(id, locked_at, calc_currency, rate, material_currency, operation_currency, locked_by, users(first_name, last_name))
        `)
        .eq('organization_id', orgId)
        .eq('product_id', productId as string)
        .order('locked_at', { referencedTable: 'product_cost_lock_batches', ascending: false })
      if (error) throw error
      const rows = data as unknown as {
        materials_cost: number; operations_cost: number; total_cost: number
        product_cost_lock_batches: {
          id: string; locked_at: string; calc_currency: Currency; rate: number | null
          material_currency: Currency; operation_currency: Currency
          users: { first_name: string; last_name: string } | null
        }
      }[]
      return rows.map(r => {
        const b = r.product_cost_lock_batches
        return {
          batchId: b.id,
          lockedAt: new Date(b.locked_at).getTime(),
          lockedByName: b.users ? `${b.users.first_name} ${b.users.last_name}`.trim() : '—',
          calcCurrency: b.calc_currency,
          rate: b.rate !== null ? Number(b.rate) : null,
          materialCurrency: b.material_currency,
          operationCurrency: b.operation_currency,
          materialsCost: Number(r.materials_cost),
          operationsCost: Number(r.operations_cost),
          totalCost: Number(r.total_cost),
        }
      })
    },
  })
}

export function useLockProductCosts() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const mutation = useMutation({
    mutationFn: async (args: {
      calcCurrency: Currency
      rate: number | null
      materialCurrency: Currency
      operationCurrency: Currency
      rows: { productId: string; materialsCost: number; operationsCost: number; totalCost: number }[]
    }) => {
      const { data: batch, error: batchError } = await supabase
        .from('product_cost_lock_batches')
        .insert({
          organization_id: orgId,
          calc_currency: args.calcCurrency,
          rate: args.rate,
          material_currency: args.materialCurrency,
          operation_currency: args.operationCurrency,
        })
        .select('id')
        .single()
      if (batchError) throw batchError
      if (args.rows.length === 0) return
      const { error: locksError } = await supabase.from('product_cost_locks').insert(
        args.rows.map(r => ({
          batch_id: batch.id,
          product_id: r.productId,
          organization_id: orgId,
          materials_cost: r.materialsCost,
          operations_cost: r.operationsCost,
          total_cost: r.totalCost,
        }))
      )
      if (locksError) throw locksError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-cost-locks-latest', orgId] })
      qc.invalidateQueries({ queryKey: ['product-cost-locks-history'] })
    },
  })
  return { lockProductCosts: mutation.mutateAsync, isLocking: mutation.isPending }
}
