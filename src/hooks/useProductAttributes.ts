import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useLocale } from '../LocaleContext'
import { friendlyReferenceError as friendlyError } from '../lib/errors'
import { showErrorToast } from '../lib/toast'

/* ───────────────────────────────────────────────────────────
   Прив'язка характеристик (значень атрибутів із довідника) до
   продукту — просте перемикання, без окремого збереження.
─────────────────────────────────────────────────────────── */

export function useProductAttributeMutations() {
  const qc = useQueryClient()
  const orgId = useActiveOrgId()
  const { t } = useLocale()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] })
  const onErr = (error: { message: string; code?: string }) => showErrorToast(friendlyError(error, t))

  const add = useMutation({
    mutationFn: async ({ productId, attributeValueId }: { productId: string; attributeValueId: string }) => {
      const { error } = await supabase.from('product_attribute_values').insert({ product_id: productId, attribute_value_id: attributeValueId, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  const remove = useMutation({
    mutationFn: async ({ productId, attributeValueId }: { productId: string; attributeValueId: string }) => {
      const { error } = await supabase.from('product_attribute_values').delete().eq('product_id', productId).eq('attribute_value_id', attributeValueId)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: onErr,
  })

  return {
    addAttributeValue: (args: { productId: string; attributeValueId: string }) => add.mutateAsync(args),
    removeAttributeValue: (args: { productId: string; attributeValueId: string }) => remove.mutateAsync(args),
    isSaving: add.isPending || remove.isPending,
  }
}
