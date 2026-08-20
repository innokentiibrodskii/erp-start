import { useCatalog } from './hooks/useCatalog'
import { useProductAttributeMutations } from './hooks/useProductAttributes'
import type { ProductAttributeLink } from './hooks/useProducts'
import { useLocale } from './LocaleContext'

/* ───────────────────────────────────────────────────────────
   Вибір характеристик продукту з довідника: атрибути згруповані,
   значення — чипи, що перемикаються напряму (без окремого "Зберегти").
─────────────────────────────────────────────────────────── */

export default function AttributePickerSheet({ productId, selected, onClose }: {
  productId: string
  selected: ProductAttributeLink[]
  onClose: () => void
}) {
  const { t, tn } = useLocale()
  const { attributes } = useCatalog()
  const { addAttributeValue, removeAttributeValue, isSaving } = useProductAttributeMutations()
  const selectedIds = new Set(selected.map(s => s.valueId))

  const toggle = async (valueId: string) => {
    if (selectedIds.has(valueId)) await removeAttributeValue({ productId, attributeValueId: valueId })
    else await addAttributeValue({ productId, attributeValueId: valueId })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white pt-2 pb-10 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center py-3">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="px-5 text-2xl text-slate-800 mb-4">
          {t('productEditor.attributes')}
        </h2>

        <div className="px-5 space-y-5">
          {attributes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t('attributePicker.emptyCatalog')}</p>
          ) : attributes.map(attr => (
            <div key={attr.id}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{tn(attr.name, attr.nameEn)}</p>
              {attr.values.length === 0 ? (
                <p className="text-xs text-slate-400">{t('productEditor.noValuesInAttribute')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {attr.values.map(v => {
                    const active = selectedIds.has(v.id)
                    return (
                      <button key={v.id} onClick={() => toggle(v.id)} disabled={isSaving}
                        className="rounded-xl px-3 py-2 text-xs font-medium border transition-all disabled:opacity-50"
                        style={active ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' } : { background: '#f5f3ff', color: '#7c3aed', borderColor: 'transparent' }}>
                        {tn(v.value, v.valueEn)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6 px-5">
          <button onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white active:scale-[0.98] transition-all">
            {t('attributePicker.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
