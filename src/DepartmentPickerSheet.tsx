import { useState } from 'react'
import { PRESET_COLORS } from './lib/colors'
import { useLocale } from './LocaleContext'

/* ───────────────────────────────────────────────────────────
   Вибір департаменту для працівника — той самий bottom-sheet, що
   й у формі створення нового працівника (EmployeesPage.tsx), лише
   винесений в окремий файл, щоб його могла використати й сторінка
   редагування картки працівника (ProfilePage.tsx) без циклічного
   імпорту між ними.
─────────────────────────────────────────────────────────── */

export default function DepartmentPickerSheet({ departments, positions, selectedId, onSelect, onAdd, onClose }: {
  departments: { id: string; name: string; nameEn: string | null; color: string }[]
  positions: { departmentId: string }[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (name: string, color: string) => void
  onClose: () => void
}) {
  const { t, tn } = useLocale()
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
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg text-slate-800">{t('employees.departmentLabel')}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
          <button onClick={() => onSelect(null)}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
            style={!selectedId ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
            <RadioDot selected={!selectedId} />
            <span className="text-sm font-medium text-slate-700">{t('employees.noDepartment')}</span>
          </button>
          {departments.length === 0 && <p className="py-4 text-center text-sm text-slate-400">{t('employees.noDepartmentsYet')}</p>}
          {departments.map(d => {
            const sel = selectedId === d.id
            return (
              <button key={d.id} onClick={() => onSelect(d.id)}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={sel ? { background: '#eff6ff', border: '1.5px solid #93c5fd' } : { background: 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
                <RadioDot selected={sel} />
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{tn(d.name, d.nameEn)}</span>
                <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5">{posCount(d.id)}</span>
              </button>
            )
          })}

          {showAdd ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-blue-700">{t('employees.newDepartment')}</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('employees.departmentNamePlaceholder')} autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
              <div className="flex gap-2">
                <button onClick={() => { setShowAdd(false); setName('') }}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">{t('common.cancel')}</button>
                <button onClick={handleAdd} disabled={!name.trim()}
                  className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">{t('common.add')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
              style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
              <PlusIcon /> {t('employees.addDepartment')}
            </button>
          )}
        </div>
      </div>
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
