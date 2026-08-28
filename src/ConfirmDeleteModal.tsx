import { useLocale } from './LocaleContext'

interface Props {
  message: string
  onCancel: () => void
  onConfirm: () => void
}

/** Спільна модалка підтвердження видалення — той самий вигляд для продуктів
 *  і матеріалів (ProductCatalog.tsx, MaterialStock.tsx). */
export default function ConfirmDeleteModal({ message, onCancel, onConfirm }: Props) {
  const { t } = useLocale()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white px-6 py-6"
        style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
        <p className="text-base font-semibold text-slate-800 mb-2">{message}</p>
        <p className="text-sm text-slate-500 mb-6">{t('common.actionIrreversible')}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-500 active:scale-[0.98]">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white active:scale-[0.98]">
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
