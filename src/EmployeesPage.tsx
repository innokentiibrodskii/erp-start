import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { useEmployees, useEmployeeMutations } from './hooks/useEmployees'
import type { UserRole } from './hooks/useCurrentUser'
import { PRESET_COLORS } from './lib/colors'
import ProfilePage from './ProfilePage'

const ROLE_LABEL: Record<UserRole, string> = { admin: 'Адміністратор', manager: 'Менеджер', performer: 'Виконавець' }
const ROLE_BADGE: Record<UserRole, { bg: string; text: string }> = {
  admin: { bg: '#eef2ff', text: '#4f46e5' },
  manager: { bg: '#eff6ff', text: '#2563eb' },
  performer: { bg: '#f1f5f9', text: '#64748b' },
}

export default function EmployeesPage() {
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
          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">Працівники</h1>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all shrink-0 mt-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Новий
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">{employees.length} позицій</p>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>
      </div>

      <div className="px-4 pb-8 space-y-2">
        {isLoading && <p className="text-center text-sm text-slate-400 py-8">Завантаження…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">
            {employees.length === 0 ? 'Працівників ще немає — додайте першого вище' : 'Нічого не знайдено'}
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
                  {[e.positionName, e.departmentName].filter(Boolean).join(' · ') || e.email}
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                {ROLE_LABEL[e.role]}
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
    if (!firstName.trim()) errs.firstName = "Введіть ім'я"
    if (!lastName.trim()) errs.lastName = 'Введіть прізвище'
    if (!email.trim()) errs.email = 'Введіть email'
    if (password.length < 6) errs.password = 'Мінімум 6 символів'
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
      setSubmitError(e instanceof Error ? e.message : 'Не вдалося створити працівника')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-t-3xl bg-white flex flex-col" style={{ maxHeight: '92vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 pt-2 pb-4">Новий користувач</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ім'я *" error={errors.firstName}>
              <input value={firstName} onChange={e => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: '' })) }}
                placeholder="Олена" autoFocus
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.firstName ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
            <Field label="Прізвище *" error={errors.lastName}>
              <input value={lastName} onChange={e => { setLastName(e.target.value); setErrors(p => ({ ...p, lastName: '' })) }}
                placeholder="Коваленко"
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
            <Field label="Телефон">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380 67 000 0000"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Департамент">
              <button onClick={() => setShowDeptPicker(true)}
                className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all hover:border-blue-300">
                <span className={department ? 'text-slate-800 font-medium' : 'text-slate-400'}>{department?.name ?? 'Оберіть департамент...'}</span>
                <ChevronDown />
              </button>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Посада">
              <button onClick={() => departmentId && setShowPosPicker(true)} disabled={!departmentId}
                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm text-left transition-all ${departmentId ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-100 bg-slate-50 cursor-not-allowed'}`}>
                <span className={position ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  {position?.title ?? (departmentId ? 'Оберіть посаду...' : 'Спочатку оберіть департамент')}
                </span>
                <ChevronDown />
              </button>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Пароль *" error={errors.password}>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                placeholder="Мінімум 6 символів"
                className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100 ${errors.password ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-blue-400'}`} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Роль">
              <div className="relative">
                <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-4 pr-9 py-3.5 text-sm outline-none focus:border-blue-400 transition-all">
                  <option value="performer">Виконавець</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Адміністратор</option>
                </select>
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"><ChevronDown /></div>
              </div>
            </Field>
          </div>

          {submitError && <p className="mt-4 text-sm text-red-500">{submitError}</p>}

          <div className="flex gap-3 mt-6">
            <button onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-600 active:scale-[0.98] transition-all">
              Скасувати
            </button>
            <button onClick={handleSave} disabled={!canSave || isSaving}
              className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-all">
              {isSaving ? 'Створення…' : 'Створити'}
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

function DepartmentPickerSheet({ departments, positions, selectedId, onSelect, onAdd, onClose }: {
  departments: { id: string; name: string; color: string }[]
  positions: { departmentId: string }[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (name: string, color: string) => void
  onClose: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')

  const posCount = (id: string) => positions.filter(p => p.departmentId === id).length

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd(name.trim(), PRESET_COLORS[departments.length % PRESET_COLORS.length].text)
    setName(''); setShowAdd(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-t-3xl bg-white pb-8 flex flex-col" style={{ maxHeight: '85vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">Департамент</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
          <button onClick={() => onSelect(null)}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
            style={!selectedId ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
            <RadioDot selected={!selectedId} />
            <span className="text-sm font-medium text-slate-700">Без департаменту</span>
          </button>
          {departments.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Департаментів ще немає — додайте перший нижче</p>}
          {departments.map(d => {
            const sel = selectedId === d.id
            return (
              <button key={d.id} onClick={() => onSelect(d.id)}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={sel ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                <RadioDot selected={sel} />
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{d.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5">{posCount(d.id)}</span>
              </button>
            )
          })}

          {showAdd ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-blue-700">Новий департамент</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Назва департаменту" autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
              <div className="flex gap-2">
                <button onClick={() => { setShowAdd(false); setName('') }}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">Скасувати</button>
                <button onClick={handleAdd} disabled={!name.trim()}
                  className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">Додати</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
              style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
              <PlusIcon /> Додати департамент
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PositionPickerSheet({ positions, selectedId, onSelect, onAdd, onClose }: {
  positions: { id: string; title: string }[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (title: string) => void
  onClose: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd(title.trim())
    setTitle(''); setShowAdd(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-t-3xl bg-white pb-8 flex flex-col" style={{ maxHeight: '85vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">Посада</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
          <button onClick={() => onSelect(null)}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
            style={!selectedId ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
            <RadioDot selected={!selectedId} />
            <span className="text-sm font-medium text-slate-700">Без посади</span>
          </button>
          {positions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Посад у цьому департаменті ще немає — додайте нижче</p>}
          {positions.map(p => {
            const sel = selectedId === p.id
            return (
              <button key={p.id} onClick={() => onSelect(p.id)}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={sel ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                <RadioDot selected={sel} />
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{p.title}</span>
              </button>
            )
          })}

          {showAdd ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-blue-700">Нова посада</p>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Назва посади" autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
              <div className="flex gap-2">
                <button onClick={() => { setShowAdd(false); setTitle('') }}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">Скасувати</button>
                <button onClick={handleAdd} disabled={!title.trim()}
                  className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">Додати</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
              style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
              <PlusIcon /> Додати посаду
            </button>
          )}
        </div>
      </div>
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

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected ? '#3b82f6' : '#cbd5e1' }}>
      {selected && <div className="h-2 w-2 rounded-full bg-blue-500" />}
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

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    </button>
  )
}
