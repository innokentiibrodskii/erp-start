import { useEffect, useState } from 'react'
import { subscribeErrorToast } from './lib/toast'

/** Глобальний тост для помилок мутацій — заміна `alert()`. Монтується раз
 *  у main.tsx, отримує повідомлення через lib/toast.ts (мутації визначені
 *  в хуках, не мають прямого доступу до React-дерева сторінки). */
export default function ErrorToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => subscribeErrorToast(setMessage), [])

  return (
    <div className="pointer-events-none fixed top-5 left-1/2 z-[100] -translate-x-1/2 px-4 transition-all duration-300"
      style={{ opacity: message ? 1 : 0, transform: `translateX(-50%) translateY(${message ? 0 : -12}px)` }}>
      <div className="flex items-start gap-2.5 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl max-w-[calc(100vw-2rem)] sm:max-w-md">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="mt-0.5 shrink-0">
          <circle cx="7.5" cy="7.5" r="6.5" stroke="#f87171" strokeWidth="1.8"/>
          <path d="M7.5 4.5v3.5M7.5 10.5h.01" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span>{message}</span>
      </div>
    </div>
  )
}
