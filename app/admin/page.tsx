'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, subMonths } from 'date-fns'
import {
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  AlertTriangle,
  Building2,
  Wallet,
  Clock,
  CheckCircle,
  Plus,
  Copy,
  LayoutDashboard,
  BarChart3,
  CalendarClock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Logo from '@/components/Logo'
import AppShell, { Avatar, ShellNavItem } from '@/components/app/AppShell'
import {
  PageHeader,
  StatCard,
  StatusPill,
  EmptyState,
  Skeleton,
  Modal,
  ToastProvider,
  useToast,
  PillTone
} from '@/components/app/kit'
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
type SectionKey = 'overview' | 'gyms' | 'revenue'

interface NavDef {
  label: string
  icon: ShellNavItem['icon']
  key: SectionKey
  target: string // element id to scroll to ('top' = page top)
  tab?: TabKey
  badge?: number
}

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

interface AttentionItem {
  gym: GymRow
  kind: 'pending' | 'expired' | 'expiring'
  rank: number
  label: string
}

interface AdminUser {
  name: string | null
  email: string | null
  avatarUrl: string | null
}

const PAGE_SIZE = 8
const MAX_AMOUNT = 1_000_000_000
const EXPIRY_WARNING_DAYS = 14

const GYM_COLUMNS =
  'id, name, owner_name, owner_email, phone, status, created_at, suspended_at, suspended_reason, expires_at, license_key'

const statusTone: Record<string, PillTone> = {
  active: 'success',
  pending: 'warning',
  suspended: 'danger',
  inactive: 'neutral'
}

const iconBtnClass =
  'rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

const bannerBase = 'flex items-start gap-2 rounded-2xl border p-3.5 text-sm'

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
const daysLeft = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86_400_000

export default function AdminPage() {
  // Toasts need a provider; the admin page is not inside the dashboard layout
  return (
    <ToastProvider>
      <AdminDashboard />
    </ToastProvider>
  )
}

function AdminDashboard() {
  const router = useRouter()
  const toast = useToast()

  const [allowed, setAllowed] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
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
  const [section, setSection] = useState<SectionKey>('overview')

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
        .select('id, role, full_name, email, avatar_url')
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
      setAdminUser({
        name: me.full_name ?? null,
        email: me.email ?? user.email ?? null,
        avatarUrl: me.avatar_url ?? null
      })
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
      toast.error('The gyms list could not be reloaded. Please try again.')
      return
    }
    setGyms((data as GymRow[]) || [])
  }, [toast])

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
      const savedName = feeGym.name
      setFeeGym(null)
      setFeeSub(null)
      await loadData()
      toast.success(`Fee saved for ${savedName}.`)
    } catch (err) {
      console.error('Error saving fee:', err)
      setFeeError('The fee could not be saved. Please try again.')
    } finally {
      setFeeSaving(false)
    }
  }

  async function setPaid(gym: GymRow, sub: Subscription, paid: boolean) {
    setBusyId(gym.id)
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
      toast.success(paid ? `${gym.name} marked as paid.` : `${gym.name} marked as unpaid.`)
    } catch (err) {
      console.error('Error updating payment:', err)
      toast.error('The payment status could not be changed. Please try again.')
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
          toast.success('Fee record deleted.')
        } catch (err) {
          console.error('Error deleting fee:', err)
          toast.error('The fee record could not be deleted. Please try again.')
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
      toast.success(`${gym.name} is now ${newStatus}.`)
    } catch (err) {
      console.error('Error updating gym status:', err)
      toast.error('The gym status could not be changed. Please try again.')
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
          toast.success('License expiry saved.')
        } catch (err) {
          console.error('Error setting expiry:', err)
          toast.error('The license expiry could not be saved. Please try again.')
        }
      }
    })
  }

  async function copyKey(gym: GymRow) {
    if (!gym.license_key) return
    try {
      await navigator.clipboard.writeText(gym.license_key)
      toast.success('License key copied.')
      await logAction(gym.id, 'License key copied', gym.name)
    } catch (err) {
      console.error('Error copying key:', err)
      toast.error('The key could not be copied. Select it and copy it manually.')
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function cancelConfirm() {
    if (confirmBusy) return
    setConfirmState(null)
    setReason('')
    setExpiryDate('')
    setConfirmError(null)
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

  // ---------- Loading / not allowed (no admin chrome is shown until the role is verified) ----------

  if (loading || !allowed) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <Logo dark={false} tile href="/dashboard" />
          {error ? (
            <div role="alert" className={`${bannerBase} border-red-100 bg-red-50 text-red-700`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              <Skeleton className="h-9 w-56" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-[138px] rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-72 rounded-2xl" />
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------- Derived data for the page ----------

  const statusRows = [
    { label: 'Active', count: stats.active, dot: 'bg-emerald-500' },
    { label: 'Pending', count: stats.pending, dot: 'bg-amber-400' },
    { label: 'Suspended', count: stats.suspended, dot: 'bg-red-500' }
  ]
  const paidGyms = stats.total - stats.unpaidGyms
  const paidPct = stats.total ? Math.round((paidGyms / stats.total) * 100) : 0

  // Gyms that need a decision: waiting for approval, or license ended / ending soon
  const attention: AttentionItem[] = []
  for (const g of gyms) {
    if (g.status === 'pending') {
      attention.push({ gym: g, kind: 'pending', rank: 0, label: 'Waiting for approval' })
    } else if (g.status === 'active' && g.expires_at) {
      const left = daysLeft(g.expires_at)
      if (left <= 0) {
        attention.push({ gym: g, kind: 'expired', rank: 1, label: `License expired ${expiryLabel(g.expires_at)}` })
      } else if (left <= EXPIRY_WARNING_DAYS) {
        attention.push({ gym: g, kind: 'expiring', rank: 2, label: `License ends ${expiryLabel(g.expires_at)}` })
      }
    }
  }
  attention.sort((a, b) => a.rank - b.rank)

  const navDefs: NavDef[] = [
    { label: 'Overview', icon: LayoutDashboard, key: 'overview', target: 'top' },
    { label: 'All gyms', icon: Building2, key: 'gyms', target: 'gyms', tab: 'all', badge: stats.total },
    { label: 'Pending approval', icon: Clock, key: 'gyms', target: 'gyms', tab: 'pending', badge: stats.pending },
    { label: 'Unpaid fees', icon: Wallet, key: 'gyms', target: 'gyms', tab: 'unpaid', badge: stats.unpaidGyms },
    { label: 'Revenue', icon: BarChart3, key: 'revenue', target: 'revenue' }
  ]

  function goTo(item: NavDef) {
    setSection(item.key)
    if (item.tab) {
      setTab(item.tab)
      setPage(1)
    }
    if (item.target === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.setTimeout(
      () => document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60
    )
  }

  const navItems: ShellNavItem[] = navDefs.map(d => ({
    label: d.label,
    icon: d.icon,
    badge: d.badge,
    active: d.tab ? section === 'gyms' && tab === d.tab : section === d.key,
    onClick: () => goTo(d)
  }))

  return (
    <AppShell
      navItems={navItems}
      workspaceName="Control panel"
      workspaceRole="Super admin"
      user={adminUser}
      onSignOut={() => void handleSignOut()}
      subtitle={`Gym subscriptions and licenses for ${monthLabel(month)}`}
      topbarRight={
        <div className="flex items-center gap-2">
          <label htmlFor="billing-month" className="hidden text-xs font-medium text-slate-500 md:inline">
            Billing month
          </label>
          <Input
            id="billing-month"
            type="month"
            value={month}
            onChange={e => {
              if (e.target.value) {
                setMonth(e.target.value)
                setPage(1)
              }
            }}
            className="h-9 w-40"
          />
        </div>
      }
    >
      <PageHeader
        title="Platform overview"
        description={`${stats.total} gyms on OpenSmash. Fees shown for ${monthLabel(month)}.`}
      />

      {error && (
        <div role="alert" className={`${bannerBase} border-red-100 bg-red-50 text-red-700`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {subsError && (
        <div role="alert" className={`${bannerBase} border-amber-200 bg-amber-50 text-amber-800`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{subsError}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total gyms"
          value={stats.total}
          hint={`${stats.active} active, ${stats.suspended} suspended`}
          icon={Building2}
        />
        <StatCard
          featured
          label={`Collected (${monthLabel(month)})`}
          value={formatCurrency(stats.collected)}
          hint="Fees marked as paid"
          icon={CheckCircle}
        />
        <StatCard
          label={`Outstanding (${monthLabel(month)})`}
          value={formatCurrency(stats.due)}
          hint={`${stats.unpaidGyms} gyms have not paid yet`}
          icon={Wallet}
        />
        <StatCard
          label="Pending approval"
          value={stats.pending}
          hint="New gyms awaiting approval"
          icon={Clock}
        />
      </div>

      {/* Needs attention (only shown when something needs a decision) */}
      {attention.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              Needs attention
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700">
                {attention.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {attention.slice(0, 5).map(item => (
                <li key={`${item.gym.id}-${item.kind}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar name={item.gym.name} className="h-9 w-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.gym.name}</p>
                    <p className="truncate text-xs text-slate-500">{item.gym.owner_name}</p>
                  </div>
                  <StatusPill tone={item.kind === 'expiring' ? 'warning' : item.kind === 'expired' ? 'danger' : 'info'}>
                    {item.label}
                  </StatusPill>
                  {item.kind === 'pending' ? (
                    <Button size="sm" onClick={() => requestStatus(item.gym, 'active')}>
                      Approve
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => requestExpiry(item.gym)}>
                      Set expiry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {attention.length > 5 && (
              <p className="mt-3 text-xs text-slate-500">and {attention.length - 5} more. Use the filters below.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Revenue + status */}
      <div id="revenue" className="grid scroll-mt-24 grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Monthly revenue</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Last 6 months up to {monthLabel(month)}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-200" /> Outstanding
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex h-56 items-end justify-between gap-3 sm:gap-6">
              {overview.rows.map(row => (
                <div
                  key={row.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  title={`${monthLabel(row.key.slice(0, 7))}: collected ${formatCurrency(
                    row.collected
                  )}, outstanding ${formatCurrency(row.due)}`}
                >
                  <div className="flex min-h-0 w-full max-w-[56px] flex-1 flex-col justify-end overflow-hidden rounded-xl bg-slate-100">
                    <div className="bg-blue-200" style={{ height: `${(row.due / overview.max) * 100}%` }} />
                    <div className="bg-brand" style={{ height: `${(row.collected / overview.max) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-slate-600">{monthLabel(row.key.slice(0, 7))}</span>
                  <span className="max-w-full truncate text-[11px] tabular-nums text-slate-400">
                    {formatCurrency(row.collected)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gym status</CardTitle>
            <p className="mt-1 text-xs text-slate-500">{stats.total} gyms in total</p>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {statusRows.map(r => (
                <div
                  key={r.label}
                  className={r.dot}
                  style={{ width: `${(r.count / Math.max(1, stats.total)) * 100}%` }}
                />
              ))}
            </div>
            <ul className="space-y-3 text-sm">
              {statusRows.map(r => (
                <li key={r.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{r.count}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl bg-canvas p-4 ring-1 ring-slate-200/70">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Fees paid ({monthLabel(month)})</span>
                <span className="font-semibold tabular-nums text-slate-900">{paidPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {paidGyms} of {stats.total} gyms have paid
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gyms list */}
      <Card id="gyms" className="scroll-mt-24 p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Gyms</h2>
          <p className="text-xs text-slate-500">{filteredGyms.length} gyms found</p>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 max-w-full overflow-x-auto px-1 py-1">
            <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key)
                    setPage(1)
                  }}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    tab === t.key ? 'bg-white text-brand-deep shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t.label}{' '}
                  <span className={`text-xs tabular-nums ${tab === t.key ? 'text-brand' : 'text-slate-400'}`}>
                    ({t.count})
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="relative lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by gym, owner or email"
              aria-label="Search gyms"
              className="pl-9"
            />
          </div>
        </div>

        <div className="mt-5">
          {/* Sticky column header (desktop table only). Sticks just below the topbar */}
          <div className="sticky top-[4.5rem] z-20 mb-2 hidden grid-cols-[2fr_1.6fr_1fr_1.2fr_80px_110px] gap-4 rounded-xl bg-slate-50/95 px-4 py-3 text-xs font-medium text-slate-500 ring-1 ring-slate-200/70 backdrop-blur xl:grid">
            <span>Gym</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Fee ({monthLabel(month)})</span>
            <span className="text-center">Paid</span>
            <span className="text-right">Action</span>
          </div>

          {pageGyms.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={gyms.length === 0 ? 'There are no gyms yet' : 'No gyms match this filter'}
              description={
                gyms.length === 0
                  ? 'New gyms will appear here when owners sign up.'
                  : 'Try another tab or a different search.'
              }
              action={
                gyms.length > 0 && (tab !== 'all' || search) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTab('all')
                      setSearch('')
                      setPage(1)
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3 xl:space-y-2">
              {pageGyms.map(gym => {
                const sub = subFor(gym.id, monthKey)
                const selected = selectedId === gym.id
                const expanded = expandedId === gym.id
                const tone = statusTone[gym.status] || 'neutral'
                const history = subsByGym.get(gym.id) || []
                const totalPaid = history.filter(s => s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)
                const totalDue = history.filter(s => !s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)
                const paidMonths = history.filter(s => s.is_paid).length

                const statusPill = <StatusPill tone={tone}>{gym.status}</StatusPill>

                const feeCell = sub ? (
                  <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(Number(sub.amount))}</p>
                ) : (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      openFee(gym, null)
                    }}
                    className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Plus className="h-3 w-3" /> Set fee
                  </button>
                )

                const tickButton = (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleTick(gym)
                    }}
                    disabled={busyId === gym.id}
                    aria-label={sub?.is_paid ? 'Paid. Click to remove the mark' : sub ? 'Mark as paid' : 'Set a fee first'}
                    title={sub?.is_paid ? 'Paid. Click to remove the mark' : sub ? 'Mark as paid' : 'Set a fee first'}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 ${
                      sub?.is_paid
                        ? 'border-emerald-500 bg-emerald-500 !text-white shadow-sm hover:bg-emerald-600'
                        : sub
                          ? 'border-slate-300 hover:border-emerald-500 hover:text-emerald-500'
                          : 'border-dashed border-slate-300'
                    }`}
                  >
                    <Check className="h-4 w-4" />
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
                      aria-label="Edit fee"
                      className={iconBtnClass}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setExpandedId(expanded ? null : gym.id)
                      }}
                      title="History"
                      aria-label="Show fee history"
                      aria-expanded={expanded}
                      className={iconBtnClass}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                )

                return (
                  <div
                    key={gym.id}
                    className={`rounded-2xl ring-1 transition-all ${
                      selected
                        ? 'bg-brand-soft/50 shadow-sm ring-brand-light/60'
                        : 'bg-white ring-slate-200 hover:bg-slate-50/70 hover:ring-slate-300'
                    }`}
                  >
                    {/* Desktop row */}
                    <div
                      onClick={() => setSelectedId(selected ? null : gym.id)}
                      className="hidden cursor-pointer grid-cols-[2fr_1.6fr_1fr_1.2fr_80px_110px] items-center gap-4 px-4 py-3.5 text-sm xl:grid"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={gym.name} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{gym.name}</p>
                          <p className="text-xs text-slate-500">Joined {formatDate(gym.created_at)}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-slate-900">{gym.owner_name}</p>
                        <p className="truncate text-xs text-slate-500">{gym.owner_email}</p>
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
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={gym.name} className="h-10 w-10 text-sm" />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900">{gym.name}</p>
                            <p className="text-xs text-slate-500">Joined {formatDate(gym.created_at)}</p>
                          </div>
                        </div>
                        {statusPill}
                      </div>

                      <div className="min-w-0">
                        <p className="mb-0.5 text-xs font-medium text-slate-500">Owner</p>
                        <p className="truncate text-slate-900">{gym.owner_name}</p>
                        <p className="truncate text-xs text-slate-500">{gym.owner_email}</p>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                        <div className="min-w-0">
                          <p className="mb-0.5 text-xs font-medium text-slate-500">Fee ({monthLabel(month)})</p>
                          {feeCell}
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-slate-500">Paid</span>
                          {tickButton}
                        </div>
                        {actionButtons}
                      </div>
                    </div>

                    {expanded && (
                      <div className="rounded-b-2xl border-t border-slate-100 bg-white p-4 sm:p-5">
                        <div className="mb-4 space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6 [&>div]:rounded-xl [&>div]:bg-slate-50 [&>div]:p-3 [&>div]:ring-1 [&>div]:ring-slate-100">
                            <div>
                              <p className="text-xs text-slate-500">Collected to date</p>
                              <p className="font-semibold tabular-nums text-emerald-600">{formatCurrency(totalPaid)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Outstanding</p>
                              <p className="font-semibold tabular-nums text-orange-600">{formatCurrency(totalDue)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Average / month</p>
                              <p className="font-semibold tabular-nums text-slate-900">
                                {formatCurrency(paidMonths ? totalPaid / paidMonths : 0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Phone</p>
                              <p className="font-semibold text-slate-900">{gym.phone || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">License expires</p>
                              <p className={`font-semibold ${isPast(gym.expires_at) ? 'text-red-600' : 'text-slate-900'}`}>
                                {expiryLabel(gym.expires_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">License key</p>
                              <div className="flex items-center gap-1">
                                <code className="select-all break-all font-mono text-xs font-semibold text-slate-900">
                                  {gym.license_key || '-'}
                                </code>
                                {gym.license_key && (
                                  <button
                                    onClick={() => void copyKey(gym)}
                                    title="Copy key"
                                    aria-label="Copy license key"
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                            <Button size="sm" variant="outline" onClick={() => openFee(gym, null)}>
                              <Plus className="h-4 w-4" /> Add month
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => requestExpiry(gym)}>
                              Set license expiry
                            </Button>
                            {gym.status === 'active' && (
                              <Button size="sm" variant="destructive" onClick={() => requestStatus(gym, 'suspended')}>
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
                          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                            There are no fee records yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {history.map(s => (
                              <div
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-100 transition-colors hover:bg-slate-100/70"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900">{monthLabel(s.billing_month.slice(0, 7))}</p>
                                  {s.note && <p className="text-xs text-slate-500">{s.note}</p>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold tabular-nums text-slate-900">
                                    {formatCurrency(Number(s.amount))}
                                  </span>
                                  <StatusPill tone={s.is_paid ? 'success' : 'warning'}>
                                    {s.is_paid ? `Paid${s.paid_at ? ` ${formatDate(s.paid_at)}` : ''}` : 'Unpaid'}
                                  </StatusPill>
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      onClick={() => openFee(gym, s)}
                                      title="Edit"
                                      aria-label="Edit fee record"
                                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => requestDeleteSub(gym, s)}
                                      title="Delete"
                                      aria-label="Delete fee record"
                                      className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
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
          <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row">
            <span>
              Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredGyms.length)} of {filteredGyms.length}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="rounded-lg p-1.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  aria-current={n === safePage ? 'page' : undefined}
                  className={`h-8 w-8 rounded-lg text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    n === safePage ? 'cs-primary text-white shadow-sm' : 'hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="rounded-lg p-1.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Fee modal */}
      <Modal
        open={!!feeGym}
        onClose={closeFee}
        dismissible={!feeSaving}
        title={feeSub ? 'Edit fee' : 'Add fee'}
        description={feeGym?.name}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeFee} disabled={feeSaving}>
              Cancel
            </Button>
            <Button type="submit" form="fee-form" disabled={feeSaving}>
              {feeSaving ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <form id="fee-form" onSubmit={handleSaveFee} className="space-y-4">
          <div>
            <label htmlFor="fee-month" className="mb-1.5 block text-sm font-medium text-slate-700">
              Month *
            </label>
            <Input
              id="fee-month"
              type="month"
              value={feeForm.month}
              onChange={e => setFeeForm(f => ({ ...f, month: e.target.value }))}
              disabled={!!feeSub}
            />
          </div>

          <div>
            <label htmlFor="fee-amount" className="mb-1.5 block text-sm font-medium text-slate-700">
              Amount (Rs) *
            </label>
            <Input
              id="fee-amount"
              type="number"
              min="0"
              step="any"
              value={feeForm.amount}
              onChange={e => setFeeForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="5000"
            />
            <p className="mt-1.5 text-xs text-slate-500">Enter how much the gym is paying for this month.</p>
          </div>

          <div>
            <label htmlFor="fee-note" className="mb-1.5 block text-sm font-medium text-slate-700">
              Note
            </label>
            <Input
              id="fee-note"
              type="text"
              value={feeForm.note}
              onChange={e => setFeeForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Optional (e.g. Easypaisa, cash)"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 transition-colors hover:bg-slate-100">
            <input
              type="checkbox"
              checked={feeForm.paid}
              onChange={e => setFeeForm(f => ({ ...f, paid: e.target.checked }))}
              className="h-4 w-4 rounded accent-[#1f6bff]"
            />
            <span className="text-sm text-slate-700">Paid (the gym has paid)</span>
          </label>

          {feeError && (
            <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {feeError}
            </div>
          )}
        </form>
      </Modal>

      {/* Confirm modal */}
      <Modal
        open={!!confirmState}
        onClose={cancelConfirm}
        dismissible={!confirmBusy}
        title={confirmState?.title ?? ''}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={cancelConfirm} disabled={confirmBusy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmState?.danger ? 'destructive' : 'default'}
              onClick={() => void runConfirm()}
              disabled={confirmBusy}
            >
              {confirmBusy ? 'Please wait...' : confirmState?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              confirmState?.danger ? 'bg-red-50' : 'bg-brand-soft'
            }`}
          >
            <AlertTriangle className={`h-5 w-5 ${confirmState?.danger ? 'text-red-600' : 'text-brand'}`} />
          </div>
          <p className="pt-1 text-sm leading-relaxed text-slate-600">{confirmState?.message}</p>
        </div>
        {confirmState?.askReason && (
          <Input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="mt-4"
            placeholder="Reason (optional)"
            aria-label="Reason"
          />
        )}
        {confirmState?.expiry && (
          <div className="mt-4">
            <label htmlFor="confirm-expiry" className="mb-1.5 block text-sm font-medium text-slate-700">
              {confirmState.expiry === 'required' ? 'New expiry date *' : 'Expiry date (optional)'}
            </label>
            <Input
              id="confirm-expiry"
              type="date"
              value={expiryDate}
              min={confirmState.expiry === 'required' ? pkToday() : undefined}
              onChange={e => {
                setExpiryDate(e.target.value)
                setConfirmError(null)
              }}
            />
          </div>
        )}
        {confirmError && (
          <div role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {confirmError}
          </div>
        )}
      </Modal>
    </AppShell>
  )
}