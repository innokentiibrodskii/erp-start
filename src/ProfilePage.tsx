import { type UserRole } from './hooks/useCurrentUser'
import { useEmployees } from './hooks/useEmployees'
import { useAssignments } from './hooks/useAssignments'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

const ROLE_LABEL_KEY: Record<UserRole, TranslationKey> = { admin: 'role.admin', manager: 'role.manager', performer: 'role.performer' }

export default function ProfilePage({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const { t, tn } = useLocale()
  const { data: employees = [] } = useEmployees()
  const { data: assignments = [] } = useAssignments()

  const employee = employees.find(e => e.id === employeeId) ?? null
  const taskCount = assignments.filter(a => a.assigneeId === employeeId).length
  const fullName = employee?.fullName || t('profile.defaultUser')
  const role = employee?.role ?? 'performer'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(248,251,255,0.96)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
        <button onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="flex-1 text-lg text-slate-800 truncate">{fullName}</h1>
      </div>

      <div className="px-4 pt-5 pb-10 space-y-4">
        <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-800">
          {fullName}
        </div>

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
      </div>
    </div>
  )
}
