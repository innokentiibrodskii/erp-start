import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { showErrorToast } from '../lib/toast'
import type { TranslationKey } from '../i18n'

/* ───────────────────────────────────────────────────────────
   Налаштування організації — валюта, в якій вносяться вартості
   матеріалів, і окремо валюта вартості операцій (tasks.cost) —
   кожна єдина на всю організацію, не на кожен матеріал/операцію
   окремо, і не обов'язково збігаються між собою.
─────────────────────────────────────────────────────────── */

export type Currency = 'UAH' | 'USD' | 'EUR'

export const CURRENCY_SYMBOL: Record<Currency, string> = { UAH: '₴', USD: '$', EUR: '€' }
export const CURRENCY_LABEL_KEY: Record<Currency, TranslationKey> = { UAH: 'currency.UAH', USD: 'currency.USD', EUR: 'currency.EUR' }
export const CURRENCIES: Currency[] = ['UAH', 'USD', 'EUR']

export function useMaterialCostCurrency() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['org-settings', orgId],
    queryFn: async (): Promise<Currency> => {
      const { data, error } = await supabase.from('organizations').select('material_cost_currency').eq('id', orgId).single()
      if (error) throw error
      return (data.material_cost_currency as Currency | null) ?? 'UAH'
    },
  })
}

export function useSetMaterialCostCurrency() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const mutation = useMutation({
    mutationFn: async (currency: Currency) => {
      const { error } = await supabase.from('organizations').update({ material_cost_currency: currency }).eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-settings', orgId] }),
    onError: (error: { message: string }) => showErrorToast(error.message),
  })
  return (currency: Currency) => mutation.mutateAsync(currency)
}

export function useOperationCostCurrency() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['org-settings-operation-currency', orgId],
    queryFn: async (): Promise<Currency> => {
      const { data, error } = await supabase.from('organizations').select('operation_cost_currency').eq('id', orgId).single()
      if (error) throw error
      return (data.operation_cost_currency as Currency | null) ?? 'UAH'
    },
  })
}

export function useSetOperationCostCurrency() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const mutation = useMutation({
    mutationFn: async (currency: Currency) => {
      const { error } = await supabase.from('organizations').update({ operation_cost_currency: currency }).eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-settings-operation-currency', orgId] }),
    onError: (error: { message: string }) => showErrorToast(error.message),
  })
  return (currency: Currency) => mutation.mutateAsync(currency)
}
