import { useState } from 'react'
import { useCurrentUser, type UserRole } from './hooks/useCurrentUser'
import { useEmployees, useEmployeeMutations } from './hooks/useEmployees'
import { useAssignments } from './hooks/useAssignments'
import { useCatalog } from './hooks/useCatalog'
import { supabase } from './lib/supabase'
import DepartmentPickerSheet from './DepartmentPickerSheet'
import PositionPickerSheet from './PositionPickerSheet'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

const ROLE_LABEL_KEY: Record<UserRole, TranslationKey> = { admin: 'role.admin', manager: 'role.manager', performer: 'role.performer' }

/* ───────────────────────────────────────────────────────────
   Картка працівника — і власний профіль (Shell.tsx), і чужа картка
   з "Працівники" (EmployeesPage.tsx). Редагування (ім'я/телефон/
   департамент/посада) доступне лише менеджеру/адміну — та сама
   умова, що й скрізь у застосунку для "Дані для менеджера".

   Email і пароль — окремо, з іншою логікою прав:
   - Email — фактичний логін у Supabase Auth. Змінити його можна лише
     для ВЛАСНОГО профілю (supabase.auth.updateUser), бо для чужого
     потрібен service-role, якого в клієнта немає. Для чужої картки
     поле лишається лише для читання.
   - Пароль — не встановлюємо напряму (те саме обмеження), а
     надсилаємо працівнику лист для самостійного скидання
     (supabase.auth.resetPasswordForEmail) — це працює для будь-якого
     email без service-role, той самий механізм, що й "Забули пароль"
     на екрані входу (App.tsx).
─────────────────────────────────────────────────────────── */

export default function ProfilePage({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const { t, tn } = useLocale()
  const { data: currentUser } = useCurrentUser()
  const { data: employees = [] } = useEmployees()
  const { data: assignments = [] } = useAssignments()
  const { departments, positions, addDepartment, addPosition } = useCatalog()
  const { updateEmployee, isUpdating } = useEmployeeMutations()

  const employee = employees.find(e => e.id === employeeId) ?? null
  const taskCount = assignments.filter(a => a.assigneeId === employeeId).length
  const fullName = employee?.fullName || t('profile.defaultUser')
  const role = employee?.role ?? 'performer'

  const isManager = currentUser?.role === 'manager' || currentUser?.role === 'admin'
  const isOwnProfile = currentUser?.id === employeeId
  const canEdit = isManager
  const canEditEmail = isManager && isOwnProfile

  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [positionId, setPositionId] = useState<string | null>(null)
  const [showDeptPicker, setShowDeptPicker] = useState(false)
  const [showPosPicker, setShowPosPicker] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)

  const startEditing = () => {
    if (!employee) return
    setFirstName(employee.firstName)
    setLastName(employee.lastName)
    setPhone(employee.phone ?? '')
    setEmail(employee.email)
    setDepartmentId(employee.departmentId)
    setPositionId(employee.positionId)
    setEditing(true)
  }

  const department = departments.find(d => d.id === departmentId) ?? null
  const position = positions.find(p => p.id === positionId) ?? null
  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0

  const save = async () => {
    if (!employee || !canSave) return
    try {
      await updateEmployee({
        id: employee.id, firstName: firstName.trim(), lastName: lastName.trim(),
        phone: phone.trim() || null, positionId,
      })
      if (canEditEmail && email.trim() && email.trim() !== employee.email) {
        const { error } = await supabase.auth.updateUser({ email: email.trim() })
        if (error) throw error
        showToast(t('profile.toastEmailConfirmSent'))
      } else {
        showToast(t('materials.toastSaved'))
      }
      setEditing(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('employees.createFailedGeneric'))
    }
  }

  const resetPassword = async () => {
    if (!employee) return
    setResettingPassword(true)
    const { error } = await supabase.auth.resetPasswordForEmail(employee.email, { redirectTo: window.location.origin })
    setResettingPassword(false)
    showToast(error ? error.message : t('profile.toastResetSent'))
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
        style={{ opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : -12}px)` }}>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl max-w-[90vw]">
          {toast}
        </div>
      </div>

      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">{fullName}</h1>
        {canEdit && !editing && (
          <button onClick={startEditing} className="shrink-0 text-sm font-medium text-blue-600">{t('common.edit')}</button>
        )}
      </div>

      <div className="px-4 pt-5 pb-10 space-y-4">
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('employees.firstNameLabel')}>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </Field>
            <Field label={t('employees.lastNameLabel')}>
              <input value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </Field>
          </div>
        ) : (
          <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-800">
            {fullName}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white px-4 py-4 flex flex-col gap-1" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('profile.taskCount')}</p>
            <p className="text-2xl font-bold leading-tight" style={{ color: taskCount > 0 ? '#16a34a' : '#94a3b8' }}>{taskCount}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4 flex flex-col gap-1" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('profile.role')}</p>
            <p className="text-lg font-bold leading-tight text-slate-800 mt-1">{t(ROLE_LABEL_KEY[role])}</p>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <Field label="Email">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!canEditEmail}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50 disabled:bg-slate-50" />
              {!canEditEmail && <p className="mt-1.5 text-xs text-slate-400">{t('profile.emailEditHint')}</p>}
            </Field>
            <Field label={t('profile.phone')}>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380 67 000 0000"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
            </Field>
            <Field label={t('employees.departmentLabel')}>
              <button onClick={() => setShowDeptPicker(true)}
                className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-left transition-all hover:border-blue-300">
                <span className={department ? 'text-slate-800 font-medium' : 'text-slate-400'}>{department ? tn(department.name, department.nameEn) : t('employees.selectDepartmentPlaceholder')}</span>
                <ChevronDown />
              </button>
            </Field>
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
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.2)' }}>
            {[
              ['Email', employee?.email || '—'],
              [t('profile.phone'), employee?.phone || '—'],
              [t('profile.department'), employee?.departmentName ? tn(employee.departmentName, employee.departmentNameEn) : '—'],
              [t('profile.position'), employee?.positionName ? tn(employee.positionName, employee.positionNameEn) : '—'],
            ].map(([label, value], i, arr) => (
              <div key={label} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(157,200,255,0.15)' : 'none' }}>
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-sm font-medium text-slate-700 text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
          </div>
        )}

        {canEdit && !editing && employee && (
          <button onClick={resetPassword} disabled={resettingPassword}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-600 disabled:opacity-50 active:scale-[0.98] transition-all">
            {resettingPassword ? t('common.loading') : t('profile.resetPasswordAction')}
          </button>
        )}

        {editing && (
          <div className="flex gap-3">
            <button onClick={() => setEditing(false)} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.cancel')}</button>
            <button onClick={save} disabled={!canSave || isUpdating}
              className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
              {isUpdating ? t('employees.creating') : t('common.save')}
            </button>
          </div>
        )}
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
          onAdd={title => departmentId && addPosition(title, departmentId)}
          onClose={() => setShowPosPicker(false)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
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
