import { useEffect, useState } from 'react'
import DirectoryCatalog from './DirectoryCatalog'
import ProductCatalog from './ProductCatalog'
import MaterialStock from './MaterialStock'
import AssignmentsPage from './AssignmentsPage'
import { useCurrentUser } from './hooks/useCurrentUser'

type Page = 'products' | 'materials' | 'tasks' | 'directory'

/** Сторінки, доступні лише менеджеру */
const MANAGER_ONLY_PAGES: Page[] = ['products', 'materials', 'directory']

interface Props {
  onLogout: () => void
}

export default function Shell({ onLogout }: Props) {
  const { data: currentUser } = useCurrentUser()
  const isManager = currentUser?.role === 'manager'

  const [page, setPage] = useState<Page>('tasks')

  // Виконавцю недоступні "Продукти" й "Матеріали" — якщо туди потрапили
  // (наприклад дефолтний стан до завантаження ролі), повертаємо на "Завдання".
  useEffect(() => {
    if (currentUser && !isManager && MANAGER_ONLY_PAGES.includes(page)) {
      setPage('tasks')
    }
  }, [currentUser, isManager, page])

  // Менеджеру за замовчуванням відкриваємо "Продукти", щойно роль відома.
  useEffect(() => {
    if (currentUser && isManager) {
      setPage(p => (p === 'tasks' ? 'products' : p))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, isManager])

  const allNavItems: { id: Page; label: string; icon: (active: boolean) => React.ReactNode }[] = [
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
      id: 'tasks',
      label: 'Завдання',
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="4" y="2.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.1"/>
          <path d="M7.5 8.5l2 2 3.5-4M7.5 14.5h6" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
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

  const navItems = allNavItems.filter(item => isManager || !MANAGER_ONLY_PAGES.includes(item.id))

  return (
    <div className="min-h-screen md:flex" style={{ fontFamily: "'DM Sans', sans-serif", background: '#f8fbff' }}>
      {/* Sidebar nav — desktop only (md+) */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen"
        style={{ background: 'rgba(255,255,255,0.92)', borderRight: '1px solid rgba(157,200,255,0.22)' }}>
        <div className="px-5 py-5">
          <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">
            <span className="text-blue-500">●</span> R&D
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(item => {
            const active = page === item.id
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                style={active ? { background: '#eff6ff', color: '#3b82f6' } : { color: '#64748b' }}>
                {item.icon(active)}
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="px-3 pb-5">
          <button onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-red-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Вийти
          </button>
        </div>
      </aside>

      <div className="flex flex-col min-h-screen md:flex-1 md:min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 md:px-8"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.22)' }}>
          <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800 md:hidden">
            <span className="text-blue-500">●</span> R&D
          </span>
          <span className="hidden md:block text-sm font-medium text-slate-500">
            {navItems.find(i => i.id === page)?.label}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">А</div>
            <button onClick={onLogout} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 transition-colors md:hidden">
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
          <div className="max-w-lg mx-auto md:max-w-3xl md:mx-auto">
            {page === 'products'  && isManager && <ProductCatalog onNavigate={p => setPage(p as Page)} />}
            {page === 'materials' && isManager && <MaterialStock onNavigate={p => setPage(p as Page)} />}
            {page === 'tasks'     && <AssignmentsPage />}
            {page === 'directory' && isManager && <DirectoryCatalog onNavigate={p => setPage(p as Page)} />}
          </div>
        </main>

        {/* Bottom nav — mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-lg mx-auto md:hidden"
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
    </div>
  )
}
