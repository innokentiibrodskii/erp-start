import { lazy, Suspense, useEffect, useState } from 'react'
import type { DrilldownTarget } from './DashboardsPage'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useOrg } from './OrgContext'
import { useLocale } from './LocaleContext'
import { LOCALE_LABEL, type Locale } from './i18n'

// Кожна сторінка — окремий lazy-чанк: одночасно видно лише одну, тож немає сенсу
// тягнути всі одразу в головний бандл (до цього — 923 kB / 230 kB gzip одним шматком).
const DirectoryCatalog = lazy(() => import('./DirectoryCatalog'))
const CustomFieldsPage = lazy(() => import('./DirectoryCatalog').then(m => ({ default: m.CustomFieldsPage })))
const ProductCatalog = lazy(() => import('./ProductCatalog'))
const MaterialStock = lazy(() => import('./MaterialStock'))
const AssignmentsPage = lazy(() => import('./AssignmentsPage'))
const EmployeesPage = lazy(() => import('./EmployeesPage'))
const DashboardsPage = lazy(() => import('./DashboardsPage'))
const ProfilePage = lazy(() => import('./ProfilePage'))
const AboutPage = lazy(() => import('./AboutPage'))

type Page = 'products' | 'materials' | 'tasks' | 'directory' | 'settings' | 'employees' | 'dashboards' | 'profile' | 'about'

/** Сторінки, доступні лише менеджеру (і адміну, який успадковує права менеджера) */
const MANAGER_ONLY_PAGES: Page[] = ['products', 'materials', 'directory', 'settings', 'dashboards']
/** Сторінки, доступні лише адміну */
const ADMIN_ONLY_PAGES: Page[] = ['employees']

/** Вкладки нижньої мобільної навігації — окремо для кожної ролі */
const MOBILE_TABS_MANAGER: Page[] = ['products', 'materials']
const MOBILE_TABS_PERFORMER: Page[] = ['tasks']

interface Props {
  onLogout: () => void
}

export default function Shell({ onLogout }: Props) {
  const { data: currentUser } = useCurrentUser()
  const isAdmin = currentUser?.role === 'admin'
  const isManager = currentUser?.role === 'manager' || isAdmin
  const { activeOrgName, canSwitch, requestSwitch } = useOrg()
  const { locale, setLocale, t } = useLocale()

  // Діп-лінк із QR-коду (?material=... чи ?product=...) — відкриває картку одразу при вході.
  // ?from=... (напр. з деталізації дашборду) — куди веде "назад" у цій картці замість
  // звичайного списку; порожньо для QR-сканування, де "назад" і має вести в список.
  // ?field=...&value=... — з якої саме деталізації дашборду зайшли (definitionId/optionId),
  // щоб "назад" відновило точно той самий список значень, а не верхній рівень дашбордів.
  const [deepLink] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const materialId = params.get('material')
    const productId = params.get('product')
    const returnTo = params.get('from')
    const field = params.get('field')
    const value = params.get('value')
    const dashboardsDrilldown: DrilldownTarget | null = returnTo === 'dashboards' && field && value && (productId || materialId)
      ? { entityType: productId ? 'product' : 'material', definitionId: field, optionId: value }
      : null
    return { materialId, productId, returnTo, dashboardsDrilldown }
  })

  const [page, setPage] = useState<Page>(() => {
    if (deepLink.materialId) return 'materials'
    if (deepLink.productId) return 'products'
    return 'tasks'
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [prevPage, setPrevPage] = useState<Page>('tasks')
  const openProfile = () => { setPrevPage(page); setPage('profile'); setMenuOpen(false) }

  // Прибираємо параметр з адресного рядка, щоб не залишався в історії/при оновленні.
  useEffect(() => {
    if (deepLink.materialId || deepLink.productId) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Виконавцю недоступні "Продукти" й "Матеріали" — якщо туди потрапили
  // (наприклад дефолтний стан до завантаження ролі), повертаємо на "Завдання".
  // "Працівники" доступні лише адміну.
  useEffect(() => {
    if (!currentUser) return
    if (!isManager && MANAGER_ONLY_PAGES.includes(page)) { setPage('tasks'); return }
    if (!isAdmin && ADMIN_ONLY_PAGES.includes(page)) setPage('tasks')
  }, [currentUser, isManager, isAdmin, page])

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
      label: t('nav.products'),
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
      label: t('nav.materials'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <path d="M3 6.5L11 11L19 6.5M11 20V11" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      id: 'tasks',
      label: t('nav.tasks'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="4" y="2.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.1"/>
          <path d="M7.5 8.5l2 2 3.5-4M7.5 14.5h6" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      id: 'employees',
      label: t('nav.employees'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.12"/>
          <path d="M2 19c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
          <circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5}/>
          <path d="M14 13.2c2.5.4 4.5 2.5 4.5 5.1" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'dashboards',
      label: t('nav.dashboards'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="12" width="4.5" height="8" rx="1.2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.15"/>
          <rect x="8.75" y="7" width="4.5" height="13" rx="1.2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.15"/>
          <rect x="15.5" y="2.5" width="4.5" height="17.5" rx="1.2" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.15"/>
        </svg>
      ),
    },
    {
      id: 'directory',
      label: t('nav.directory'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.1"/>
          <path d="M7 8h8M7 11h8M7 14h5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.15"/>
          <path d="M11 2v2.5M11 16.5V19M2 11h2.5M16.5 11H19M4.5 4.5l1.8 1.8M15.7 15.7l1.8 1.8M4.5 17.5l1.8-1.8M15.7 6.3l1.8-1.8" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'about',
      label: t('nav.about'),
      icon: a => (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="8.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} fill={a ? 'currentColor' : 'none'} fillOpacity="0.1"/>
          <path d="M11 10v5.5" stroke="currentColor" strokeWidth={a ? 2 : 1.5} strokeLinecap="round"/>
          <circle cx="11" cy="7" r="1" fill="currentColor"/>
        </svg>
      ),
    },
  ]

  const navItems = allNavItems.filter(item =>
    (isManager || !MANAGER_ONLY_PAGES.includes(item.id)) && (isAdmin || !ADMIN_ONLY_PAGES.includes(item.id)))
  const mobileTabIds = isManager ? MOBILE_TABS_MANAGER : MOBILE_TABS_PERFORMER
  const mobileTabItems = allNavItems.filter(item => mobileTabIds.includes(item.id))

  return (
    <div className="min-h-screen md:flex" style={{ fontFamily: "'DM Sans', sans-serif", background: '#f8fbff' }}>
      {/* Sidebar nav — desktop only (md+) */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen"
        style={{ background: 'rgba(255,255,255,0.92)', borderRight: '1px solid rgba(157,200,255,0.22)' }}>
        <div className="px-5 pt-5 pb-3">
          <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">
            <span className="text-blue-500">●</span> R&D
          </span>
        </div>
        <div className="px-3 pb-3 space-y-2">
          {canSwitch ? (
            <button
              onClick={requestSwitch}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title={t('shell.changeCompany')}
            >
              <span className="truncate">{activeOrgName}</span>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <div className="px-2.5 py-1.5 text-xs font-medium text-slate-400 truncate">{activeOrgName}</div>
          )}
          <div className="px-2.5">
            <LocaleSwitcher locale={locale} setLocale={setLocale} />
          </div>
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
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex flex-col min-h-screen md:flex-1 md:min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 md:px-8"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.22)' }}>
          <div className="flex items-center gap-2 md:hidden">
            <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">
              <span className="text-blue-500">●</span> R&D
            </span>
          </div>
          <span className="hidden md:block text-sm font-medium text-slate-500">
            {page === 'profile' ? t('nav.profile') : navItems.find(i => i.id === page)?.label}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={openProfile}
              className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600 active:scale-90 transition-all">
              {(currentUser?.fullName?.trim().charAt(0) || 'А').toUpperCase()}
            </button>
            <button onClick={() => setMenuOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 transition-colors md:hidden">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
          <div className="max-w-lg mx-auto md:max-w-3xl md:mx-auto">
            <Suspense fallback={<div className="px-4 pt-8 text-center text-sm text-slate-400">{t('common.loading')}</div>}>
              {page === 'products'  && isManager && <ProductCatalog onNavigate={p => setPage(p as Page)} initialViewId={deepLink.productId} initialViewReturnTo={deepLink.returnTo} />}
              {page === 'materials' && isManager && <MaterialStock onNavigate={p => setPage(p as Page)} initialMaterialId={deepLink.materialId} initialMaterialReturnTo={deepLink.returnTo} />}
              {page === 'tasks'     && <AssignmentsPage />}
              {page === 'directory' && isManager && <DirectoryCatalog onNavigate={p => setPage(p as Page)} />}
              {page === 'settings'  && isManager && <CustomFieldsPage onBack={() => setPage('products')} />}
              {page === 'employees' && isAdmin && <EmployeesPage />}
              {page === 'dashboards' && isManager && <DashboardsPage initialDrilldown={deepLink.dashboardsDrilldown} />}
              {page === 'profile' && currentUser && <ProfilePage employeeId={currentUser.id} onBack={() => setPage(prevPage)} />}
              {page === 'about' && <AboutPage />}
            </Suspense>
          </div>
        </main>

        {/* Bottom nav — mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-lg mx-auto md:hidden"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(157,200,255,0.25)' }}>
          <div className="flex">
            {mobileTabItems.map(item => {
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

        {/* Гамбургер-меню — мобільний drawer */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-[85%] max-w-xs bg-white flex flex-col"
              style={{ boxShadow: '-8px 0 32px rgba(15,23,42,0.14)' }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
                <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">{t('shell.menuTitle')}</h2>
                <button onClick={() => setMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-all">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="px-4 pt-4">
                <button onClick={openProfile}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-all" style={{ background: '#eff6ff' }}>
                  <div className="h-9 w-9 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold text-white">
                    {(currentUser?.fullName?.trim().charAt(0) || 'А').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {currentUser?.fullName?.trim() || t('role.admin')}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{currentUser?.email ?? ''}</p>
                  </div>
                </button>
                {canSwitch && (
                  <button onClick={() => { requestSwitch(); setMenuOpen(false) }}
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors">
                    <span className="truncate">{activeOrgName}</span>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                      <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <div className="mt-2 px-1">
                  <LocaleSwitcher locale={locale} setLocale={setLocale} />
                </div>
              </div>

              <div className="flex-1 px-4 pt-4 space-y-1">
                <DrawerItem
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 7h6M6 10h6M6 13h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                  label={t('nav.tasks')}
                  onClick={() => { setPage('tasks'); setMenuOpen(false) }}
                />
                {isAdmin && (
                  <DrawerItem
                    icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 15c0-2.49 2.24-4.5 5-4.5s5 2.01 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="13" cy="6" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M11.5 10.7c1.98.3 3.5 1.86 3.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                    label={t('nav.employees')}
                    onClick={() => { setPage('employees'); setMenuOpen(false) }}
                  />
                )}
                {isManager && (
                  <DrawerItem
                    icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="9.5" width="3.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="7.25" y="5.5" width="3.5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="2" width="3.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>}
                    label={t('nav.dashboards')}
                    onClick={() => { setPage('dashboards'); setMenuOpen(false) }}
                  />
                )}
                <DrawerItem
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 7h6M6 10h6M6 13h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                  label={t('nav.directory')}
                  onClick={() => { if (isManager) setPage('directory'); setMenuOpen(false) }}
                />
                <DrawerItem
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.6 3.6l1.4 1.4M13 13l1.4 1.4M3.6 14.4L5 13M13 5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                  label={t('nav.settings')}
                  onClick={() => { if (isManager) setPage('settings'); setMenuOpen(false) }}
                />
                <DrawerItem
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M9 8v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="9" cy="5.7" r="0.9" fill="currentColor"/></svg>}
                  label={t('nav.about')}
                  onClick={() => { setPage('about'); setMenuOpen(false) }}
                />
              </div>

              <div className="px-4 pb-6" style={{ borderTop: '1px solid rgba(157,200,255,0.2)' }}>
                <button onClick={onLogout}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 mt-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                    <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('nav.logout')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Перемикач мови інтерфейсу (UK/EN) — стосується лише текстів застосунку,
 *  не даних, які вносить користувач. */
function LocaleSwitcher({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
      {(['uk', 'en'] as const).map(l => (
        <button key={l} onClick={() => setLocale(l)}
          className="rounded-md px-2 py-1 text-[11px] font-semibold transition-all"
          style={locale === l ? { background: '#1e293b', color: '#fff' } : { color: '#64748b' }}>
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

function DrawerItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all">
      <span className="shrink-0 text-slate-500">{icon}</span>
      {label}
    </button>
  )
}
