/** Легкий pub-sub для повідомлень про помилки — заміна блокуючому `alert()`
 *  у мутаціях. Живе поза React-деревом (мутації визначаються в хуках, не
 *  компонентах), тож `<ErrorToastHost/>` (монтується раз у main.tsx) просто
 *  підписується на нього через useState/useEffect. */
type Listener = (message: string | null) => void

let listeners: Listener[] = []
let hideTimer: ReturnType<typeof setTimeout> | null = null

const DISPLAY_MS = 4200

export function showErrorToast(message: string) {
  if (hideTimer) clearTimeout(hideTimer)
  listeners.forEach(l => l(message))
  hideTimer = setTimeout(() => listeners.forEach(l => l(null)), DISPLAY_MS)
}

export function subscribeErrorToast(listener: Listener): () => void {
  listeners.push(listener)
  return () => { listeners = listeners.filter(l => l !== listener) }
}
