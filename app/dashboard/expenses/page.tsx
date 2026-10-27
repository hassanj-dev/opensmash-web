'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Receipt, Plus, Search, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { pkToday, pkMonth, pkMonthEnd } from '@/lib/pk-date'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCurrency } from '@/lib/user-context'

interface Expense {
  id: string
  category: string
  amount: number
  spent_on: string
  note: string | null
}

interface FormState {
  category: string
  customCategory: string
  amount: string
  spentOn: string
  note: string
}

const PRESET_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salaries',
  'Equipment',
  'Maintenance',
  'Cleaning',
  'Marketing',
  'Other'
]

const PAGE = 1000 // Supabase returns at most 1000 rows per request
const MAX_PAGES = 10 // safety limit: 10,000 rows
const MAX_AMOUNT = 1_000_000_000

function emptyForm(): FormState {
  return {
    category: PRESET_CATEGORIES[0],
    customCategory: '',
    amount: '',
    spentOn: pkToday(), // Pakistan date, not the device clock
    note: ''
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

export default function ExpensesPage() {
  const { currency, fmt } = useCurrency()
  const [gymId, setGymId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState(pkMonth())

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)

  const requestIdRef = useRef(0)

  const init = useCallback(async () => {
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
        .select('gym_id')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }
      setGymId(userData.gym_id as string)
    } catch (err) {
      console.error('Error loading expenses page:', err)
      setError('Could not load the page. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Loads the selected month (or everything) in pages of 1000, so totals are never silently cut
  const loadExpenses = useCallback(async (gid: string, month: string, silent = false) => {
    const requestId = ++requestIdRef.current
    if (!silent) setListLoading(true)
    try {
      const all: Expense[] = []
      let hitLimit = false
      for (let page = 0; page < MAX_PAGES; page++) {
        let q = supabase
          .from('expenses')
                    .select('id, category, amount, spent_on, note')
          .eq('gym_id', gid)
          .is('deleted_at', null)
          .order('spent_on', { ascending: false })
          .order('id', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1)
        if (month) q = q.gte('spent_on', `${month}-01`).lte('spent_on', pkMonthEnd(month))

        const { data, error: expensesError } = await q
        if (expensesError) throw expensesError
        const rows = (data as Expense[]) || []
        all.push(...rows)
        if (rows.length < PAGE) break
        if (page === MAX_PAGES - 1) hitLimit = true
      }
      if (requestId !== requestIdRef.current) return
      setExpenses(prev => keepIfSame(prev, all))
      setTruncated(hitLimit)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error('Error loading expenses:', err)
      if (!silent) setError('Could not load expenses. Please try again.')
    } finally {
      if (requestId === requestIdRef.current) setListLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void init()
  }, [init])

  useEffect(() => {
    if (!gymId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExpenses(gymId, monthFilter)
  }, [gymId, monthFilter, loadExpenses])

  useLiveRefresh(
    () => { if (gymId) void loadExpenses(gymId, monthFilter, true) },
    { gymId, tables: ['expenses'], enabled: !formOpen && !deleteTarget }
  )

  // Filter dropdown: categories present in the loaded data
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    expenses.forEach(e => set.add(e.category))
    return Array.from(set).sort()
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses.filter(expense => {
      if (categoryFilter !== 'all' && expense.category !== categoryFilter) return false
      if (!q) return true
      return (
        expense.category.toLowerCase().includes(q) ||
        (expense.note || '').toLowerCase().includes(q)
      )
    })
  }, [expenses, search, categoryFilter])

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [filteredExpenses]
  )

  const breakdown = useMemo(() => {
    const map = new Map<string, number>()
    filteredExpenses.forEach(e => {
      map.set(e.category, (map.get(e.category) || 0) + Number(e.amount))
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [filteredExpenses])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(expense: Expense) {
    const isPreset = PRESET_CATEGORIES.includes(expense.category) && expense.category !== 'Other'
    setEditing(expense)
    setForm({
      category: isPreset ? expense.category : 'Other',
      customCategory: isPreset ? '' : expense.category,
      amount: String(Number(expense.amount)),
      spentOn: expense.spent_on.slice(0, 10),
      note: expense.note || ''
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

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!gymId) return

    const category = form.category === 'Other' ? form.customCategory.trim() : form.category
    if (!category) {
      setFormError('Category is required.')
      return
    }
    if (!form.spentOn) {
      setFormError('Date is required.')
      return
    }
    const amount = Number(form.amount)
    if (form.amount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
      setFormError('The amount must be a valid number greater than 0.')
      return
    }
    if (amount >= MAX_AMOUNT) {
      setFormError('The amount is too large.')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      if (editing) {
        // .select('id') returns changed rows, so an update blocked by RLS is detected
        const { data, error: updateError } = await supabase
          .from('expenses')
          .update({
            category,
            amount,
            spent_on: form.spentOn,
            note: form.note.trim() || null
          })
          .eq('id', editing.id)
          .eq('gym_id', gymId)
          .select('id')

        if (updateError) throw updateError
        if (!data || data.length === 0) {
          setFormError('The change was not saved: you do not have permission to edit this expense.')
          return
        }
      } else {
        const { error: insertError } = await supabase.from('expenses').insert({
          gym_id: gymId,
          category,
          amount,
          spent_on: form.spentOn,
          note: form.note.trim() || null,
          recorded_by: userId
        })

        if (insertError) throw insertError
      }

      setFormOpen(false)
      setEditing(null)
      await loadExpenses(gymId, monthFilter)
    } catch (err) {
      console.error('Error saving expense:', err)
      setFormError('The expense could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!gymId || !deleteTarget) return
    setDeleting(true)
    setError(null)

    const { data, error: deleteError } = await supabase
            .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .select('id')

    if (deleteError) {
      console.error('Error deleting expense:', deleteError)
      setError('The expense could not be deleted. Please try again.')
    } else if (!data || data.length === 0) {
      // No error but nothing deleted = blocked by RLS (or already gone)
      setError('The expense was not deleted: only the owner or a manager may delete expenses.')
    } else {
      setExpenses(prev => prev.filter(x => x.id !== deleteTarget.id))
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
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
        <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
        <Button onClick={openAdd} disabled={!gymId}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-red-600" />
              All Expenses ({filteredExpenses.length})
            </CardTitle>
            <p className="text-sm text-gray-600">
              Total:{' '}
              <span className="font-semibold text-red-600">{fmt(filteredTotal)}</span>
            </p>
          </div>

          {breakdown.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {breakdown.map(([category, total]) => (
                <span
                  key={category}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                >
                  {category}: <span className="font-semibold">{fmt(total)}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by category or note"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className={`${inputClass} lg:w-48`}
            >
              <option value="all">All categories</option>
              {categoryOptions.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex gap-2 lg:w-60">
              <input
                type="month"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                className={inputClass}
                aria-label="Month filter"
              />
              {monthFilter && (
                <button
                  type="button"
                  onClick={() => setMonthFilter('')}
                  className="rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
                >
                  All
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <p className="text-center text-gray-500 py-8">Loading...</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {expenses.length === 0
                ? monthFilter
                  ? 'No expenses in this month. Use "Add Expense" to add one.'
                  : 'There are no expenses yet. Add your first expense using "Add Expense."'
                : 'No expenses match your search or filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Category</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Note</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(expense => (
                    <tr key={expense.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-700">{formatDate(expense.spent_on)}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">{expense.category}</td>
                      <td className="px-3 py-3 font-semibold text-red-600">
                        {fmt(Number(expense.amount))}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{expense.note || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(expense)}
                            title="Edit"
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(expense)}
                            title="Delete"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {truncated && (
            <p className="mt-4 text-center text-xs text-gray-500">
              Very large list: only the newest {PAGE * MAX_PAGES} expenses are loaded. Pick a
              month to see exact totals.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit Expense' : 'Add Expense'}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={inputClass}
                >
                  {PRESET_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {form.category === 'Other' && (
                  <input
                    type="text"
                    value={form.customCategory}
                    onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                    className={`${inputClass} mt-2`}
                    placeholder="Enter the category name"
                  />
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
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className={inputClass}
                    placeholder="10000"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                  <input
                    type="date"
                    value={form.spentOn}
                    onChange={e => setForm(f => ({ ...f, spentOn: e.target.value }))}
                    className={inputClass}
                  />
                </div>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Expense'}
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
              <h2 className="text-lg font-bold text-gray-900">Delete this expense?</h2>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{deleteTarget.category}</span> (
              {fmt(Number(deleteTarget.amount))}, {formatDate(deleteTarget.spent_on)})
              will be deleted and the dashboard and report expenses will go down. This cannot be
              undone.
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