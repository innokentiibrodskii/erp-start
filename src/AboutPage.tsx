import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

/* ───────────────────────────────────────────────────────────
   "Про застосунок" — сторінка-візитка: короткий огляд можливостей
   R&D для тих, хто вже увійшов у систему (доступна лише всередині
   Shell.tsx, тобто після успішної автентифікації через Supabase —
   окремого гейту тут не потрібно, застосунок уже сам є "закритим
   клубом" для зареєстрованих користувачів організації).
─────────────────────────────────────────────────────────── */

interface Feature {
  icon: React.ReactNode
  titleKey: TranslationKey
  descKey: TranslationKey
}

interface WorkflowStep {
  titleKey: TranslationKey
  descKey: TranslationKey
  exampleKey: TranslationKey
}

/** Рекомендований порядок заповнення даних — довідники йдуть першими,
 *  бо продукти/матеріали/завдання посилаються саме на них. */
const WORKFLOW_STEPS: WorkflowStep[] = [
  { titleKey: 'about.workflow.step1.title', descKey: 'about.workflow.step1.desc', exampleKey: 'about.workflow.step1.example' },
  { titleKey: 'about.workflow.step2.title', descKey: 'about.workflow.step2.desc', exampleKey: 'about.workflow.step2.example' },
  { titleKey: 'about.workflow.step3.title', descKey: 'about.workflow.step3.desc', exampleKey: 'about.workflow.step3.example' },
  { titleKey: 'about.workflow.step4.title', descKey: 'about.workflow.step4.desc', exampleKey: 'about.workflow.step4.example' },
  { titleKey: 'about.workflow.step5.title', descKey: 'about.workflow.step5.desc', exampleKey: 'about.workflow.step5.example' },
  { titleKey: 'about.workflow.step6.title', descKey: 'about.workflow.step6.desc', exampleKey: 'about.workflow.step6.example' },
]

const FEATURES: Feature[] = [
  {
    titleKey: 'about.products.title',
    descKey: 'about.products.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
        <rect x="12" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
        <rect x="2" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
        <rect x="12" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
      </svg>
    ),
  },
  {
    titleKey: 'about.materials.title',
    descKey: 'about.materials.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
        <path d="M3 6.5L11 11L19 6.5M11 20V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    titleKey: 'about.tasks.title',
    descKey: 'about.tasks.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="4" y="2.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.1"/>
        <path d="M7.5 8.5l2 2 3.5-4M7.5 14.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    titleKey: 'about.dashboards.title',
    descKey: 'about.dashboards.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="12" width="4.5" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.15"/>
        <rect x="8.75" y="7" width="4.5" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.15"/>
        <rect x="15.5" y="2.5" width="4.5" height="17.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.15"/>
      </svg>
    ),
  },
  {
    titleKey: 'about.employees.title',
    descKey: 'about.employees.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12"/>
        <path d="M2 19c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M14 13.2c2.5.4 4.5 2.5 4.5 5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    titleKey: 'about.directory.title',
    descKey: 'about.directory.desc',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.1"/>
        <path d="M7 8h8M7 11h8M7 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function AboutPage() {
  const { t } = useLocale()

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-8 pb-6 text-center">
        <div className="mb-3 flex justify-center">
          <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">
            <span className="text-blue-500">●</span> R&D
          </span>
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800 mb-2">{t('about.title')}</h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{t('about.subtitle')}</p>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {FEATURES.map(f => (
          <div key={f.titleKey} className="flex gap-3 rounded-2xl bg-white p-4"
            style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 1px 8px rgba(157,200,255,0.08)' }}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-blue-500" style={{ background: '#eff6ff' }}>
              {f.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{t(f.titleKey)}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t(f.descKey)}</p>
            </div>
          </div>
        ))}

        <div className="pt-4">
          <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 mb-1">{t('about.workflow.title')}</h2>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">{t('about.workflow.subtitle')}</p>

          <div className="space-y-3">
            {WORKFLOW_STEPS.map((s, i) => (
              <div key={s.titleKey} className="flex gap-3 rounded-2xl bg-white p-4"
                style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 1px 8px rgba(157,200,255,0.08)' }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: '#3b82f6' }}>
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{t(s.titleKey)}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t(s.descKey)}</p>
                  <p className="text-xs text-slate-400 mt-1.5 italic leading-relaxed">{t('about.workflow.examplePrefix')} {t(s.exampleKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4 text-center" style={{ background: '#f1f5f9' }}>
          <p className="text-xs text-slate-500 leading-relaxed">{t('about.accessNote')}</p>
        </div>
      </div>
    </div>
  )
}
