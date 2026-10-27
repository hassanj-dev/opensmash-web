'use client'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCurrency } from '@/lib/user-context'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CreditCard,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { PaymentMethod, PaymentsSummary } from '@/types/database'
import { pkToday, pkDayStartISO } from '@/lib/pk-date'
import { logAudit } from '@/lib/audit'

interface Payment {
  id: string
  member_id: string
  plan_id: string | null
  receipt_no: string
  amount: number
  payment_method: PaymentMethod
  paid_at: string
  note: string | null
}

interface MemberOption {
  id: string
  code: string
  name: string
  phone: string | null
  is_active: boolean
  deleted_at: string | null
}

interface Plan {
  id: string
  duration_months: number
  price: number
  is_active: boolean
}

type MethodFilter = 'all' | PaymentMethod

interface FormState {
  memberId: string
  planId: string
  amount: string
  paymentMethod: PaymentMethod
  paidDate: string
  note: string
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  mobile_wallet: 'Mobile Wallet'
}

const PAGE_SIZE = 50 // payments shown per page
const MEMBER_PAGE = 1000 // Supabase "Max rows" is 1000, so members are read in pages
const MAX_AMOUNT = 100_000_000
const MAX_SEARCH_MEMBERS = 300

// Pakistan-local date, not the device clock
const todayStr = () => pkToday()

function emptyForm(): FormState {
  return {
    memberId: '',
    planId: '',
    amount: '',
    paymentMethod: 'cash',
    paidDate: todayStr(),
    note: ''
  }
}

// Plan ka label sirf duration se: Monthly / Quarterly / Half Yearly / Yearly
function planLabel(months: number) {
  if (months === 1) return 'Monthly'
  if (months === 3) return 'Quarterly'
  if (months === 6) return 'Half Yearly'
  if (months === 12) return 'Yearly'
  return `${months} months`
}

// 'YYYY-MM' -> [start of month, start of next month) in Pakistan time
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: pkDayStartISO(`${y}-${pad(m)}-01`),
    to: pkDayStartISO(`${ny}-${pad(nm)}-01`)
  }
}

// Remove characters that would break a PostgREST .or() filter or act as wildcards
function cleanSearch(text: string) {
  return text.replace(/[,()*%_\\"':;]/g, '').trim().slice(0, 40)
}

function isValidAmount(n: number) {
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

// Includes removed members too: old payments must still show the member's name
async function fetchAllMembers(gymId: string): Promise<MemberOption[]> {
  const all: MemberOption[] = []
  for (let from = 0; ; from += MEMBER_PAGE) {
    const { data, error } = await supabase
      .from('members')
      .select('id, code, name, phone, is_active, deleted_at')
      .eq('gym_id', gymId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MEMBER_PAGE - 1)
    if (error) throw error
    const rows = (data as MemberOption[]) || []
    all.push(...rows)
    if (rows.length < MEMBER_PAGE) break
  }
  return all
}

export default function PaymentsPage() {
  const { currency, fmt } = useCurrency()
  const [gymId, setGymId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [page, setPage] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced + cleaned
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [monthFilter, setMonthFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Used to ignore results from outdated list requests
  const requestIdRef = useRef(0)

  // RLS: only owner / manager can edit or delete payments
  const canManage = role === 'gym_owner' || role === 'manager'

  const loadBase = useCallback(async () => {
    setError(null)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Aap login nahi hain. Dobara login karein.')
        return
      }
      setUserId(user.id)

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('Aapke account ke saath koi gym linked nahi hai.')
        return
      }

      const currentGymId = userData.gym_id as string

      const [memberRows, plansRes] = await Promise.all([
        fetchAllMembers(currentGymId),
        supabase
          .from('plans')
          .select('id, duration_months, price, is_active')
          .eq('gym_id', currentGymId)
          .order('duration_months', { ascending: true })
      ])
      if (plansRes.error) throw plansRes.error

      setMembers(memberRows)
      setPlans((plansRes.data as Plan[]) || [])
      setRole((userData.role as string) || null)
      setGymId(currentGymId)
    } catch (err) {
      console.error('Error loading payments page:', err)
      setError('Page load nahi ho saka. Dobara koshish karein.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBase()
  }, [loadBase])

  // Search box: wait 300 ms after typing stops
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(cleanSearch(searchInput)), 300)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberOption>()
    members.forEach(m => map.set(m.id, m))
    return map
  }, [members])

  const planMap = useMemo(() => {
    const map = new Map<string, Plan>()
    plans.forEach(p => map.set(p.id, p))
    return map
  }, [plans])

  // Members whose name / code / phone match the search text (searched on the server by id)
  const searchMemberIds = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return []
    return members
      .filter(
        m =>
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          (m.phone || '').toLowerCase().includes(q)
      )
      .slice(0, MAX_SEARCH_MEMBERS)
      .map(m => m.id)
  }, [members, search])

    const loadPayments = useCallback(async (silent = false) => {
    if (!gymId) return
    const requestId = ++requestIdRef.current
    if (!silent) {
      setListLoading(true)
      setError(null)
    }
    try {
      const range = monthFilter ? monthRange(monthFilter) : null

      let query = supabase
        .from('payments')
               .select('id, member_id, plan_id, receipt_no, amount, payment_method, paid_at, note')
        .eq('gym_id', gymId)
        .is('deleted_at', null)

      if (methodFilter !== 'all') query = query.eq('payment_method', methodFilter)
      if (range) query = query.gte('paid_at', range.from).lt('paid_at', range.to)
      if (search) {
        const parts = [`receipt_no.ilike.%${search}%`]
        if (searchMemberIds.length > 0) parts.push(`member_id.in.(${searchMemberIds.join(',')})`)
        query = query.or(parts.join(','))
      }

      const listPromise = query
        .order('paid_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      // Total and count for ALL matching payments (not just this page)
      const summaryPromise = supabase.rpc('payments_filtered_summary', {
        p_from: range ? range.from : null,
        p_to: range ? range.to : null,
        p_method: methodFilter === 'all' ? null : methodFilter,
        p_receipt: search || null,
        p_member_ids: search && searchMemberIds.length > 0 ? searchMemberIds : null
      })

      const [listRes, summaryRes] = await Promise.all([listPromise, summaryPromise])
      if (requestId !== requestIdRef.current) return // a newer request is in flight

      if (listRes.error) throw listRes.error
      if (summaryRes.error) throw summaryRes.error

      const rows = (listRes.data as Payment[]) || []
      if (rows.length === 0 && page > 0) {
        setPage(page - 1) // last row of the last page was removed
        return
      }

      const summary = summaryRes.data as PaymentsSummary | null
      setPayments(rows)
      setTotalAmount(Number(summary?.total ?? 0))
      setTotalCount(Number(summary?.count ?? 0))
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error('Error loading payments:', err)
            if (!silent) setError('Payments load nahi ho sakin. Dobara koshish karein.')
    } finally {
      if (requestId === requestIdRef.current) setListLoading(false)
    }
  }, [gymId, page, methodFilter, monthFilter, search, searchMemberIds])

  useEffect(() => {
    if (!gymId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPayments()
  }, [gymId, loadPayments])
  
  // Quiet refresh: new desktop payments and members appear without a reload
  const refreshMembers = useCallback(async () => {
    if (!gymId) return
    try {
      const next = await fetchAllMembers(gymId)
      setMembers(prev => keepIfSame(prev, next))
    } catch (err) {
      console.error('Error refreshing members:', err)
    }
  }, [gymId])

  useLiveRefresh(() => { void loadPayments(true); void refreshMembers() }, {
    gymId,
    tables: ['payments', 'members'],
    enabled: !formOpen && !deleteTarget
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Add form: removed members are not selectable. Edit form keeps the payment's own member.
  const memberOptions = useMemo(
    () => members.filter(m => !m.deleted_at || m.id === form.memberId),
    [members, form.memberId]
  )

  // Dropdown mein active plans + (edit ke waqt) payment ka current plan, agar woh inactive ho
  const planOptions = useMemo(
    () => plans.filter(p => p.is_active || p.id === form.planId),
    [plans, form.planId]
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(payment: Payment) {
    setEditing(payment)
    setForm({
      memberId: payment.member_id,
      planId: payment.plan_id || '',
      amount: String(Number(payment.amount)),
      paymentMethod: payment.payment_method,
      paidDate: pkToday(new Date(payment.paid_at)),
      note: payment.note || ''
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

  // Plan select karne par amount mein plan ki price bhar do (tum badal sakte ho)
  function handlePlanChange(planId: string) {
    const plan = planId ? planMap.get(planId) : undefined
    setForm(f => ({
      ...f,
      planId,
      amount: plan ? String(Number(plan.price)) : f.amount
    }))
  }

  // Din wohi rakho to waqt bhi wohi; naya din ho to dopahar 12 baje (Pakistan time)
  function buildPaidAt(dateStr: string, original?: string) {
    if (original && pkToday(new Date(original)) === dateStr) return original
    if (dateStr === todayStr()) return new Date().toISOString()
    return new Date(`${dateStr}T12:00:00+05:00`).toISOString()
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!gymId || !userId) return

    if (!form.memberId) {
      setFormError('Member select karein.')
      return
    }
    if (!form.paidDate) {
      setFormError('Date zaroori hai.')
      return
    }
    if (form.paidDate > todayStr()) {
      setFormError('Aane wali date ki payment record nahi ho sakti.')
      return
    }
    const amount = Number(form.amount)
    if (form.amount.trim() === '' || !isValidAmount(amount)) {
      setFormError('Amount 0 se zyada sahi number hona chahiye.')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      if (editing) {
        const { data, error: updateError } = await supabase
          .from('payments')
          .update({
            plan_id: form.planId || null,
            amount,
            payment_method: form.paymentMethod,
            paid_at: buildPaidAt(form.paidDate, editing.paid_at),
            note: form.note.trim() || null
          })
          .eq('id', editing.id)
          .eq('gym_id', gymId)
          .select('id')

        if (updateError) throw updateError
        if (!data || data.length === 0) {
          setFormError('Change save nahi hua. Sirf owner ya manager payment edit kar sakta hai.')
          return
        }

        void logAudit(gymId, userId, 'payment_updated', {
          payment_id: editing.id,
          receipt_no: editing.receipt_no,
          old_amount: Number(editing.amount),
          new_amount: amount
        })
        setNotice(`Payment ${editing.receipt_no} update ho gayi.`)
      } else {
        const { data, error: insertError } = await supabase
          .from('payments')
          .insert({
            gym_id: gymId,
            member_id: form.memberId,
            plan_id: form.planId || null,
            receipt_no: '', // khali chhodne par database trigger receipt number bana deta hai
            amount,
            payment_method: form.paymentMethod,
            paid_at: buildPaidAt(form.paidDate),
            note: form.note.trim() || null,
            recorded_by: userId
          })
          .select('id, receipt_no')
          .single()

        if (insertError) throw insertError

        void logAudit(gymId, userId, 'payment_created', {
          payment_id: data?.id,
          receipt_no: data?.receipt_no,
          member_id: form.memberId,
          amount
        })
        setNotice(`Payment record ho gayi. Receipt: ${data?.receipt_no ?? '-'}`)
      }

      setFormOpen(false)
      setEditing(null)
      await loadPayments()
    } catch (err) {
      console.error('Error saving payment:', err)
      setFormError('Payment save nahi ho saki. Dobara koshish karein.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!gymId || !userId || !deleteTarget) return
    setDeleting(true)
    setError(null)
    setNotice(null)

    const { data, error: deleteError } = await supabase
            .from('payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .select('id')

    if (deleteError) {
      console.error('Error deleting payment:', deleteError)
      setError('Payment delete nahi ho saki. Dobara koshish karein.')
    } else if (!data || data.length === 0) {
      // RLS can block a delete without an error: nothing was removed
      setError('Payment delete nahi hui. Sirf owner ya manager payment delete kar sakta hai.')
    } else {
      void logAudit(gymId, userId, 'payment_deleted', {
        payment_id: deleteTarget.id,
        receipt_no: deleteTarget.receipt_no,
        member_id: deleteTarget.member_id,
        amount: Number(deleteTarget.amount),
        paid_at: deleteTarget.paid_at
      })
      setNotice(`Payment ${deleteTarget.receipt_no} delete ho gayi.`)
      await loadPayments()
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <Button onClick={openAdd} disabled={!gymId}>
          <Plus className="w-4 h-4 mr-2" />
          Add Payment
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
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              All Payments ({totalCount})
            </CardTitle>
            <p className="text-sm text-gray-600">
              Total (sab matching payments):{' '}
              <span className="font-semibold text-green-600">{fmt(totalAmount)}</span>
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => {
                  setSearchInput(e.target.value)
                  setPage(0)
                }}
                placeholder="Receipt, member ka naam, code ya phone"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={methodFilter}
              onChange={e => {
                setMethodFilter(e.target.value as MethodFilter)
                setPage(0)
              }}
              className={`${inputClass} lg:w-48`}
            >
              <option value="all">All methods</option>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(method => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
            <div className="flex gap-2 lg:w-60">
              <input
                type="month"
                value={monthFilter}
                onChange={e => {
                  setMonthFilter(e.target.value)
                  setPage(0)
                }}
                className={inputClass}
                aria-label="Month filter"
              />
              {monthFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setMonthFilter('')
                    setPage(0)
                  }}
                  className="rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listLoading && payments.length === 0 ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {totalCount === 0 && !search && methodFilter === 'all' && !monthFilter
                ? 'Abhi koi payment nahi hai. "Add Payment" se pehli payment record karein.'
                : 'Search ya filter se koi payment nahi mili.'}
            </p>
          ) : (
            <div className={`overflow-x-auto ${listLoading ? 'opacity-60' : ''}`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Receipt</th>
                    <th className="px-3 py-3 font-medium">Member</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Method</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    {canManage && <th className="px-3 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(payment => {
                    const member = memberMap.get(payment.member_id)
                    const plan = payment.plan_id ? planMap.get(payment.plan_id) : undefined
                    return (
                      <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-700">{payment.receipt_no}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{member?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">
                            {member?.code || '-'}
                            {member?.deleted_at ? ' · removed' : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {plan ? planLabel(plan.duration_months) : '-'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-green-600">
                          {fmt(Number(payment.amount))}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {paymentMethodLabels[payment.payment_method] || payment.payment_method}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{formatDate(payment.paid_at)}</td>
                        {canManage && (
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(payment)}
                                title="Edit"
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(payment)}
                                title="Delete"
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalCount > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Page {page + 1} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || listLoading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || listLoading}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit Payment' : 'Add Payment'}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Member *</label>
                <select
                  value={form.memberId}
                  onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))}
                  disabled={!!editing}
                  className={`${inputClass} disabled:bg-gray-100`}
                >
                  <option value="">Member select karein</option>
                  {memberOptions.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.code})
                      {member.deleted_at ? ' [removed]' : member.is_active ? '' : ' [inactive]'}
                    </option>
                  ))}
                </select>
                {members.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Abhi koi member nahi hai. Pehle Members page se member add karein.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
                <select
                  value={form.planId}
                  onChange={e => handlePlanChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">No plan</option>
                  {planOptions.map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {planLabel(plan.duration_months)}
                      {plan.is_active ? '' : ' [inactive]'}
                    </option>
                  ))}
                </select>
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
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className={inputClass}
                    placeholder="3000"
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                <input
                  type="date"
                  value={form.paidDate}
                  max={todayStr()}
                  onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>

              <p className="text-xs text-gray-500">
                Yeh sirf payment record karta hai, member ki expiry date nahi badalta. Membership
                barhane ke liye Members page par Renew button use karein.
              </p>

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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Payment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">Payment delete karein?</h2>
            </div>
            <p className="text-sm text-gray-700">
              Receipt <span className="font-medium">{deleteTarget.receipt_no}</span> (
              {fmt(Number(deleteTarget.amount))}) delete ho jayegi aur revenue se bhi
              kam ho jayegi. Yeh wapas nahi ho sakta. Audit log mein is ka record rahega.
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
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}