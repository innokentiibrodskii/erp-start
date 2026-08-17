import type { OrgMembership } from './OrgContext'

interface CompanyPickerProps {
  memberships: OrgMembership[]
  onSelect: (id: string) => void
  onLogout: () => void
}

export default function CompanyPicker({ memberships, onSelect, onLogout }: CompanyPickerProps) {
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

          <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="mb-1 text-[1.65rem] leading-tight text-slate-800">
            Компанія
          </h1>
          <p className="mb-7 text-sm text-slate-500 font-light">
            Оберіть, з якою компанією працювати
          </p>

          <div className="space-y-2.5">
            {memberships.map(m => (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-800 transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98]"
              >
                {m.name}
              </button>
            ))}
          </div>

          <button
            onClick={onLogout}
            className="mt-6 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Вийти з облікового запису
          </button>
        </div>
      </div>
    </div>
  )
}
