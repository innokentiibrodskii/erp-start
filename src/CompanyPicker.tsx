import { useState } from 'react'
import type { OrgMembership } from './OrgContext'

interface CompanyPickerProps {
  memberships: OrgMembership[]
  onSelect: (id: string) => void
  onLogout: () => void
}

export default function CompanyPicker({ memberships, onSelect, onLogout }: CompanyPickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(memberships[0]?.id ?? null)

  const handleConfirm = () => {
    if (selectedId) onSelect(selectedId)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl tracking-tight text-slate-800 select-none">
            <span className="text-blue-500">●</span> R&D
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 backdrop-blur-md px-8 py-10 shadow-sm" style={{ border: '1px solid rgba(157,200,255,0.35)' }}>
          {/* Step indicator — 3 кроки: email → пароль → компанія (тут завжди останній) */}
          <div className="mb-7 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-blue-400" />
            <div className="h-1 flex-1 rounded-full bg-blue-400" />
            <div className="h-1 flex-1 rounded-full bg-blue-400" />
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mb-5 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <BackArrow /> Назад
          </button>

          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="mb-1 text-[1.65rem] leading-tight text-slate-800">
            Компанія
          </h1>
          <p className="mb-7 text-sm text-slate-500 font-light">
            Оберіть компанію для роботи
          </p>

          <div className="space-y-2.5">
            {memberships.map(m => {
              const selected = m.id === selectedId
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all active:scale-[0.98]
                    ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600">
                    {m.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-800">{m.name}</span>
                  {selected && <Check />}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
          >
            Увійти <Arrow />
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Продовжуючи, ви погоджуєтесь з{' '}
          <a href="#" className="hover:underline">Умовами використання</a>
        </p>
      </div>
    </div>
  )
}

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11 7H3M7 3L3 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-blue-500">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M4.5 8.2l2.2 2.2L11.5 5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
