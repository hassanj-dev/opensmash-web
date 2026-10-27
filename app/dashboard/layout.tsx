'use client'

import { ReactNode, useState, useEffect, useMemo, useCallback } from 'react'
import { fetchGymGate } from '@/lib/gym-access'
import { isRouteAllowed } from '@/lib/route-access'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClipboardList,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  Dumbbell,
  FileText,
  DollarSign,
  Shield,
  UserCog
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [gymName, setGymName] = useState('IronGym')
  const [currency, setCurrency] = useState('Rs')
  const [userLoading, setUserLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const { data: userData } = await supabase
            .from('users')
            .select('*, gyms(name, currency)')
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

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Members', href: '/dashboard/members' },
    { icon: CreditCard, label: 'Payments', href: '/dashboard/payments' },
    { icon: ClipboardList, label: 'Attendance', href: '/dashboard/attendance' },
    ...(user?.role === 'gym_owner' || user?.role === 'manager' ? [
      { icon: FileText, label: 'Plans', href: '/dashboard/plans' },
      { icon: DollarSign, label: 'Expenses', href: '/dashboard/expenses' },
      { icon: TrendingUp, label: 'Reports', href: '/dashboard/reports' },
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
      <div className="min-h-screen bg-gray-50">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Dumbbell className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{gymName}</h2>
                  {user && <p className="text-xs text-gray-500">{user.role.replace('_', ' ')}</p>}
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* User section */}
            <div className="p-4 border-t border-gray-200">
              <div className="mb-3 px-4 py-2 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">{user?.full_name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-4 py-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex-1 lg:hidden" />
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Welcome back, {user?.full_name?.split(' ')[0] || 'User'}!</span>
              </div>
            </div>
          </header>

          {/* Page content (not rendered for a blocked route, so it never fetches data) */}
          <main className="p-6">
            {routeBlocked ? null : children}
          </main>
        </div>
      </div>
    </UserProvider>
  )
}