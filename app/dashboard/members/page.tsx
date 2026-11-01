'use client'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCurrency } from '@/lib/user-context'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { addMonths, format } from 'date-fns'
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  X,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/app/kit'
import { supabase } from '@/lib/supabase/client'
import { formatDate, isExpiringSoon, daysLeftText, daysUntilExpiry, EXPIRING_DAYS } from '@/lib/utils'
import { PaymentMethod, RenewMemberResult, CreateMemberResult } from '@/types/database'
import { pkToday } from '@/lib/pk-date'
import { logAudit } from '@/lib/audit'

interface Member {
  id: string
  code: string
  name: string
  phone: string | null
  plan_id: string | null
  join_date: string | null
  expiry_date: string | null
  is_active: boolean
}

interface Plan {
  id: string
  name: string
  duration_months: number
  price: number
  is_active: boolean
}

type MemberStatus = 'Active' | 'Expiring' | 'Expired' | 'Inactive'
type StatusFilter = 'all' | MemberStatus

interface FormState {
  name: string
  phone: string
  planId: string
  startDate: string // add: join/start date, edit: join date
  expiryDate: string // edit only
  amount: string
  paymentMethod: PaymentMethod
}

interface RenewState {
  planId: string
  amount: string
  paymentMethod: PaymentMethod
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  mobile_wallet: 'Mobile Wallet'
}

const PAGE_SIZE = 1000 // Supabase "Max rows" is 1000, so we read in pages
const MAX_AMOUNT = 100_000_000

// Pakistan-local date, not the device clock
const todayStr = () => pkToday()

function emptyForm(): FormState {
  return {
    name: '',
    phone: '',
    planId: '',
    startDate: todayStr(),
    expiryDate: '',
    amount: '',
    paymentMethod: 'cash'
  }
}

function parseDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function calcExpiry(startDate: string, months: number) {
  return format(addMonths(parseDate(startDate), months), 'yyyy-MM-dd')
}

// Plan label comes from the duration only: Monthly / Quarterly / Yearly
function planLabel(plan: Plan) {
  if (plan.duration_months === 1) return 'Monthly'
  if (plan.duration_months === 3) return 'Quarterly'
  if (plan.duration_months === 12) return 'Yearly'
  return `${plan.duration_months} months`
}

function getStatus(member: Member): MemberStatus {
  if (!member.is_active) return 'Inactive'
  if (!member.expiry_date || member.expiry_date < todayStr()) return 'Expired'
  // Ends today or tomorrow: staff must notice it at once
  if (isExpiringSoon(member.expiry_date)) return 'Expiring'
  return 'Active'
}

// Badge text: "2 days left" / "1 day left" (red). Other statuses show their own name.
function statusLabel(member: Member, status: MemberStatus) {
  if (status !== 'Expiring') return status
  return daysLeftText(member.expiry_date) ?? 'Expiring'
}

// Small line under the expiry date: "45 days left", "1 day left", "Expired 2 days ago"
function ExpiryCaption({ member }: { member: Member }) {
  if (!member.is_active || !member.expiry_date) return null
  const text = daysLeftText(member.expiry_date)
  if (!text) return null
  const n = daysUntilExpiry(member.expiry_date) ?? 0
  return (
    <p className={`text-xs ${n <= EXPIRING_DAYS ? 'font-medium text-red-600' : 'text-gray-500'}`}>
      {text}
    </p>
  )
}

function normalizePhone(phone: string) {
  return phone.replace(/[\s-]/g, '')
}

function isValidAmount(n: number) {
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT
}

function dbMessage(err: unknown, fallback: string) {
  const msg = (err as { message?: string } | null)?.message || ''
  if (msg.includes('DUPLICATE_PHONE')) return 'This phone number already belongs to an active member.'
  if (msg.includes('Plan not found')) return 'This plan was not found or is inactive.'
  if (msg.includes('Invalid amount')) return 'The amount is invalid.'
  if (msg.includes('Only owner or manager')) return 'Only the owner or manager can remove a member.'
  return fallback
}

const statusStyles: Record<MemberStatus, string> = {
  Active: 'bg-green-50 text-green-700 border-green-100',
  Expiring: 'bg-red-50 text-red-700 border-red-300 font-semibold',
  Expired: 'bg-orange-50 text-orange-700 border-orange-100',
  Inactive: 'bg-gray-100 text-gray-600 border-gray-200'
}

// Status badge with an icon: clock = ending soon ("1 day left"), cross = expired
function StatusBadge({ member, status }: { member: Member; status: MemberStatus }) {
  const Icon = status === 'Expiring' ? Clock : status === 'Expired' ? XCircle : null
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {statusLabel(member, status)}
    </span>
  )
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

// Supabase returns at most 1000 rows per request, so read every page
async function fetchAllMembers(gymId: string): Promise<Member[]> {
  const all: Member[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('members')
      .select('id, code, name, phone, plan_id, join_date, expiry_date, is_active')
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data as Member[]) || []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

// Re-renders the page when the Pakistan date changes (midnight), so "1 day left" turns into
// "Expired" by itself even if the page was left open overnight.
function useToday() {
  const [today, setToday] = useState(todayStr())
  useEffect(() => {
    const t = setInterval(() => {
      const now = todayStr()
      setToday(prev => (prev === now ? prev : now))
    }, 30_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export default function MembersPage() {
  const { currency } = useCurrency()
  const today = useToday()
  const [gymId, setGymId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Pagination (page 1, 2, 3 ...) - the list is cut into pages on screen only
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [renewTarget, setRenewTarget] = useState<Member | null>(null)
  const [renewForm, setRenewForm] = useState<RenewState>({
    planId: '',
    amount: '',
    paymentMethod: 'cash'
  })
  const [renewing, setRenewing] = useState(false)
  const [renewError, setRenewError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Only owner / manager may remove members (DB trigger enforces this too)
  const canDelete = role === 'gym_owner' || role === 'manager'

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
      setUserId(user.id)

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }

      const currentGymId = userData.gym_id as string
      setGymId(currentGymId)
      setRole((userData.role as string) || null)

      const [memberRows, plansRes] = await Promise.all([
        fetchAllMembers(currentGymId),
        supabase
          .from('plans')
          .select('id, name, duration_months, price, is_active')
          .eq('gym_id', currentGymId)
          .order('duration_months', { ascending: true })
      ])

      if (plansRes.error) throw plansRes.error

      setMembers(memberRows)
      setPlans((plansRes.data as Plan[]) || [])
    } catch (err) {
      console.error('Error loading members:', err)
      setError('Could not load members. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quiet refresh: picks up changes made on the desktop (sync)
  const refreshData = useCallback(async () => {
    if (!gymId) return
    try {
      const [memberRows, plansRes] = await Promise.all([
        fetchAllMembers(gymId),
        supabase
          .from('plans')
          .select('id, name, duration_months, price, is_active')
          .eq('gym_id', gymId)
          .order('duration_months', { ascending: true })
      ])
      if (plansRes.error) throw plansRes.error
      setMembers(prev => keepIfSame(prev, memberRows))
      setPlans(prev => keepIfSame(prev, (plansRes.data as Plan[]) || []))
    } catch (err) {
      console.error('Error refreshing members:', err)
    }
  }, [gymId])

  useLiveRefresh(() => { void refreshData() }, {
    gymId,
    tables: ['members', 'plans'],
    enabled: !formOpen && !renewTarget && !deleteTarget
  })

  const planMap = useMemo(() => {
    const map = new Map<string, Plan>()
    plans.forEach(p => map.set(p.id, p))
    return map
  }, [plans])

  const activePlans = useMemo(() => plans.filter(p => p.is_active), [plans])

  // Search by name, phone or member code (same as the desktop app)
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter(member => {
      if (statusFilter !== 'all' && getStatus(member) !== statusFilter) return false
      if (!q) return true
      return (
        member.name.toLowerCase().includes(q) ||
        (member.phone || '').toLowerCase().includes(q) ||
        member.code.toLowerCase().includes(q)
      )
    })
    // `today` is kept on purpose: it re-runs the filter when the Pakistan date changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, search, statusFilter, today])

  // If the last page becomes empty (delete / filter), fall back to the last page that exists
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / perPage))
  const currentPage = Math.min(page, totalPages)
  const pagedMembers = useMemo(
    () => filteredMembers.slice((currentPage - 1) * perPage, currentPage * perPage),
    [filteredMembers, currentPage, perPage]
  )

  // Same phone among ACTIVE members is not allowed (desktop rule)
  function findDuplicatePhone(phone: string, excludeId?: string) {
    const n = normalizePhone(phone)
    if (!n) return undefined
    return members.find(
      m => m.id !== excludeId && m.is_active && normalizePhone(m.phone || '') === n
    )
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(member: Member) {
    setEditing(member)
    setForm({
      name: member.name,
      phone: member.phone || '',
      planId: member.plan_id || '',
      startDate: member.join_date || todayStr(),
      expiryDate: member.expiry_date || '',
      amount: '',
      paymentMethod: 'cash'
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditing(null)
    setFormError(null)
  }

  // Add form: when the plan changes, fill the amount with the plan price (you can change it)
  function handlePlanChange(planId: string) {
    const plan = planId ? planMap.get(planId) : undefined
    setForm(f => ({
      ...f,
      planId,
      amount: plan ? String(Number(plan.price)) : f.amount
    }))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!gymId || !userId) return

    const name = form.name.trim()
    if (!name) {
      setFormError('Name is required.')
      return
    }
    if (!form.startDate) {
      setFormError(editing ? 'Join date is required.' : 'Start date is required.')
      return
    }

    const phone = form.phone.trim()
    const dup = findDuplicatePhone(phone, editing?.id)
    if (dup) {
      setFormError(`This phone number already belongs to ${dup.name} (${dup.code}).`)
      return
    }

    setFormError(null)

    // ---------- EDIT: name / phone / join date / expiry date only ----------
    if (editing) {
      if (form.expiryDate && form.expiryDate < form.startDate) {
        setFormError('Expiry date cannot be before the join date.')
        return
      }

      setSaving(true)
      try {
        const { data, error: updateError } = await supabase
          .from('members')
          .update({
            name,
            phone: phone || null,
            join_date: form.startDate,
            expiry_date: form.expiryDate || null
          })
          .eq('id', editing.id)
          .eq('gym_id', gymId)
          .select('id')

        if (updateError) throw updateError
        if (!data || data.length === 0) {
          setFormError('The change was not saved. You may not have permission to edit this member.')
          return
        }

        void logAudit(gymId, userId, 'member_updated', {
          member_id: editing.id,
          code: editing.code
        })
        setFormOpen(false)
        setEditing(null)
        setNotice('Member updated.')
        await loadData()
      } catch (err) {
        console.error('Error saving member:', err)
        setFormError(dbMessage(err, 'Could not save the member. Please try again.'))
      } finally {
        setSaving(false)
      }
      return
    }

    // ---------- ADD: member + payment in ONE database transaction ----------
    const plan = form.planId ? planMap.get(form.planId) : undefined
    if (form.planId && !plan) {
      setFormError('This plan was not found. Please select it again.')
      return
    }

    const amountText = form.amount.trim()
    const amount = amountText === '' ? 0 : Number(amountText)
    if (!isValidAmount(amount)) {
      setFormError('Amount must be a valid number.')
      return
    }

    setSaving(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('create_member', {
        p_name: name,
        p_phone: phone || null,
        p_plan_id: form.planId || null,
        p_join_date: form.startDate,
        p_amount: amount,
        p_method: form.paymentMethod
      })

      if (rpcError) throw rpcError

      const result = data as CreateMemberResult | null
      void logAudit(gymId, userId, 'member_created', {
        member_id: result?.member_id,
        code: result?.code,
        amount,
        receipt_no: result?.receipt_no
      })

      setFormOpen(false)
      setNotice(
        result?.receipt_no
          ? `Member ${result.code} added successfully. Receipt: ${result.receipt_no}`
          : `Member ${result?.code ?? ''} added successfully.`
      )
      await loadData()
    } catch (err) {
      console.error('Error saving member:', err)
      setFormError(dbMessage(err, 'Could not save the member. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  // ---------- RENEW ----------
  function openRenew(member: Member) {
    const current = member.plan_id ? planMap.get(member.plan_id) : undefined
    const startPlan = current && current.is_active ? current : undefined
    setRenewTarget(member)
    setRenewForm({
      planId: startPlan ? startPlan.id : '',
      amount: startPlan ? String(Number(startPlan.price)) : '',
      paymentMethod: 'cash'
    })
    setRenewError(null)
  }

  function closeRenew() {
    if (renewing) return
    setRenewTarget(null)
    setRenewError(null)
  }

  function handleRenewPlanChange(planId: string) {
    const plan = planId ? planMap.get(planId) : undefined
    setRenewForm(f => ({
      ...f,
      planId,
      amount: plan ? String(Number(plan.price)) : f.amount
    }))
  }

  // Same formula as the database function and the desktop app:
  // later of (today, current expiry) + plan months
  const renewPreview = useMemo(() => {
    if (!renewTarget || !renewForm.planId) return null
    const plan = planMap.get(renewForm.planId)
    if (!plan) return null
    const today = todayStr()
    const base =
      renewTarget.expiry_date && renewTarget.expiry_date > today ? renewTarget.expiry_date : today
    return calcExpiry(base, plan.duration_months)
  }, [renewTarget, renewForm.planId, planMap])

  async function handleRenew(e: FormEvent) {
    e.preventDefault()
    if (!gymId || !userId || !renewTarget) return

    if (!renewForm.planId) {
      setRenewError('Please select a plan.')
      return
    }
    const amount = Number(renewForm.amount.trim())
    if (!isValidAmount(amount) || amount <= 0) {
      setRenewError('Amount must be a valid number greater than 0.')
      return
    }

    setRenewing(true)
    setRenewError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('renew_member', {
        p_member_id: renewTarget.id,
        p_plan_id: renewForm.planId,
        p_amount: amount,
        p_method: renewForm.paymentMethod,
        p_note: null
      })
      if (rpcError) throw rpcError

      const result = data as RenewMemberResult | null
      void logAudit(gymId, userId, 'member_renewed', {
        member_id: renewTarget.id,
        code: renewTarget.code,
        plan_id: renewForm.planId,
        amount,
        receipt_no: result?.receipt_no,
        new_expiry: result?.expiry_date
      })

      setNotice(
        `${renewTarget.name} renewed. New expiry: ${
          result?.expiry_date ? formatDate(result.expiry_date) : '-'
        }. Receipt: ${result?.receipt_no ?? '-'}`
      )
      setRenewTarget(null)
      await loadData()
    } catch (err) {
      console.error('Error renewing member:', err)
      setRenewError(dbMessage(err, 'Could not renew. Please try again.'))
    } finally {
      setRenewing(false)
    }
  }

  // ---------- ACTIVE / INACTIVE ----------
  async function handleToggleActive(member: Member) {
    if (!gymId || !userId) return
    setError(null)
    setNotice(null)

    // Re-activating must not create a second active member with the same phone
    if (!member.is_active) {
      const dup = findDuplicatePhone(member.phone || '', member.id)
      if (dup) {
        setError(`Cannot activate: this phone number is already used by active member ${dup.name} (${dup.code}).`)
        return
      }
    }

    setTogglingId(member.id)
    const { data, error: toggleError } = await supabase
      .from('members')
      .update({ is_active: !member.is_active })
      .eq('id', member.id)
      .eq('gym_id', gymId)
      .select('id')

    if (toggleError) {
      console.error('Error toggling member:', toggleError)
      setError('Could not change the status. Please try again.')
    } else if (!data || data.length === 0) {
      setError('The status was not changed. You may not have permission.')
    } else {
      setMembers(prev =>
        prev.map(m => (m.id === member.id ? { ...m, is_active: !m.is_active } : m))
      )
      void logAudit(gymId, userId, member.is_active ? 'member_deactivated' : 'member_activated', {
        member_id: member.id,
        code: member.code
      })
    }
    setTogglingId(null)
  }

  // ---------- DELETE (soft: the member is hidden, payments/attendance stay safe) ----------
  async function handleDelete() {
    if (!gymId || !userId || !deleteTarget) return
    setDeleting(true)
    setError(null)
    setNotice(null)

    const { data, error: deleteError } = await supabase
      .from('members')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', deleteTarget.id)
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .select('id')

    if (deleteError) {
      console.error('Error deleting member:', deleteError)
      setError(dbMessage(deleteError, 'Could not remove the member. Please try again.'))
    } else if (!data || data.length === 0) {
      setError('The member was not removed. You may not have permission.')
    } else {
      setMembers(prev => prev.filter(m => m.id !== deleteTarget.id))
      void logAudit(gymId, userId, 'member_deleted', {
        member_id: deleteTarget.id,
        code: deleteTarget.code,
        name: deleteTarget.name
      })
      setNotice(`${deleteTarget.name} removed. Their payments and attendance history are safe.`)
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Members</h1>
        <Card className="border-0 shadow-lg animate-pulse">
          <CardHeader>
            <div className="h-5 bg-gray-200 rounded w-40"></div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Edit form hint: what the expiry would be if it were simply join date + plan months
  const editingPlan = editing?.plan_id ? planMap.get(editing.plan_id) : undefined
  const editingPlanExpiry =
    editing && editingPlan && form.startDate
      ? calcExpiry(form.startDate, editingPlan.duration_months)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Members</h1>
        <Button onClick={openAdd} disabled={!gymId}>
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
          <span className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </span>
          <button
            onClick={() => setNotice(null)}
            className="p-0.5 rounded hover:bg-green-100"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            All Members ({filteredMembers.length})
          </CardTitle>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as StatusFilter)
                setPage(1)
              }}
              className={`${inputClass} sm:w-48`}
            >
              <option value="all">All</option>
              <option value="Active">Active</option>
              <option value="Expiring">Expiring</option>
              <option value="Expired">Expired</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {members.length === 0
                ? 'No members yet. Use "Add Member" to add your first member.'
                : 'No members match your search or filter.'}
            </p>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Name</th>
                    <th className="px-3 py-3 font-medium">Phone</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Join Date</th>
                    <th className="px-3 py-3 font-medium">Expiry Date</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMembers.map(member => {
                    const status = getStatus(member)
                    const plan = member.plan_id ? planMap.get(member.plan_id) : undefined
                    return (
                      <tr
                        key={member.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${
                          status === 'Expiring' ? 'bg-red-50/60' : ''
                        }`}
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.code}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{member.phone || '-'}</td>
                        <td className="px-3 py-3 text-gray-700">
                          {plan ? planLabel(plan) : 'No plan'}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {member.join_date ? formatDate(member.join_date) : '-'}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {member.expiry_date ? formatDate(member.expiry_date) : '-'}
                          <ExpiryCaption member={member} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge member={member} status={status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {member.is_active && (
                              <button
                                onClick={() => openRenew(member)}
                                title="Renew"
                                aria-label="Renew"
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-green-600"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleActive(member)}
                              disabled={togglingId === member.id}
                              title={member.is_active ? 'Make inactive' : 'Make active'}
                              aria-label={member.is_active ? 'Make inactive' : 'Make active'}
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEdit(member)}
                              title="Edit"
                              aria-label="Edit"
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => setDeleteTarget(member)}
                                title="Delete"
                                aria-label="Delete"
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: every member as a card (same actions as the table row) */}
            <div className="space-y-3 md:hidden">
              {pagedMembers.map(member => {
                const status = getStatus(member)
                const plan = member.plan_id ? planMap.get(member.plan_id) : undefined
                return (
                  <div
                    key={member.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm ${
                      status === 'Expiring' ? 'border-red-300 bg-red-50/60' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500">{member.code}</p>
                      </div>
                      <StatusBadge member={member} status={status} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500">Phone</dt>
                        <dd className="break-all text-gray-800">{member.phone || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Plan</dt>
                        <dd className="text-gray-800">{plan ? planLabel(plan) : 'No plan'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Join Date</dt>
                        <dd className="text-gray-800">
                          {member.join_date ? formatDate(member.join_date) : '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Expiry Date</dt>
                        <dd className="text-gray-800">
                          {member.expiry_date ? formatDate(member.expiry_date) : '-'}
                          <ExpiryCaption member={member} />
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-gray-100 pt-3">
                      {member.is_active && (
                        <button
                          onClick={() => openRenew(member)}
                          title="Renew"
                          aria-label="Renew"
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-green-600"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={togglingId === member.id}
                        title={member.is_active ? 'Make inactive' : 'Make active'}
                        aria-label={member.is_active ? 'Make inactive' : 'Make active'}
                        className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(member)}
                        title="Edit"
                        aria-label="Edit"
                        className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(member)}
                          title="Delete"
                          aria-label="Delete"
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Only needed once there is more than the smallest page size */}
            {filteredMembers.length > 10 && (
              <Pagination
                className="mt-4"
                page={currentPage}
                pageSize={perPage}
                total={filteredMembers.length}
                onPageChange={setPage}
                onPageSizeChange={size => {
                  setPerPage(size)
                  setPage(1)
                }}
              />
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      {formOpen && createPortal(
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit Member' : 'Add Member'}
              </h2>
              <button
                onClick={closeForm}
                className="p-1 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Member"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                  placeholder="03xx xxxxxxx"
                />
              </div>

              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Join Date *
                      </label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Expiry Date
                      </label>
                      <input
                        type="date"
                        value={form.expiryDate}
                        onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {editingPlanExpiry && form.expiryDate !== editingPlanExpiry && (
                    <p className="-mt-2 text-xs text-amber-700">
                      Join date + plan = {formatDate(editingPlanExpiry)}, but the expiry date is{' '}
                      {form.expiryDate ? formatDate(form.expiryDate) : 'empty'}. This is normal after a
                      renewal.{' '}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => setForm(f => ({ ...f, expiryDate: editingPlanExpiry }))}
                      >
                        Use it
                      </button>
                    </p>
                  )}
                  <p className="-mt-2 text-xs text-gray-500">
                    To change the plan or extend the membership, use the Renew button in the list.
                    Change the dates here only to correct a mistake.
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
                    <select
                      value={form.planId}
                      onChange={e => handlePlanChange(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">No plan</option>
                      {activePlans.map(plan => (
                        <option key={plan.id} value={plan.id}>
                          {planLabel(plan)}
                        </option>
                      ))}
                    </select>
                    {plans.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        No plans yet. Create a plan from the Plans page first.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      className={inputClass}
                    />
                    {form.planId && form.startDate && planMap.get(form.planId) && (
                      <p className="mt-1 text-xs text-gray-500">
                        Expiry date:{' '}
                        {formatDate(
                          calcExpiry(form.startDate, planMap.get(form.planId)!.duration_months)
                        )}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Amount ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                        className={inputClass}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Payment Method
                      </label>
                      <select
                        value={form.paymentMethod}
                        onChange={e =>
                          setForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))
                        }
                        className={inputClass}
                      >
                        {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(method => (
                          <option key={method} value={method}>
                            {paymentMethodLabels[method]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="-mt-2 text-xs text-gray-500">
                    Entering an amount creates a payment record and adds it to revenue. Leave it
                    empty or 0 to create no payment.
                  </p>
                </>
              )}

              {formError && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Renew modal */}
      {renewTarget && createPortal(
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Renew Membership</h2>
              <button
                onClick={closeRenew}
                className="p-1 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-700">
              <span className="font-medium">{renewTarget.name}</span> ({renewTarget.code}) · current
              expiry:{' '}
              {renewTarget.expiry_date ? formatDate(renewTarget.expiry_date) : 'none'}
            </p>

            <form onSubmit={handleRenew} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan *</label>
                <select
                  value={renewForm.planId}
                  onChange={e => handleRenewPlanChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select a plan</option>
                  {activePlans.map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {planLabel(plan)}
                    </option>
                  ))}
                </select>
                {renewPreview && (
                  <p className="mt-1 text-xs text-gray-500">
                    New expiry: {formatDate(renewPreview)} (counted from today or the current
                    expiry, whichever is later)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Amount ({currency}) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={renewForm.amount}
                    onChange={e => setRenewForm(f => ({ ...f, amount: e.target.value }))}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Payment Method
                  </label>
                  <select
                    value={renewForm.paymentMethod}
                    onChange={e =>
                      setRenewForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))
                    }
                    className={inputClass}
                  >
                    {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(method => (
                      <option key={method} value={method}>
                        {paymentMethodLabels[method]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="-mt-2 text-xs text-gray-500">
                Expiry and payment are saved together. If one fails, neither is saved.
              </p>

              {renewError && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {renewError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeRenew} disabled={renewing}>
                  Cancel
                </Button>
                <Button type="submit" disabled={renewing}>
                  {renewing ? 'Renewing...' : 'Renew'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirm modal */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">Remove member?</h2>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{deleteTarget.name}</span> ({deleteTarget.code}) will be
              removed from the list. Their payments and attendance history will not be deleted, and
              revenue reports stay the same.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              If you only want to stop the member, set them to Inactive instead of removing.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}