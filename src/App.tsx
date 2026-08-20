import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import Shell from './Shell'
import { OrgContext, type OrgMembership } from './OrgContext'
import CompanyPicker from './CompanyPicker'
import CompanyBlocked from './CompanyBlocked'
import { useLocale } from './LocaleContext'

const ACTIVE_ORG_STORAGE_KEY = 'rd_active_org'

type Step = 'email' | 'password' | 'forgot'

export default function App() {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const [hovering, setHovering] = useState(false)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)

  // Відновлення паролю: запит листа з посиланням.
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Відновлення паролю: сесія, отримана переходом за посиланням з листа —
  // до встановлення нового пароля показуємо окремий екран замість звичайного входу.
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [newPasswordLoading, setNewPasswordLoading] = useState(false)

  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // Мультитенантність: компанії, до яких належить користувач, і яку з них
  // обрано активною в цій сесії роботи із застосунком.
  const [memberships, setMemberships] = useState<OrgMembership[] | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setMemberships(null)
      setActiveOrgIdState(null)
      setOrgError(null)
      return
    }
    let cancelled = false
    supabase
      .from('user_organizations')
      .select('organization_id, organizations(name)')
      .eq('user_id', session.user.id)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setOrgError(error.message)
          return
        }
        const list: OrgMembership[] = (data ?? []).map(row => {
          const org = row.organizations as unknown as { name: string } | null
          return { id: row.organization_id as string, name: org?.name ?? '—' }
        })
        setMemberships(list)
        if (list.length === 1) {
          setActiveOrgIdState(list[0].id)
          try { localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, list[0].id) } catch { /* ignore */ }
        }
      })
    return () => { cancelled = true }
  }, [session])

  const handleSelectOrg = (id: string) => {
    setActiveOrgIdState(id)
    try { localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id) } catch { /* ignore */ }
  }

  const handleRequestSwitch = () => {
    setActiveOrgIdState(null)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  const mask = `radial-gradient(circle at ${cursor.x}px ${cursor.y}px, #000 72px, transparent 120px)`

  const container: CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: '100vh',
    overflow: 'hidden',
    backgroundColor: '#f8fbff',
    fontFamily: "'DM Sans', sans-serif",
  }
  const dots: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle at center, rgba(157, 200, 255, 0.52) 1.2px, transparent 1.4px)',
    backgroundPosition: 'center',
    backgroundSize: '18px 18px',
  }
  const dotsHover: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle at center, rgba(157, 200, 255, 0.52) 2.16px, transparent 2.36px)',
    backgroundPosition: 'center',
    backgroundSize: '18px 18px',
    opacity: hovering ? 1 : 0,
    maskImage: mask,
    WebkitMaskImage: mask,
    transition: 'opacity 0.15s ease',
  }

  const validateEmail = (val: string) => {
    if (!val) return t('auth.errEmailRequired')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return t('auth.errEmailInvalid')
    return ''
  }

  const translateAuthError = (message: string) => {
    if (message.includes('Invalid login credentials')) return t('auth.errInvalidCredentials')
    if (message.includes('Email not confirmed')) return t('auth.errEmailNotConfirmed')
    return message
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) { setEmailError(err); return }
    setEmailError('')
    setStep('password')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) { setPasswordError(t('auth.errPasswordRequired')); return }
    if (password.length < 6) { setPasswordError(t('auth.errPasswordMinLength')); return }
    setPasswordError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setPasswordError(translateAuthError(error.message))
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) { setEmailError(err); return }
    setEmailError('')
    setResetError('')
    setResetLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })

    setResetLoading(false)
    if (error) setResetError(translateAuthError(error.message))
    else setResetSent(true)
  }

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword) { setNewPasswordError(t('auth.errNewPasswordRequired')); return }
    if (newPassword.length < 6) { setNewPasswordError(t('auth.errPasswordMinLength')); return }
    if (newPassword !== newPasswordConfirm) { setNewPasswordError(t('auth.errPasswordsMismatch')); return }
    setNewPasswordError('')
    setNewPasswordLoading(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    setNewPasswordLoading(false)
    if (error) { setNewPasswordError(translateAuthError(error.message)); return }
    setPasswordRecovery(false)
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Помилка виходу:', error.message)
    // Не покладаємось лише на onAuthStateChange — примусово скидаємо сесію
    // й кеш react-query, щоб кнопка "Вийти" завжди миттєво повертала на екран входу.
    queryClient.clear()
    setSession(null)
    setStep('email')
    setEmail('')
    setPassword('')
  }

  if (checkingSession) {
    return (
      <div style={container} className="flex items-center justify-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-500" />
      </div>
    )
  }

  if (passwordRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="w-full max-w-sm">
          <div className="mb-10 flex justify-center">
            <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl tracking-tight text-slate-800 select-none">
              <span className="text-blue-500">●</span> R&D
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 backdrop-blur-md px-8 py-10 shadow-sm" style={{ border: '1px solid rgba(157,200,255,0.35)' }}>
            <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="mb-1 text-[1.65rem] leading-tight text-slate-800">
              {t('auth.newPasswordTitle')}
            </h1>
            <p className="mb-8 text-sm text-slate-500 font-light">
              {t('auth.newPasswordSubtitle')}
            </p>

            <form onSubmit={handleSetNewPassword} noValidate>
              <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-slate-400">
                {t('auth.newPasswordTitle')}
              </label>
              <input
                type="password"
                autoFocus
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setNewPasswordError('') }}
                placeholder="••••••••"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300
                  focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                  ${newPasswordError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
              />

              <label className="mb-1 mt-4 block text-xs font-medium uppercase tracking-widest text-slate-400">
                {t('auth.confirmPasswordLabel')}
              </label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={e => { setNewPasswordConfirm(e.target.value); setNewPasswordError('') }}
                placeholder="••••••••"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300
                  focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                  ${newPasswordError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
              />
              {newPasswordError && (
                <p className="mt-2 text-xs text-red-500">{newPasswordError}</p>
              )}

              <button
                type="submit"
                disabled={newPasswordLoading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
              >
                {newPasswordLoading ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : t('auth.savePassword')}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (session) {
    if (orgError) {
      return <CompanyBlocked message={t('auth.loadCompaniesError', { error: orgError })} onLogout={handleSignOut} />
    }
    if (memberships === null) {
      return (
        <div style={container} className="flex items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-500" />
        </div>
      )
    }
    if (memberships.length === 0) {
      return (
        <CompanyBlocked
          message={t('auth.noCompanyMessage')}
          onLogout={handleSignOut}
        />
      )
    }
    if (!activeOrgId) {
      return <CompanyPicker memberships={memberships} onSelect={handleSelectOrg} onLogout={handleSignOut} />
    }
    const activeOrgName = memberships.find(m => m.id === activeOrgId)?.name ?? ''
    return (
      <OrgContext.Provider
        value={{
          activeOrgId,
          activeOrgName,
          memberships,
          canSwitch: memberships.length > 1,
          requestSwitch: handleRequestSwitch,
        }}
      >
        <Shell onLogout={handleSignOut} />
      </OrgContext.Provider>
    )
  }

  return (
    <div
      style={container}
      onPointerEnter={() => setHovering(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHovering(false)}
    >
      <div style={dots} />
      <div style={dotsHover} />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Logo mark */}
          <div className="mb-10 flex justify-center">
            <div
              style={{ fontFamily: "'DM Serif Display', serif" }}
              className="text-2xl tracking-tight text-slate-800 select-none"
            >
              <span className="text-blue-500">●</span> R&D
            </div>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl bg-white/80 backdrop-blur-md px-8 py-10 shadow-sm"
            style={{ border: '1px solid rgba(157,200,255,0.35)' }}
          >
            {/* Step indicator — 3 кроки: email → пароль → компанія */}
            <div className="mb-7 flex items-center gap-2">
              <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step === 'email' || step === 'password' || step === 'forgot' ? 'bg-blue-400' : 'bg-slate-200'}`} />
              <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step === 'password' || step === 'forgot' ? 'bg-blue-400' : 'bg-slate-200'}`} />
              <div className="h-1 flex-1 rounded-full bg-slate-200" />
            </div>

            {/* Email step */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} noValidate>
                <h1
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                  className="mb-1 text-[1.65rem] leading-tight text-slate-800"
                >
                  {t('auth.loginTitle')}
                </h1>
                <p className="mb-8 text-sm text-slate-500 font-light">
                  {t('auth.enterEmailSubtitle')}
                </p>

                <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Email
                </label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError('') }}
                  placeholder="you@example.com"
                  className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300
                    focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                    ${emailError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                />
                {emailError && (
                  <p className="mt-2 text-xs text-red-500">{emailError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>{t('auth.continue')} <Arrow /></>
                  )}
                </button>
              </form>
            )}

            {/* Password step */}
            {step === 'password' && (
              <form onSubmit={handlePasswordSubmit} noValidate>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setPassword(''); setPasswordError('') }}
                  className="mb-5 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <BackArrow /> {t('auth.back')}
                </button>

                <h1
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                  className="mb-1 text-[1.65rem] leading-tight text-slate-800"
                >
                  {t('auth.passwordTitle')}
                </h1>
                <p className="mb-1 text-sm text-slate-500 font-light">
                  {t('auth.loginAs')}
                </p>
                <p className="mb-7 text-sm font-medium text-blue-500 truncate">{email}</p>

                <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  {t('auth.passwordTitle')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    value={password}
                    onChange={e => { setPassword(e.target.value); setPasswordError('') }}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300
                      focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                      ${passwordError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-2 text-xs text-red-500">{passwordError}</p>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setStep('forgot'); setResetSent(false); setResetError('') }}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : t('auth.login')}
                </button>
              </form>
            )}

            {/* Forgot password step */}
            {step === 'forgot' && (
              <div>
                <button
                  type="button"
                  onClick={() => { setStep('password'); setResetSent(false); setResetError('') }}
                  className="mb-5 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <BackArrow /> {t('auth.back')}
                </button>

                <h1
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                  className="mb-1 text-[1.65rem] leading-tight text-slate-800"
                >
                  {t('auth.forgotPasswordTitle')}
                </h1>

                {!resetSent ? (
                  <form onSubmit={handleForgotSubmit} noValidate>
                    <p className="mb-8 text-sm text-slate-500 font-light">
                      {t('auth.resetLinkHint')}
                    </p>

                    <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-slate-400">
                      Email
                    </label>
                    <input
                      type="email"
                      autoFocus
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailError(''); setResetError('') }}
                      placeholder="you@example.com"
                      className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300
                        focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                        ${emailError || resetError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                    />
                    {(emailError || resetError) && (
                      <p className="mt-2 text-xs text-red-500">{emailError || resetError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {resetLoading ? (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : t('auth.sendLink')}
                    </button>
                  </form>
                ) : (
                  <div>
                    <p className="mb-8 text-sm text-slate-500 font-light">
                      {t('auth.resetSentMessage')}{' '}
                      <span className="font-medium text-blue-500">{email}</span>.
                      {' '}{t('auth.resetSentInstructions')}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setStep('email'); setResetSent(false) }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98]"
                    >
                      {t('auth.goHome')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            {t('auth.continueAgree')}{' '}
            <a href="#" className="hover:underline">{t('auth.termsOfUse')}</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11 7H3M7 3L3 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 2l12 12M6.5 6.6A2 2 0 0110.4 9.5M4.2 4.3C2.8 5.3 1.6 6.8 1 8c1.3 2.8 4 5 7 5 1.4 0 2.7-.4 3.8-1.2M5 3.3C5.9 3 6.9 3 8 3c3 0 5.7 2.2 7 5-.5 1.1-1.3 2.2-2.3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
