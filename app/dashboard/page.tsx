'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Users,
  CalendarCheck,
  Wallet,
  AlertTriangle,
  UserPlus,
  CreditCard,
  LogIn,
  ShieldAlert,
  Receipt,
  PartyPopper,
  Activity,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, StatCard, StatusPill, EmptyState, Skeleton, PillTone } from '@/components/app/kit'
import { Avatar } from '@/components/app/AppShell'
import { supabase } from '@/lib/supabase/client'
import { formatDate, daysUntilExpiry, daysLeftText, EXPIRING_DAYS } from '@/lib/utils'
import { useLiveRefresh } from '@/lib/auto-refresh'
import { DashboardStats } from '@/types/database'
import { useUser, useCurrency } from '@/lib/user-context'
import { pkToday, pkMonthStart, pkAddDays, pkDayStartISO } from '@/lib/pk-date'

const linkBase =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
const linkPrimary = `${linkBase} cs-primary text-white`
const linkOutline = `${linkBase} border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`

// Same wording as the Members page: the expiry day itself is still "1 day left",
// the day after is expired. (Before, this list said "Today" / "Tomorrow".)
function expiryPill(expiry: string): { tone: PillTone; label: string } {
  const n = daysUntilExpiry(expiry) ?? 0
  const label = daysLeftText(expiry) ?? ''
  if (n <= EXPIRING_DAYS) return { tone: 'danger', label }
  if (n <= 3) return { tone: 'warning', label }
  return { tone: 'info', label }
}

// Greeting by Pakistan time, not the device clock
function pkHour(): number {
  const h = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', hour: 'numeric', hour12: false }).format(new Date())
  )
  return h % 24 // some browsers return 24 at midnight
}

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

interface PaymentWithMember {
  id: string
  amount: number
  receipt_no: string
  members: {
    name: string
  } | null
}

interface ExpiringMember {
  id: string
  name: string
  code: string
  expiry_date: string
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const { fmt } = useCurrency()
  const gymId = user?.gym_id ?? null

  const [stats, setStats] = useState<DashboardStats>({
    activeMembers: 0,
    expiredMembers: 0,
    visitsToday: 0,
    insideNow: 0,
    revenueThisMonth: 0,
    expensesThisMonth: 0,
    expiringIn7Days: 0
  })
  const [recentPayments, setRecentPayments] = useState<PaymentWithMember[]>([])
  const [expiringMembers, setExpiringMembers] = useState<ExpiringMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async (gymIdParam: string | null) => {
    try {
      if (!gymIdParam) return
      setLoadError(null)

      // All "today" / "this month" boundaries are Pakistan time (UTC+5)
      const today = pkToday()
      const monthStart = pkMonthStart()
      const sevenDaysFromNow = pkAddDays(today, 7)
      const dayStart = pkDayStartISO(today)
      const nextDayStart = pkDayStartISO(pkAddDays(today, 1))
      const monthStartTs = pkDayStartISO(monthStart)

      const [
        activeRes,
        expiredRes,
        visitsRes,
        insideRes,
        moneyRes,
        expiringCountRes,
        paymentsRes,
        expiringListRes
      ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true })
          .eq('gym_id', gymIdParam).eq('is_active', true).is('deleted_at', null)
          .gte('expiry_date', today),
        supabase.from('members').select('*', { count: 'exact', head: true })
          .eq('gym_id', gymIdParam).eq('is_active', true).is('deleted_at', null)
          .or(`expiry_date.is.null,expiry_date.lt.${today}`),
        supabase.from('attendance').select('*', { count: 'exact', head: true })
          .eq('gym_id', gymIdParam).is('deleted_at', null)
          .gte('check_in', dayStart)
          .lt('check_in', nextDayStart),
        supabase.from('attendance').select('*', { count: 'exact', head: true })
          .eq('gym_id', gymIdParam).is('deleted_at', null)
          .gte('check_in', dayStart)
          .lt('check_in', nextDayStart)
          .is('check_out', null),
        // SQL totals: not limited to 1000 rows (see phase3-aggregates.sql)
        supabase.rpc('dashboard_money', {
          p_gym_id: gymIdParam,
          p_from_ts: monthStartTs,
          p_from_date: monthStart
        }),
        supabase.from('members').select('*', { count: 'exact', head: true })
          .eq('gym_id', gymIdParam).eq('is_active', true).is('deleted_at', null)
          .gte('expiry_date', today)
          .lte('expiry_date', sevenDaysFromNow),
        supabase.from('payments')
          .select('id, amount, receipt_no, members(name)')
          .eq('gym_id', gymIdParam).is('deleted_at', null)
          .order('paid_at', { ascending: false })
          .limit(8),
        supabase.from('members')
          .select('id, name, code, expiry_date')
          .eq('gym_id', gymIdParam).eq('is_active', true).is('deleted_at', null)
          .gte('expiry_date', today)
          .lte('expiry_date', sevenDaysFromNow)
          .order('expiry_date')
          .limit(8)
      ])

      if (moneyRes.error) {
        // Most likely phase3-aggregates.sql has not been run yet
        console.error('dashboard_money failed:', moneyRes.error)
        setLoadError('Revenue and expense totals could not be loaded. Run phase3-aggregates.sql in Supabase.')
      }
      const money = (moneyRes.data as { revenue?: number; expenses?: number } | null) || {}

      setStats({
        activeMembers: activeRes.count || 0,
        expiredMembers: expiredRes.count || 0,
        visitsToday: visitsRes.count || 0,
        insideNow: insideRes.count || 0,
        revenueThisMonth: Number(money.revenue || 0),
        expensesThisMonth: Number(money.expenses || 0),
        expiringIn7Days: expiringCountRes.count || 0
      })

      setRecentPayments((paymentsRes.data as unknown as PaymentWithMember[]) || [])
      setExpiringMembers((expiringListRes.data as ExpiringMember[]) || [])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setLoadError('Dashboard data could not be loaded. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Wait until the layout has finished loading the user; the skeleton keeps
    // showing (loading stays true) until then. Re-runs if gym_id changes.
    if (userLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDashboardData(gymId)
  }, [userLoading, gymId, fetchDashboardData])
  useLiveRefresh(() => { void fetchDashboardData(gymId) }, {
    gymId,
    tables: ['members', 'payments', 'attendance', 'expenses'],
    enabled: !userLoading
  })

  const rawName = user?.full_name?.trim().split(' ')[0] || ''
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1) // 'ali' -> 'Ali'

  if (!userLoading && (!user || !gymId)) {
    const isSuperAdmin = user?.role === 'super_admin'
    return (
      <EmptyState
        icon={ShieldAlert}
        title={isSuperAdmin ? 'No gym linked to this account' : 'Account not found'}
        description={
          isSuperAdmin
            ? 'Super admin accounts have no gym dashboard. Use the Admin Panel from the sidebar.'
            : 'We could not find your profile or gym. Please sign out and log in again, or contact the platform administrator.'
        }
        action={
          isSuperAdmin ? (
            <Link href="/admin" className={linkPrimary}>
              Open Admin Panel
            </Link>
          ) : undefined
        }
      />
    )
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Welcome back" description="Loading your gym overview..." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-34.5 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </>
    )
  }

  const net = stats.revenueThisMonth - stats.expensesThisMonth
  const expenseShare =
    stats.revenueThisMonth > 0
      ? Math.min(100, Math.round((stats.expensesThisMonth / stats.revenueThisMonth) * 100))
      : stats.expensesThisMonth > 0
        ? 100
        : 0
  const totalMembers = stats.activeMembers + stats.expiredMembers
  const activePct = totalMembers ? Math.round((stats.activeMembers / totalMembers) * 100) : 0

  const summary =
    stats.expiringIn7Days > 0
      ? `${stats.expiringIn7Days} ${stats.expiringIn7Days === 1 ? 'membership expires' : 'memberships expire'} this week, and ${stats.visitsToday} ${stats.visitsToday === 1 ? 'check-in was' : 'check-ins were'} recorded today.`
      : `No memberships expire this week, and ${stats.visitsToday} ${stats.visitsToday === 1 ? 'check-in was' : 'check-ins were'} recorded today.`

  return (
    <>
      <PageHeader
        title={`${greetingFor(pkHour())}${firstName ? `, ${firstName}` : ''}`}
        description={summary}
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200/70">
            <span className="relative flex h-2 w-2">
              <span className="cs-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live data
          </span>
        }
      />

      {/* Quick actions: own row so the header text never gets squeezed */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/members" className={linkPrimary}>
          <UserPlus className="h-4 w-4" /> Add member
        </Link>
        <Link href="/dashboard/payments" className={linkOutline}>
          <CreditCard className="h-4 w-4" /> Record payment
        </Link>
        <Link href="/dashboard/attendance" className={linkOutline}>
          <LogIn className="h-4 w-4" /> Check in
        </Link>
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active members"
          value={stats.activeMembers}
          hint={`${stats.expiredMembers} expired or without a plan`}
          icon={Users}
        />
        <StatCard
          label="Present today"
          value={stats.visitsToday}
          hint="Check-ins recorded today"
          icon={CalendarCheck}
        />
        <StatCard
          featured
          label="Revenue this month"
          value={fmt(stats.revenueThisMonth)}
          hint={`Expenses ${fmt(stats.expensesThisMonth)}`}
          icon={Wallet}
        />
        <StatCard
          label="Expiring in 7 days"
          value={stats.expiringIn7Days}
          hint="Renewals due"
          icon={AlertTriangle}
        />
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Expiring soon</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Memberships ending in the next 7 days</p>
            </div>
            <Link href="/dashboard/members" className="text-sm font-medium text-brand hover:underline">
              View members
            </Link>
          </CardHeader>
          <CardContent>
            {expiringMembers.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {expiringMembers.map(member => {
                  const pill = expiryPill(member.expiry_date)
                  return (
                    <li key={member.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Avatar name={member.name} className="h-9 w-9 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-500">{member.code}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusPill tone={pill.tone}>
                          <span className="inline-flex items-center gap-1">
                            {pill.tone === 'danger' && <Clock className="h-3 w-3" aria-hidden="true" />}
                            {pill.label}
                          </span>
                        </StatusPill>
                        <span className="text-xs tabular-nums text-slate-400">{formatDate(member.expiry_date)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={PartyPopper}
                title="No renewals due this week"
                description="Every active membership runs past the next 7 days."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Recent payments</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Latest receipts</p>
            </div>
            <Link href="/dashboard/payments" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentPayments.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {recentPayments.slice(0, 5).map(payment => (
                  <li key={payment.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar name={payment.members?.name || '?'} className="h-9 w-9 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {payment.members?.name || 'Unknown member'}
                      </p>
                      <p className="truncate text-xs text-slate-500">{payment.receipt_no}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{fmt(payment.amount)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No payments yet"
                description="Receipts will show up here as soon as you record a payment."
                action={
                  <Link href="/dashboard/payments" className={linkPrimary}>
                    Record payment
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* This month + membership health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-brand" /> This month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Net income (revenue minus expenses)</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
                  net < 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {fmt(net)}
              </p>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>Expenses take up {expenseShare}% of revenue</span>
                <span className="tabular-nums">{fmt(stats.expensesThisMonth)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    expenseShare >= 80 ? 'bg-red-500' : expenseShare >= 50 ? 'bg-amber-500' : 'bg-brand'
                  }`}
                  style={{ width: `${expenseShare}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-brand" /> Membership health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Members with a valid plan</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{activePct}%</p>
            </div>
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{ width: `${activePct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span className="tabular-nums">{stats.activeMembers} active</span>
                <span className="tabular-nums">{stats.expiredMembers} expired or without a plan</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}