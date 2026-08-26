import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useEmployees, useEmployeeMutations } from './hooks/useEmployees'
import type { UserRole } from './hooks/useCurrentUser'
import ProfilePage from './ProfilePage'
import DepartmentPickerSheet from './DepartmentPickerSheet'
import PositionPickerSheet from './PositionPickerSheet'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

const ROLE_LABEL_KEY: Record<UserRole, TranslationKey> = { admin: 'role.admin', manager: 'role.manager', performer: 'role.performer' }
const ROLE_BADGE: Record<UserRole, { bg: string; text: string }> = {
  admin: { bg: '#eef2ff', text: '#4f46e5' },
  manager: { bg: '#eff6ff', text: '#2563eb' },
  performer: { bg: '#f1f5f9', text: '#64748b' },
}

export default function EmployeesPage() {
  const { t, tn } = useLocale()
  const { data: employees = [], isLoading } = useEmployees()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const filtered = employees.filter(e => e.fullName.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))

  if (openEmployeeId) {
    return <ProfilePage employeeId={openEmployeeId} onBack={() => setOpenEmployeeId(null)} />
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-start justify-between mb-1">
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">{t('employees.title')}</h1>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 mt-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {t('common.new')}
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">{employees.length} {t('products.items')}</p>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder={t('common.searchGeneric')} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>
      </div>

      <div className="px-4 pb-8 space-y-2">
        {isLoading && <p className="text-center text-sm text-slate-400 py-8">{t('common.loading')}</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">
            {employees.length === 0 ? t('employees.empty') : t('common.notFound')}
          </p>
        )}
        {filtered.map(e => {
          const badge = ROLE_BADGE[e.role]
          return (
            <button key={e.id} onClick={() => setOpenEmployeeId(e.id)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="h-10 w-10 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold text-white">
                {e.fullName.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.fullName}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[e.positionName ? tn(e.positionName, e.positionNameEn) : null, e.departmentName ? tn(e.departmentName, e.departmentNameEn) : null].filter(Boolean).join(' · ') || e.email}
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                {t(ROLE_LABEL_KEY[e.role])}
              </span>
            </button>
          )
        })}
      </div>

      {showForm && <EmployeeFormSheet onClose={() => setShowForm(false)} />}
    </div>
  )
}

function EmployeeFormSheet({ onClose }: { onClose: () => void }) {
  const { t, tn } = useLocale()
  const { departments, positions, addDepartment, addPosition } = useCatalog()
  const { createEmployee, isSaving } = useEmployeeMutations()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('performer')
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [positionId, setPositionId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [showDeptPicker, setShowDeptPicker] = useState(false)
  const [showPosPicker, setShowPosPicker] = useState(false)

  const department = departments.find(d => d.id === departmentId) ?? null
  const position = positions.find(p => p.id === positionId) ?? null

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0 && password.length >= 6

  const handleSave = async () => {
    const errs: Record<string, string> = {}
    if (!firstName.trim()) errs.firstName = t('employees.errFirstName')
    if (!lastName.trim()) errs.lastName = t('employees.errLastName')
    if (!email.trim()) errs.email = t('employees.errEmail')
    if (password.length < 6) errs.password = t('employees.errPassword')
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitError(null)
    try {
      await createEmployee({
        firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(),
        phone: phone.trim(), password, role, positionId,
      })
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('employees.createFailedGeneric'))
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-t-3xl bg-white flex flex-col" style={{ maxHeight: '92vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 pt-2 pb-4">{t('employees.newUser')}</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('employees.firstNameLabel')} error={errors.firstName}>
              <input value={firstName} onChange={e => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: '' })) }}
                placeholder={t('employees.firstNamePlaceholder')} autoFocus
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.firstName ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
            <Field label={t('employees.lastNameLabel')} error={errors.lastName}>
              <input value={lastName} onChange={e => { setLastName(e.target.value); setErrors(p => ({ ...p, lastName: '' })) }}
                placeholder={t('employees.lastNamePlaceholder')}
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.lastName ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Email *" error={errors.email}>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
                placeholder="email@company.ua"
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.email ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t('profile.phone')}>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380 67 000 0000"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t('employees.departmentLabel')}>
              <button onClick={() => setShowDeptPicker(true)}
                className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all hover:border-blue-300">
                <span className={department ? 'text-slate-800 font-medium' : 'text-slate-400'}>{department ? tn(department.name, department.nameEn) : t('employees.selectDepartmentPlaceholder')}</span>
                <ChevronDown />
              </button>
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t('employees.positionLabel')}>
              <button onClick={() => departmentId && setShowPosPicker(true)} disabled={!departmentId}
                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm text-left transition-all ${departmentId ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-100 bg-slate-50 cursor-not-allowed'}`}>
                <span className={position ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  {position ? tn(position.title, position.titleEn) : (departmentId ? t('employees.selectPositionPlaceholder') : t('employees.selectDepartmentFirst'))}
                </span>
                <ChevronDown />
              </button>
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t('employees.passwordLabel')} error={errors.password}>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                placeholder={t('employees.passwordPlaceholder')}
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.password ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={t('profile.role')}>
              <div className="relative">
                <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-4 pr-9 py-3.5 text-sm outline-none focus:border-blue-400 transition-all">
                  <option value="performer">{t('role.performer')}</option>
                  <option value="manager">{t('role.manager')}</option>
                  <option value="admin">{t('role.admin')}</option>
                </select>
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"><ChevronDown /></div>
              </div>
            </Field>
          </div>

          {submitError && <p className="mt-4 text-sm text-red-500">{submitError}</p>}

          <div className="flex gap-3 mt-6">
            <button onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-600 active:scale-[0.98] transition-all">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={!canSave || isSaving}
              className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-all">
              {isSaving ? t('employees.creating') : t('employees.create')}
            </button>
          </div>
        </div>
      </div>

      {showDeptPicker && (
        <DepartmentPickerSheet
          departments={departments}
          positions={positions}
          selectedId={departmentId}
          onSelect={id => {
            setDepartmentId(id)
            if (positions.find(p => p.id === positionId)?.departmentId !== id) setPositionId(null)
            setShowDeptPicker(false)
          }}
          onAdd={(name, color) => addDepartment(name, color)}
          onClose={() => setShowDeptPicker(false)}
        />
      )}

      {showPosPicker && departmentId && (
        <PositionPickerSheet
          positions={positions.filter(p => p.departmentId === departmentId)}
          selectedId={positionId}
          onSelect={id => { setPositionId(id); setShowPosPicker(false) }}
          onAdd={title => addPosition(title, departmentId)}
          onClose={() => setShowPosPicker(false)}
        />
      )}
    </div>
  )
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function ChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-slate-400 shrink-0">
      <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
