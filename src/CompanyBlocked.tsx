import { useLocale } from './LocaleContext'

interface CompanyBlockedProps {
  message: string
  onLogout: () => void
}

export default function CompanyBlocked({ message, onLogout }: CompanyBlockedProps) {
  const { t } = useLocale()
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl tracking-tight text-slate-800 select-none">
            <span className="text-blue-500">●</span> R&D
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 backdrop-blur-md px-8 py-10 shadow-sm" style={{ border: '1px solid rgba(157,200,255,0.35)' }}>
          <p className="text-sm text-slate-600">{message}</p>
          <button
            onClick={onLogout}
            className="mt-6 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {t('shell.logoutAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}
