'use client'

import { ReactNode, useState, useEffect, useMemo, useCallback } from 'react'
import { fetchGymGate } from '@/lib/gym-access'
import { isRouteAllowed } from '@/lib/route-access'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClipboardList,
  TrendingUp,
  Settings,
  FileText,
  DollarSign,
  Shield,
  UserCog,
  Monitor
} from 'lucide-react'
import AppShell, { ShellNavItem } from '@/components/app/AppShell'
import { ToastProvider } from '@/components/app/kit'
import { signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase/client'
import { User } from '@/types/database'
import { UserProvider } from '@/lib/user-context'
import { useAutoRefresh } from '@/lib/auto-refresh'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [gymName, setGymName] = useState('OpenSmash')
  const [currency, setCurrency] = useState('Rs')
  const [userLoading, setUserLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const { data: userData } = await supabase
            .from('users')
            .select(
              'id, gym_id, email, full_name, role, is_active, must_change_password, avatar_url, created_at, updated_at, gyms(name, currency)'
            )
            .eq('id', authUser.id)
            .single()

          if (userData) {
            setUser(userData)
            const userWithGym = userData as typeof userData & {
              gyms: { name: string; currency: string | null } | null
            }
            if (userWithGym.gyms?.name) {
              setGymName(userWithGym.gyms.name)
            }
            setCurrency((userWithGym.gyms?.currency ?? '').trim() || 'Rs')
          }
        }
      } finally {
        setUserLoading(false)
      }
    }
    fetchUser()
  }, [])

  // Settings page tells the layout when the profile picture changed (no reload needed)
  useEffect(() => {
    const onAvatar = (e: Event) => {
      const url = (e as CustomEvent<string | null>).detail ?? null
      setUser(u => (u ? { ...u, avatar_url: url } : u))
    }
    window.addEventListener('avatar-changed', onAvatar)
    return () => window.removeEventListener('avatar-changed', onAvatar)
  }, [])

  const userRole = user?.role
  const userGymId = user?.gym_id

  // Gym name / currency can change (admin panel, SQL): pick it up about once a minute and on tab focus.
  const refreshGymInfo = useCallback(async () => {
    if (!userGymId) return
    const { data } = await supabase
      .from('gyms')
      .select('name, currency')
      .eq('id', userGymId)
      .single()
    if (!data) return
    if (data.name) setGymName(data.name)
    setCurrency((data.currency ?? '').trim() || 'Rs')
  }, [userGymId])
  useAutoRefresh(() => { void refreshGymInfo() }, !!userGymId, 60_000)

  // Role guard (second layer after proxy.ts, covers client-side navigation / cached prefetch).
  // Only decided once the user profile has loaded.
  const routeBlocked = !userLoading && !!user && !isRouteAllowed(user.role, pathname)

  useEffect(() => {
    if (routeBlocked) router.replace('/dashboard')
  }, [routeBlocked, router])

  // Re-check own gym every ~30s (paused while hidden, also on focus).
  useEffect(() => {
    if (!userRole || userRole === 'super_admin') return

    let cancelled = false
    let busy = false

    const check = async () => {
      if (busy || document.hidden) return
      busy = true
      try {
        const gate = userGymId ? await fetchGymGate(supabase, userGymId) : '/suspended'
        if (!cancelled && gate) router.replace(gate)
      } finally {
        busy = false
      }
    }

    const onVisible = () => {
      if (!document.hidden) void check()
    }

    const id = window.setInterval(check, 30_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userRole, userGymId, router])

  const handleLogout = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const navItems: ShellNavItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', exact: true },
    { icon: Users, label: 'Members', href: '/dashboard/members' },
    { icon: CreditCard, label: 'Payments', href: '/dashboard/payments' },
    { icon: ClipboardList, label: 'Attendance', href: '/dashboard/attendance' },
    ...(user?.role === 'gym_owner' || user?.role === 'manager' ? [
      { icon: FileText, label: 'Plans', href: '/dashboard/plans' },
      { icon: DollarSign, label: 'Expenses', href: '/dashboard/expenses' },
      { icon: TrendingUp, label: 'Reports', href: '/dashboard/reports' },
    ] : []),
    // Desktop app download: visible to every gym role
    ...(user && user.role !== 'super_admin' ? [
      { icon: Monitor, label: 'Desktop app', href: '/dashboard/download' },
    ] : []),
    ...(user?.role === 'gym_owner' ? [
      { icon: UserCog, label: 'Staff', href: '/dashboard/staff' },
      { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
    ] : []),
    ...(user?.role === 'super_admin' ? [
      { icon: Shield, label: 'Admin Panel', href: '/admin' },
    ] : []),
  ]

  const ctxValue = useMemo(
    () => ({ user, gymName, currency, loading: userLoading }),
    [user, gymName, currency, userLoading]
  )

  return (
    <UserProvider value={ctxValue}>
      <ToastProvider>
        <AppShell
          navItems={navItems}
          workspaceName={gymName}
          workspaceRole={user?.role?.replace('_', ' ')}
          user={
            user
              ? { name: user.full_name, email: user.email, avatarUrl: user.avatar_url }
              : null
          }
          onSignOut={handleLogout}
        >
          {/* Page content (not rendered for a blocked route, so it never fetches data) */}
          {routeBlocked ? null : children}
        </AppShell>
      </ToastProvider>
    </UserProvider>
  )
}