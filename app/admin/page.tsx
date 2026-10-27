'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, subMonths } from 'date-fns'
import {
  Shield,
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Building2,
  Wallet,
  Clock,
  CheckCircle,
  Plus,
  Copy,
  LogOut
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { signOut } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { GymStatus } from '@/types/database'
import { pkToday, pkAddDays, pkDayStartISO } from '@/lib/pk-date'

interface GymRow {
  id: string
  name: string
  owner_name: string
  owner_email: string
  phone: string | null
  status: GymStatus
  created_at: string
  suspended_at: string | null
  suspended_reason: string | null
  expires_at: string | null
  license_key: string | null
}

interface Subscription {
  id: string
  gym_id: string
  billing_month: string // yyyy-MM-01
  amount: number
  is_paid: boolean
  paid_at: string | null
  note: string | null
}

type TabKey = 'all' | 'active' | 'pending' | 'suspended' | 'unpaid'

interface FeeForm {
  month: string // yyyy-MM
  amount: string
  paid: boolean
  note: string
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  askReason?: boolean
  expiry?: 'required' | 'optional'
  onConfirm: (reason: string, expiryISO: string | null) => Promise<void>
}

const PAGE_SIZE = 8
const MAX_AMOUNT = 1_000_000_000

const GYM_COLUMNS =
  'id, name, owner_name, owner_email, phone, status, created_at, suspended_at, suspended_reason, expires_at, license_key'

// Style tokens (Tailwind classes only)
const statusStyles: Record<string, { badge: string; dot: string }> = {
  active: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  pending: { badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  suspended: { badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  inactive: { badge: 'bg-gray-100 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400' }
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20'

const iconBtnClass =
  'rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'

const bannerBase = 'flex items-start gap-2 rounded-xl border p-3 text-sm'

function parseMonthKey(value: string) {
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function monthLabel(value: string) {
  return format(parseMonthKey(value), 'MMM yyyy')
}

// Expiry date means "valid through the end of that Pakistan day".
const expiryToISO = (dateStr: string) => pkDayStartISO(pkAddDays(dateStr, 1))
const isoToPkDate = (iso: string) => pkToday(new Date(new Date(iso).getTime() - 60_000))
const isPast = (iso: string | null) => !!iso && new Date(iso).getTime() <= Date.now()
const expiryLabel = (iso: string | null) => (iso ? formatDate(isoToPkDate(iso)) : 'No expiry')

export default function AdminPage() {
  const router = useRouter()

  const [allowed, setAllowed] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [gyms, setGyms] = useState<GymRow[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subsError, setSubsError] = useState<string | null>(null)

  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [feeGym, setFeeGym] = useState<GymRow | null>(null)
  const [feeSub, setFeeSub] = useState<Subscription | null>(null)
  const [feeForm, setFeeForm] = useState<FeeForm>({ month: '', amount: '', paid: true, note: '' })
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState<string | null>(null)

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [reason, setReason] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const monthKey = `${month}-01`

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        setError('You are not logged in. Please log in again.')
        return
      }

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (meError || !me) {
        setError('Your account could not be loaded.')
        return
      }
      if (me.role !== 'super_admin') {
        router.replace('/dashboard')
        return
      }

      setCurrentUserId(user.id)
      setAllowed(true)

      const [gymsRes, subsRes] = await Promise.all([
        supabase.from('gyms').select(GYM_COLUMNS).order('created_at', { ascending: false }),
        supabase
          .from('gym_subscriptions')
          .select('id, gym_id, billing_month, amount, is_paid, paid_at, note')
          .order('billing_month', { ascending: false })
          .limit(5000)
      ])

      if (gymsRes.error) throw gymsRes.error
      setGyms((gymsRes.data as GymRow[]) || [])

      if (subsRes.error) {
        console.error('Error loading subscriptions:', subsRes.error)
        setSubsError(
          'Fee records could not be loaded. Have you run the SQL for the gym_subscriptions table?'
        )
        setSubs([])
      } else {
        setSubsError(null)
        setSubs((subsRes.data as Subscription[]) || [])
      }
    } catch (err) {
      console.error('Error loading admin data:', err)
      setError('Data could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  // Reloads only the gyms list (used after status / expiry changes)
  const loadGyms = useCallback(async () => {
    const { data, error: gymsError } = await supabase
      .from('gyms')
      .select(GYM_COLUMNS)
      .order('created_at', { ascending: false })
    if (gymsError) {
      console.error('Error reloading gyms:', gymsError)
      setError('The gyms list could not be reloaded. Please try again.')
      return
    }
    setGyms((data as GymRow[]) || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subsByGym = useMemo(() => {
    const map = new Map<string, Subscription[]>()
    subs.forEach(s => {
      const list = map.get(s.gym_id) || []
      list.push(s)
      map.set(s.gym_id, list)
    })
    return map
  }, [subs])

  const subFor = useCallback(
    (gymId: string, key: string) => (subsByGym.get(gymId) || []).find(s => s.billing_month === key),
    [subsByGym]
  )

  const stats = useMemo(() => {
    const monthSubs = subs.filter(s => s.billing_month === monthKey)
    const collected = monthSubs.filter(s => s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)
    const due = monthSubs.filter(s => !s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)
    const paidGymIds = new Set(monthSubs.filter(s => s.is_paid).map(s => s.gym_id))
    return {
      total: gyms.length,
      active: gyms.filter(g => g.status === 'active').length,
      suspended: gyms.filter(g => g.status === 'suspended').length,
      pending: gyms.filter(g => g.status === 'pending').length,
      collected,
      due,
      unpaidGyms: gyms.filter(g => !paidGymIds.has(g.id)).length
    }
  }, [gyms, subs, monthKey])

  const overview = useMemo(() => {
    const base = parseMonthKey(month)
    const rows = [5, 4, 3, 2, 1, 0].map(i => {
      const key = format(subMonths(base, i), 'yyyy-MM') + '-01'
      const list = subs.filter(s => s.billing_month === key)
      return {
        key,
        collected: list.filter(s => s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0),
        due: list.filter(s => !s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)
      }
    })
    const max = Math.max(1, ...rows.map(r => r.collected + r.due))
    return { rows, max }
  }, [subs, month])

  const filteredGyms = useMemo(() => {
    const q = search.trim().toLowerCase()
    return gyms.filter(g => {
      if (tab === 'unpaid') {
        if (subFor(g.id, monthKey)?.is_paid) return false
      } else if (tab !== 'all' && g.status !== tab) {
        return false
      }
      if (!q) return true
      return (
        g.name.toLowerCase().includes(q) ||
        g.owner_name.toLowerCase().includes(q) ||
        g.owner_email.toLowerCase().includes(q)
      )
    })
  }, [gyms, tab, search, monthKey, subFor])

  const totalPages = Math.max(1, Math.ceil(filteredGyms.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageGyms = filteredGyms.slice(pageStart, pageStart + PAGE_SIZE)

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'All gyms', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'suspended', label: 'Suspended', count: stats.suspended },
    { key: 'unpaid', label: 'Unpaid', count: stats.unpaidGyms }
  ]

  async function logAction(gymId: string, action: string, details: string) {
    if (!currentUserId) return
    const { error: logError } = await supabase
      .from('audit_log')
      .insert({ gym_id: gymId, user_id: currentUserId, action, details })
    if (logError) console.error('Audit log error:', logError)
  }

  // ---------- Fee / payment ----------

  function openFee(gym: GymRow, sub: Subscription | null) {
    const previous = (subsByGym.get(gym.id) || [])[0]
    setFeeGym(gym)
    setFeeSub(sub)
    setFeeForm({
      month: sub ? sub.billing_month.slice(0, 7) : month,
      amount: sub ? String(Number(sub.amount)) : previous ? String(Number(previous.amount)) : '',
      paid: sub ? sub.is_paid : true,
      note: sub?.note || ''
    })
    setFeeError(null)
  }

  function closeFee() {
    if (feeSaving) return
    setFeeGym(null)
    setFeeSub(null)
    setFeeError(null)
  }

  async function handleSaveFee(e: FormEvent) {
    e.preventDefault()
    if (!feeGym) return

    const amount = Number(feeForm.amount)
    if (
      feeForm.amount.trim() === '' ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount >= MAX_AMOUNT
    ) {
      setFeeError('Amount must be a valid number.')
      return
    }
    if (!feeForm.month) {
      setFeeError('Please select a month.')
      return
    }

    const key = `${feeForm.month}-01`
    const existing = subFor(feeGym.id, key)

    setFeeSaving(true)
    setFeeError(null)
    try {
      const { data: savedRows, error: saveError } = await supabase
        .from('gym_subscriptions')
        .upsert(
          {
            gym_id: feeGym.id,
            billing_month: key,
            amount,
            is_paid: feeForm.paid,
            paid_at: feeForm.paid
              ? existing?.is_paid && existing.paid_at
                ? existing.paid_at
                : new Date().toISOString()
              : null,
            note: feeForm.note.trim() || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'gym_id,billing_month' }
        )
        .select('id')
      if (saveError) throw saveError
      if (!savedRows || savedRows.length === 0) throw new Error('Fee save was blocked (0 rows)')

      await logAction(
        feeGym.id,
        'Gym fee saved',
        `${monthLabel(feeForm.month)}: ${amount} (${feeForm.paid ? 'paid' : 'unpaid'})`
      )
      setFeeGym(null)
      setFeeSub(null)
      await loadData()
    } catch (err) {
      console.error('Error saving fee:', err)
      setFeeError('The fee could not be saved. Please try again.')
    } finally {
      setFeeSaving(false)
    }
  }

  async function setPaid(gym: GymRow, sub: Subscription, paid: boolean) {
    setBusyId(gym.id)
    setError(null)
    try {
      const paidAt = paid ? new Date().toISOString() : null
      const { data: changed, error: updateError } = await supabase
        .from('gym_subscriptions')
        .update({ is_paid: paid, paid_at: paidAt, updated_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select('id')
      if (updateError) throw updateError
      if (!changed || changed.length === 0) throw new Error('Update was blocked (0 rows)')

      setSubs(prev =>
        prev.map(s => (s.id === sub.id ? { ...s, is_paid: paid, paid_at: paidAt } : s))
      )
      await logAction(
        gym.id,
        paid ? 'Gym fee marked paid' : 'Gym fee marked unpaid',
        monthLabel(sub.billing_month.slice(0, 7))
      )
    } catch (err) {
      console.error('Error updating payment:', err)
      setError('The payment status could not be changed. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  function handleTick(gym: GymRow) {
    const sub = subFor(gym.id, monthKey)
    if (!sub) {
      openFee(gym, null)
      return
    }
    if (!sub.is_paid) {
      void setPaid(gym, sub, true)
      return
    }
    setReason('')
    setConfirmState({
      title: 'Remove the paid mark?',
      message: `The fee for ${gym.name} for ${monthLabel(month)} will be marked Unpaid again.`,
      confirmLabel: 'Yes, mark Unpaid',
      danger: true,
      onConfirm: async () => {
        await setPaid(gym, sub, false)
      }
    })
  }

  function requestDeleteSub(gym: GymRow, sub: Subscription) {
    setReason('')
    setConfirmState({
      title: 'Delete fee record?',
      message: `The ${monthLabel(sub.billing_month.slice(0, 7))} record for ${gym.name} (${formatCurrency(
        Number(sub.amount)
      )}) will be deleted. This cannot be undone.`,
      confirmLabel: 'Yes, Delete',
      danger: true,
      onConfirm: async () => {
        try {
          const { data: removed, error: deleteError } = await supabase
            .from('gym_subscriptions')
            .delete()
            .eq('id', sub.id)
            .select('id')
          if (deleteError) throw deleteError
          if (!removed || removed.length === 0) throw new Error('Delete was blocked (0 rows)')
          setSubs(prev => prev.filter(s => s.id !== sub.id))
          await logAction(gym.id, 'Gym fee deleted', monthLabel(sub.billing_month.slice(0, 7)))
        } catch (err) {
          console.error('Error deleting fee:', err)
          setError('The fee record could not be deleted. Please try again.')
        }
      }
    })
  }

  // ---------- Gym status / license ----------

  async function updateGymStatus(
    gym: GymRow,
    newStatus: GymStatus,
    why: string,
    newExpiryISO: string | null
  ) {
    setError(null)
    try {
      const suspending = newStatus === 'suspended'
      // Suspend changes ONLY status, suspended_at, suspended_reason.
      // Reactivate / approve clears the suspend fields and writes expires_at only
      // when a new expiry was chosen.
      const patch: Record<string, unknown> = suspending
        ? {
            status: newStatus,
            suspended_at: new Date().toISOString(),
            suspended_reason: why || 'Suspended by administrator'
          }
        : { status: newStatus, suspended_at: null, suspended_reason: null }
      if (!suspending && newExpiryISO) patch.expires_at = newExpiryISO

      const { data: changed, error: updateError } = await supabase
        .from('gyms')
        .update(patch)
        .eq('id', gym.id)
        .select('id')
      if (updateError) throw updateError
      if (!changed || changed.length === 0) throw new Error('Status change was blocked (0 rows)')

      await logAction(
        gym.id,
        `Gym status: ${newStatus}`,
        suspending
          ? `Suspended by super admin${why ? `: ${why}` : ''}`
          : `${gym.status} -> ${newStatus} by super admin${
              newExpiryISO ? `, new expiry ${expiryLabel(newExpiryISO)}` : ''
            }`
      )
      await loadGyms()
    } catch (err) {
      console.error('Error updating gym status:', err)
      setError('The gym status could not be changed. Please try again.')
    }
  }

  function requestStatus(gym: GymRow, newStatus: GymStatus) {
    const suspending = newStatus === 'suspended'
    const needsExpiry = !suspending && isPast(gym.expires_at)
    setReason('')
    setExpiryDate('')
    setConfirmError(null)
    setConfirmState({
      title: suspending ? 'Suspend gym?' : 'Activate gym?',
      message: suspending
        ? `The owner of ${gym.name} will not be able to use their account until you activate it again.`
        : needsExpiry
          ? `The license for ${gym.name} expired on ${expiryLabel(gym.expires_at)}. Choose a new expiry date to activate it.`
          : `${gym.name} will be activated and its owner will be able to use the account.`,
      confirmLabel: suspending ? 'Yes, Suspend' : 'Yes, Activate',
      danger: suspending,
      askReason: suspending,
      expiry: needsExpiry ? 'required' : undefined,
      onConfirm: async (why, expiryISO) => {
        await updateGymStatus(gym, newStatus, why, expiryISO)
      }
    })
  }

  function requestExpiry(gym: GymRow) {
    setReason('')
    setExpiryDate(gym.expires_at ? isoToPkDate(gym.expires_at) : '')
    setConfirmError(null)
    setConfirmState({
      title: 'Set license expiry',
      message: `${gym.name}: choose an expiry date. Leave it empty and the license will never expire.`,
      confirmLabel: 'Save',
      expiry: 'optional',
      onConfirm: async (_why, expiryISO) => {
        setError(null)
        try {
          const { data: changed, error: updateError } = await supabase
            .from('gyms')
            .update({ expires_at: expiryISO })
            .eq('id', gym.id)
            .select('id')
          if (updateError) throw updateError
          if (!changed || changed.length === 0) throw new Error('Expiry change was blocked (0 rows)')

          await logAction(
            gym.id,
            'Gym license expiry set',
            `${expiryLabel(gym.expires_at)} -> ${expiryLabel(expiryISO)}`
          )
          await loadGyms()
        } catch (err) {
          console.error('Error setting expiry:', err)
          setError('The license expiry could not be saved. Please try again.')
        }
      }
    })
  }

  async function copyKey(gym: GymRow) {
    if (!gym.license_key) return
    try {
      await navigator.clipboard.writeText(gym.license_key)
      setCopiedId(gym.id)
      window.setTimeout(() => setCopiedId(id => (id === gym.id ? null : id)), 2000)
      await logAction(gym.id, 'License key copied', gym.name)
    } catch (err) {
      console.error('Error copying key:', err)
      setError('The key could not be copied. Select it and copy it manually.')
    }
  }

  async function runConfirm() {
    if (!confirmState) return

    let expiryISO: string | null = null
    if (confirmState.expiry) {
      if (!expiryDate) {
        if (confirmState.expiry === 'required') {
          setConfirmError('Please choose a new expiry date.')
          return
        }
      } else {
        expiryISO = expiryToISO(expiryDate)
        if (confirmState.expiry === 'required' && new Date(expiryISO).getTime() <= Date.now()) {
          setConfirmError('The expiry date must be today or later.')
          return
        }
      }
    }

    setConfirmError(null)
    setConfirmBusy(true)
    try {
      await confirmState.onConfirm(reason.trim(), expiryISO)
    } finally {
      setConfirmBusy(false)
      setConfirmState(null)
      setReason('')
      setExpiryDate('')
    }
  }

  if (loading || !allowed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Super Admin</h1>
          </div>
          {error ? (
            <div className={`${bannerBase} border-red-100 bg-red-50 text-red-700`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 rounded-2xl bg-gray-200/60" />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Gyms',
      value: String(stats.total),
      subtitle: `${stats.active} active, ${stats.suspended} suspended`,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: `Collected (${monthLabel(month)})`,
      value: formatCurrency(stats.collected),
      subtitle: 'Fees marked as paid',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: `Outstanding (${monthLabel(month)})`,
      value: formatCurrency(stats.due),
      subtitle: `${stats.unpaidGyms} gyms have not paid yet`,
      icon: Wallet,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      title: 'Pending Approval',
      value: String(stats.pending),
      subtitle: 'New gyms awaiting approval',
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Super Admin</h1>
              <p className="text-sm text-gray-500">{filteredGyms.length} gyms found</p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start rounded-2xl bg-white p-2 pl-4 shadow-sm ring-1 ring-gray-200/70 sm:self-auto">
            <span className="whitespace-nowrap text-sm font-medium text-gray-500">Billing month</span>
            <input
              type="month"
              value={month}
              onChange={e => {
                if (e.target.value) {
                  setMonth(e.target.value)
                  setPage(1)
                }
              }}
              className={`${inputClass} w-40 !shadow-none`}
            />
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={async () => {
                await signOut()
                router.push('/auth/login')
                router.refresh()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {error && (
          <div className={`${bannerBase} border-red-100 bg-red-50 text-red-700`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {subsError && (
          <div className={`${bannerBase} border-amber-200 bg-amber-50 text-amber-800`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{subsError}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(stat => (
            <Card
              key={stat.title}
              className="rounded-2xl border-0 bg-white shadow-sm ring-1 ring-gray-200/70 transition-shadow hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-3">
                <CardTitle className="text-sm font-medium text-gray-500">{stat.title}</CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="mb-1 text-2xl font-semibold tracking-tight tabular-nums text-gray-900">
                  {stat.value}
                </div>
                <p className="text-xs text-gray-500">{stat.subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Gyms list */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200/70 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 max-w-full overflow-x-auto px-1 py-1">
              <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key)
                      setPage(1)
                    }}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      tab === t.key
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {t.label}{' '}
                    <span
                      className={`text-xs tabular-nums ${tab === t.key ? 'text-blue-500' : 'text-gray-400'}`}
                    >
                      ({t.count})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by gym, owner or email"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <div className="mt-5">
            {/* Sticky column header (desktop table only). /admin has no sticky top bar, so it sticks near the top */}
            <div className="sticky top-3 z-20 mb-2 hidden grid-cols-[2fr_1.6fr_1fr_1.2fr_80px_110px] gap-4 rounded-xl bg-gray-50/95 px-4 py-3 text-xs font-medium text-gray-500 ring-1 ring-gray-200/70 backdrop-blur xl:grid">
              <span>Gym</span>
              <span>Owner</span>
              <span>Status</span>
              <span>Fee ({monthLabel(month)})</span>
              <span className="text-center">Paid</span>
              <span className="text-right">Action</span>
            </div>

            {pageGyms.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-500">
                {gyms.length === 0 ? 'There are no gyms yet.' : 'No gyms match this filter.'}
              </p>
            ) : (
              <div className="space-y-3 xl:space-y-2">
                {pageGyms.map(gym => {
                  const sub = subFor(gym.id, monthKey)
                  const selected = selectedId === gym.id
                  const expanded = expandedId === gym.id
                  const style = statusStyles[gym.status] || statusStyles.inactive
                  const history = subsByGym.get(gym.id) || []
                  const totalPaid = history
                    .filter(s => s.is_paid)
                    .reduce((sum, s) => sum + Number(s.amount), 0)
                  const totalDue = history
                    .filter(s => !s.is_paid)
                    .reduce((sum, s) => sum + Number(s.amount), 0)
                  const paidMonths = history.filter(s => s.is_paid).length

                  const statusPill = (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${style.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {gym.status}
                    </span>
                  )

                  const feeCell = sub ? (
                    <p className="font-semibold tabular-nums text-gray-900">
                      {formatCurrency(Number(sub.amount))}
                    </p>
                  ) : (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        openFee(gym, null)
                      }}
                      className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Plus className="w-3 h-3" /> Set fee
                    </button>
                  )

                  const tickButton = (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleTick(gym)
                      }}
                      disabled={busyId === gym.id}
                      title={
                        sub?.is_paid
                          ? 'Paid. Click to remove the mark'
                          : sub
                            ? 'Mark as paid'
                            : 'Set a fee first'
                      }
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 ${
                        sub?.is_paid
                          ? 'border-emerald-500 bg-emerald-500 !text-white shadow-sm hover:bg-emerald-600'
                          : sub
                            ? 'border-gray-300 hover:border-emerald-500 hover:text-emerald-500'
                            : 'border-dashed border-gray-300'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )

                  const actionButtons = (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          openFee(gym, sub || null)
                        }}
                        title="Edit fee"
                        className={iconBtnClass}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setExpandedId(expanded ? null : gym.id)
                        }}
                        title="History"
                        className={iconBtnClass}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  )

                  return (
                    <div
                      key={gym.id}
                      className={`rounded-2xl ring-1 transition-all ${
                        selected
                          ? 'bg-blue-50/60 ring-blue-300 shadow-sm'
                          : 'bg-white ring-gray-200 hover:bg-gray-50/70 hover:ring-gray-300'
                      }`}
                    >
                      {/* Desktop row */}
                      <div
                        onClick={() => setSelectedId(selected ? null : gym.id)}
                        className="hidden cursor-pointer grid-cols-[2fr_1.6fr_1fr_1.2fr_80px_110px] items-center gap-4 px-4 py-3.5 text-sm xl:grid"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">{gym.name}</p>
                          <p className="text-xs text-gray-500">Joined {formatDate(gym.created_at)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-gray-900">{gym.owner_name}</p>
                          <p className="truncate text-xs text-gray-500">{gym.owner_email}</p>
                        </div>
                        <div>{statusPill}</div>
                        <div>{feeCell}</div>
                        <div className="flex justify-center">{tickButton}</div>
                        {actionButtons}
                      </div>

                      {/* Mobile / tablet stacked card */}
                      <div
                        onClick={() => setSelectedId(selected ? null : gym.id)}
                        className="cursor-pointer space-y-4 p-4 text-sm xl:hidden"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-gray-900">{gym.name}</p>
                            <p className="text-xs text-gray-500">Joined {formatDate(gym.created_at)}</p>
                          </div>
                          {statusPill}
                        </div>

                        <div className="min-w-0">
                          <p className="mb-0.5 text-xs font-medium text-gray-500">Owner</p>
                          <p className="truncate text-gray-900">{gym.owner_name}</p>
                          <p className="truncate text-xs text-gray-500">{gym.owner_email}</p>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 ring-1 ring-gray-100">
                          <div className="min-w-0">
                            <p className="mb-0.5 text-xs font-medium text-gray-500">
                              Fee ({monthLabel(month)})
                            </p>
                            {feeCell}
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-medium text-gray-500">Paid</span>
                            {tickButton}
                          </div>
                          {actionButtons}
                        </div>
                      </div>

                      {expanded && (
                        <div className="rounded-b-2xl border-t border-gray-100 bg-white p-4 sm:p-5">
                          <div className="mb-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6 [&>div]:rounded-xl [&>div]:bg-gray-50 [&>div]:p-3 [&>div]:ring-1 [&>div]:ring-gray-100">
                              <div>
                                <p className="text-xs text-gray-500">Collected to date</p>
                                <p className="font-semibold tabular-nums text-emerald-600">
                                  {formatCurrency(totalPaid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Outstanding</p>
                                <p className="font-semibold tabular-nums text-orange-600">
                                  {formatCurrency(totalDue)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Average / month</p>
                                <p className="font-semibold tabular-nums text-gray-900">
                                  {formatCurrency(paidMonths ? totalPaid / paidMonths : 0)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Phone</p>
                                <p className="font-semibold text-gray-900">{gym.phone || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">License expires</p>
                                <p
                                  className={`font-semibold ${
                                    isPast(gym.expires_at) ? 'text-red-600' : 'text-gray-900'
                                  }`}
                                >
                                  {expiryLabel(gym.expires_at)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">License key</p>
                                <div className="flex items-center gap-1">
                                  <code className="select-all break-all font-mono text-xs font-semibold text-gray-900">
                                    {gym.license_key || '-'}
                                  </code>
                                  {gym.license_key && (
                                    <button
                                      onClick={() => void copyKey(gym)}
                                      title="Copy key"
                                      className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    >
                                      {copiedId === gym.id ? (
                                        <Check className="w-4 h-4 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                              <Button size="sm" variant="outline" onClick={() => openFee(gym, null)}>
                                <Plus className="w-4 h-4 mr-1" /> Add month
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => requestExpiry(gym)}>
                                Set license expiry
                              </Button>
                              {gym.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => requestStatus(gym, 'suspended')}
                                >
                                  Suspend
                                </Button>
                              )}
                              {(gym.status === 'suspended' || gym.status === 'pending') && (
                                <Button size="sm" onClick={() => requestStatus(gym, 'active')}>
                                  {gym.status === 'pending' ? 'Approve' : 'Reactivate'}
                                </Button>
                              )}
                            </div>
                          </div>

                          {gym.suspended_at && gym.status === 'suspended' && (
                            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-800">
                              <strong>Suspended:</strong> {formatDate(gym.suspended_at)}
                              {gym.suspended_reason ? ` - ${gym.suspended_reason}` : ''}
                            </div>
                          )}

                          {history.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
                              There are no fee records yet.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {history.map(s => (
                                <div
                                  key={s.id}
                                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm ring-1 ring-gray-100 transition-colors hover:bg-gray-100/70"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900">
                                      {monthLabel(s.billing_month.slice(0, 7))}
                                    </p>
                                    {s.note && <p className="text-xs text-gray-500">{s.note}</p>}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-semibold tabular-nums text-gray-900">
                                      {formatCurrency(Number(s.amount))}
                                    </span>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                                        s.is_paid
                                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                                          : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                                      }`}
                                    >
                                      {s.is_paid
                                        ? `Paid${s.paid_at ? ` ${formatDate(s.paid_at)}` : ''}`
                                        : 'Unpaid'}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      <button
                                        onClick={() => openFee(gym, s)}
                                        title="Edit"
                                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => requestDeleteSub(gym, s)}
                                        title="Delete"
                                        className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {filteredGyms.length > 0 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500 sm:flex-row">
              <span>
                Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredGyms.length)} of{' '}
                {filteredGyms.length}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`h-8 w-8 rounded-lg text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      n === safePage ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Monthly overview */}
        <Card className="rounded-2xl border-0 bg-white shadow-sm ring-1 ring-gray-200/70">
          <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Wallet className="w-5 h-5 text-blue-600" />
              Monthly revenue (last 6 months)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            <div className="space-y-4">
              {overview.rows.map(row => (
                <div
                  key={row.key}
                  className="grid grid-cols-[72px_1fr] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[80px_1fr_auto]"
                >
                  <span className="text-gray-600">{monthLabel(row.key.slice(0, 7))}</span>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(row.collected / overview.max) * 100}%` }}
                    />
                    <div
                      className="bg-amber-300"
                      style={{ width: `${(row.due / overview.max) * 100}%` }}
                    />
                  </div>
                  <span className="col-span-2 text-xs tabular-nums text-gray-600 sm:col-span-1 sm:text-right">
                    <span className="font-semibold text-emerald-600">{formatCurrency(row.collected)}</span>
                    {row.due > 0 && (
                      <span className="text-orange-600"> / outstanding {formatCurrency(row.due)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-4 border-t border-gray-100 pt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-300" /> Outstanding
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Fee modal */}
        {feeGym && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-200">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                    {feeSub ? 'Edit fee' : 'Add fee'}
                  </h2>
                  <p className="text-sm text-gray-500">{feeGym.name}</p>
                </div>
                <button onClick={closeFee} className={iconBtnClass} aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFee} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Month *</label>
                  <input
                    type="month"
                    value={feeForm.month}
                    onChange={e => setFeeForm(f => ({ ...f, month: e.target.value }))}
                    disabled={!!feeSub}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500`}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Amount (Rs) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={feeForm.amount}
                    onChange={e => setFeeForm(f => ({ ...f, amount: e.target.value }))}
                    className={inputClass}
                    placeholder="5000"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    Enter how much the gym is paying for this month.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Note</label>
                  <input
                    type="text"
                    value={feeForm.note}
                    onChange={e => setFeeForm(f => ({ ...f, note: e.target.value }))}
                    className={inputClass}
                    placeholder="Optional (e.g. Easypaisa, cash)"
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100 transition-colors hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={feeForm.paid}
                    onChange={e => setFeeForm(f => ({ ...f, paid: e.target.checked }))}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Paid (the gym has paid)</span>
                </label>

                {feeError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                    {feeError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeFee} disabled={feeSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={feeSaving}>
                    {feeSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirm modal */}
        {confirmState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-200">
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    confirmState.danger ? 'bg-red-50' : 'bg-blue-50'
                  }`}
                >
                  <AlertTriangle
                    className={`w-5 h-5 ${confirmState.danger ? 'text-red-600' : 'text-blue-600'}`}
                  />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                  {confirmState.title}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-gray-600">{confirmState.message}</p>
              {confirmState.askReason && (
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className={`${inputClass} mt-4`}
                  placeholder="Reason (optional)"
                />
              )}
              {confirmState.expiry && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {confirmState.expiry === 'required' ? 'New expiry date *' : 'Expiry date (optional)'}
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    min={confirmState.expiry === 'required' ? pkToday() : undefined}
                    onChange={e => {
                      setExpiryDate(e.target.value)
                      setConfirmError(null)
                    }}
                    className={inputClass}
                  />
                </div>
              )}
              {confirmError && (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {confirmError}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmState(null)
                    setReason('')
                    setExpiryDate('')
                    setConfirmError(null)
                  }}
                  disabled={confirmBusy}
                >
                  Cancel
                </Button>
                <button
                  onClick={runConfirm}
                  disabled={confirmBusy}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
                    confirmState.danger
                      ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600'
                      : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600'
                  }`}
                >
                  {confirmBusy ? 'Please wait...' : confirmState.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}