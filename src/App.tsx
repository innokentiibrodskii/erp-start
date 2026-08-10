import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Shell from './Shell'

type Step = 'email' | 'password'

export default function App() {
  const [hovering, setHovering] = useState(false)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)

  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

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
    if (!val) return 'Введіть адресу електронної пошти'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Невірний формат email'
    return ''
  }

  const translateAuthError = (message: string) => {
    if (message.includes('Invalid login credentials')) return 'Невірний email або пароль'
    if (message.includes('Email not confirmed')) return 'Email не підтверджено'
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
    if (!password) { setPasswordError('Введіть пароль'); return }
    if (password.length < 6) { setPasswordError('Пароль має містити щонайменше 6 символів'); return }
    setPasswordError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setPasswordError(translateAuthError(error.message))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
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

  if (session) {
    return <Shell onLogout={handleSignOut} />
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
            {/* Step indicator */}
            <div className="mb-7 flex items-center gap-2">
              <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step === 'email' || step === 'password' ? 'bg-blue-400' : 'bg-slate-200'}`} />
              <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step === 'password' ? 'bg-blue-400' : 'bg-slate-200'}`} />
            </div>

            {/* Email step */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} noValidate>
                <h1
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                  className="mb-1 text-[1.65rem] leading-tight text-slate-800"
                >
                  Вхід
                </h1>
                <p className="mb-8 text-sm text-slate-500 font-light">
                  Введіть вашу електронну адресу
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
                    <>Продовжити <Arrow /></>
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
                  <BackArrow /> Назад
                </button>

                <h1
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                  className="mb-1 text-[1.65rem] leading-tight text-slate-800"
                >
                  Пароль
                </h1>
                <p className="mb-1 text-sm text-slate-500 font-light">
                  Вхід як
                </p>
                <p className="mb-7 text-sm font-medium text-blue-500 truncate">{email}</p>

                <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Пароль
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
                  <a href="#" className="text-xs text-blue-500 hover:underline">Забули пароль?</a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : 'Увійти'}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Продовжуючи, ви погоджуєтесь з{' '}
            <a href="#" className="hover:underline">Умовами використання</a>
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
