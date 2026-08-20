import { useLocale } from './LocaleContext'

interface Props {
  title: string
}

export default function ComingSoon({ title }: Props) {
  const { t } = useLocale()
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">{t('shell.comingSoon')}</p>
    </div>
  )
}
