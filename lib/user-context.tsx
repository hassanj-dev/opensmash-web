'use client'

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { User } from '@/types/database'
import { formatCurrency } from '@/lib/utils'

export interface UserContextValue {
  user: User | null
  gymName: string
  // The gym's own currency label (gyms.currency), e.g. 'Rs' or 'PKR'. 'Rs' until the layout has loaded it.
  currency: string
  // true until the layout's one-time fetch has finished (success or failure).
  // loading === false && user === null means "fetch finished, no user/profile".
  loading: boolean
}

const UserContext = createContext<UserContextValue | undefined>(undefined)

export function UserProvider({
  value,
  children,
}: {
  value: UserContextValue
  children: ReactNode
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) {
    throw new Error('useUser must be used inside <UserProvider> (dashboard layout)')
  }
  return ctx
}

// Money in the gym's own currency: const { currency, fmt } = useCurrency(); fmt(1500) -> 'Rs 1,500'
export function useCurrency() {
  const { currency } = useUser()
  return useMemo(
    () => ({ currency, fmt: (amount: number) => formatCurrency(amount, currency) }),
    [currency]
  )
}
