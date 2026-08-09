import { useState } from 'react'
import ComingSoon from './ComingSoon'
import DirectoryCatalog from './DirectoryCatalog'

type Page = 'products' | 'materials' | 'users' | 'directory'

interface Props {
  onLogout: () => void
}

export default function Shell({ onLogout }: Props) {
  const [page, setPage] = useState<Page>('directory')

  const navItems: { id: Page; label: string; icon: (active: boolean) => React.ReactNode }[] = [
    {
      id: 'products',
      label: 'Продукти',
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <rect x="12" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <rect x="2" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <rect x="12" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
        </svg>
      ),
    },
    {
      id: 'materials',
      label: 'Матеріали',
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <path d="M3 6.5L11 11L19 6.5M11 20V11" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      id: 'users',
      label: 'Команда',
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <path d="M2 19c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
          <path d="M16 5c1.66 0 3 1.34 3 3s-1.34 3-3 3M20 19c0-2.76-1.79-5.11-4.27-5.81" stroke="currentColor" strokeWidth={a ? 1.5 : 1.3} strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'directory',
      label: 'Довідники',
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.1"/>
          <path d="M7 8h8M7 11h8M7 14h5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto" style={{ fontFamily: "'DM Sans', sans-serif", background: '#f8fbff' }}>
      {/* Top header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.22)' }}>
        <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">
          <span className="text-blue-500">●</span> Аплікація
        </span>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">А</div>
          <button onClick={onLogout} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 transition-colors">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {page === 'products'   && <ComingSoon title="Продукти" />}
        {page === 'materials'  && <ComingSoon title="Матеріали" />}
        {page === 'users'      && <ComingSoon title="Команда" />}
        {page === 'directory'  && <DirectoryCatalog onNavigate={p => setPage(p as Page)} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-lg mx-auto"
        style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(157,200,255,0.25)' }}>
        <div className="flex">
          {navItems.map(item => {
            const active = page === item.id
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                className="relative flex flex-1 flex-col items-center gap-1 py-3 transition-colors active:scale-95"
                style={{ color: active ? '#3b82f6' : '#94a3b8' }}>
                {item.icon(active)}
                <span className="text-[10px] font-medium">{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full" style={{ background: '#3b82f6' }} />
                )}
              </button>
            )
          })}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </nav>
    </div>
  )
}
