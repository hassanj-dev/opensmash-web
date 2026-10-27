'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, TrendingUp, Calendar, DollarSign, AlertTriangle, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useLiveRefresh } from '@/lib/auto-refresh'
import { DashboardStats } from '@/types/database'
import { useUser, useCurrency } from '@/lib/user-context'
import { pkToday, pkMonthStart, pkAddDays, pkDayStartISO } from '@/lib/pk-date'

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

  const statCards = [
    {
      title: 'Active Members',
      value: stats.activeMembers,
      subtitle: `${stats.expiredMembers} expired / no plan`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Visits Today',
      value: stats.visitsToday,
      subtitle: `${stats.insideNow} inside now`,
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Revenue This Month',
      value: fmt(stats.revenueThisMonth),
      subtitle: `Expenses ${fmt(stats.expensesThisMonth)}`,
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Expiring in 7 Days',
      value: stats.expiringIn7Days,
      subtitle: 'Renewals due',
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ]
  if (!userLoading && (!user || !gymId)) {
    const isSuperAdmin = user?.role === 'super_admin'
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-red-100 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-bold text-red-900">
            {isSuperAdmin ? 'No gym linked to this account' : 'Account not found'}
          </h2>
          <p className="mt-1 text-sm text-red-700">
            {isSuperAdmin
              ? 'Super admin accounts have no gym dashboard. Use the Admin Panel from the sidebar.'
              : 'We could not find your profile or gym. Please sign out and log in again, or contact the platform administrator.'}
          </p>
        </div>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-32"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Activity className="w-4 h-4" />
          <span>Live data</span>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.color} mb-1`}>
                {stat.value}
              </div>
              <p className="text-xs text-gray-500">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expiring Members */}
        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiringMembers.length > 0 ? (
              <div className="space-y-2">
                {expiringMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div>
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">{member.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-orange-600">{formatDate(member.expiry_date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">No memberships expiring in the next 7 days</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Recent Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length > 0 ? (
              <div className="space-y-2">
                {recentPayments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {payment.members?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">{payment.receipt_no}</p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-sm font-semibold text-green-600">
                        {fmt(payment.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">No recent payments</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}