import { createContext, useContext } from 'react'

/* ───────────────────────────────────────────────────────────
   Контекст активної компанії (мультитенантність).

   RLS у базі й так гарантує, що користувач фізично не може
   отримати рядки чужої організації — але користувач, який
   належить одразу до кількох компаній, у межах RLS бачив би
   ОБИДВІ одразу. activeOrgId — це вибір "з якою компанією я
   зараз працюю" на рівні клієнта: усі списки фільтруються по
   ній, усі нові записи створюються з нею.
─────────────────────────────────────────────────────────── */

export interface OrgMembership {
  id: string
  name: string
}

export interface OrgContextValue {
  activeOrgId: string
  activeOrgName: string
  memberships: OrgMembership[]
  /** Чи є сенс показувати перемикач компанії (користувач належить до кількох). */
  canSwitch: boolean
  /** Повернутись на екран вибору компанії (без повторного логіну). */
  requestSwitch: () => void
}

export const OrgContext = createContext<OrgContextValue | null>(null)

export function useActiveOrgId(): string {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useActiveOrgId має використовуватись всередині OrgContext.Provider')
  return ctx.activeOrgId
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg має використовуватись всередині OrgContext.Provider')
  return ctx
}
