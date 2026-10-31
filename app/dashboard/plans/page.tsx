'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Plus, Pencil, Trash2, Power, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { logAudit } from '@/lib/audit'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCurrency } from '@/lib/user-context'

interface Plan {
  id: string
  name: string
  duration_months: number
  price: number
  is_active: boolean
}

interface FormState {
  duration: string
  price: string
}

// 6 months ("Half Yearly") is created for every new gym by the signup trigger,
// so it must be selectable here, otherwise that plan could not be edited.
const durationOptions = [
  { months: 1, label: 'Monthly' },
  { months: 3, label: 'Quarterly' },
  { months: 6, label: 'Half Yearly' },
  { months: 12, label: 'Yearly' }
]

const MAX_PRICE = 100_000_000

function planLabel(months: number) {
  return durationOptions.find(o => o.months === months)?.label || `${months} months`
}

function duplicateMessage(months: number, isActive: boolean) {
  return `A ${planLabel(months)} plan already exists${
    isActive ? '' : ' (Inactive)'
  }. Edit it or set it to Active.`
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

export default function PlansPage() {
  const { currency, fmt } = useCurrency()
  const [gymId, setGymId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [form, setForm] = useState<FormState>({ duration: '1', price: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  // Blocks a second submit (double click / Enter) before React re-renders `saving`
  const savingRef = useRef(false)

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
        .select('gym_id')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }

      const currentGymId = userData.gym_id as string
      setGymId(currentGymId)

      const { data, error: plansError } = await supabase
        .from('plans')
        .select('id, name, duration_months, price, is_active')
        .eq('gym_id', currentGymId)
        .order('duration_months', { ascending: true })

      if (plansError) throw plansError
      setPlans((data as Plan[]) || [])
    } catch (err) {
      console.error('Error loading plans:', err)
      setError('Plans could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quiet refresh: plans changed on the desktop (sync) or by another user
  const refreshPlans = useCallback(async () => {
    if (!gymId) return
    try {
      const { data, error: plansError } = await supabase
        .from('plans')
        .select('id, name, duration_months, price, is_active')
        .eq('gym_id', gymId)
        .order('duration_months', { ascending: true })
      if (plansError) throw plansError
      setPlans(prev => keepIfSame(prev, (data as Plan[]) || []))
    } catch (err) {
      console.error('Error refreshing plans:', err)
    }
  }, [gymId])

  useLiveRefresh(() => { void refreshPlans() }, {
    gymId,
    tables: ['plans'],
    enabled: !formOpen && !deleteTarget
  })

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.duration_months - b.duration_months),
    [plans]
  )
  const activePlans = useMemo(() => sortedPlans.filter(p => p.is_active), [sortedPlans])
  const inactiveCount = sortedPlans.length - activePlans.length
  const visiblePlans = showInactive ? sortedPlans : activePlans
  // Duplicates that already exist in the database (e.g. created by sync): flag them so they can be removed
  const duplicateLabels = useMemo(() => {
    const counts = new Map<number, number>()
    activePlans.forEach(p => counts.set(p.duration_months, (counts.get(p.duration_months) || 0) + 1))
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([months, count]) => `${planLabel(months)} (${count})`)
  }, [activePlans])

  function openAdd() {
    // Start on the first duration that has no plan yet
    const free = durationOptions.find(o => !plans.some(p => p.duration_months === o.months))
    setEditing(null)
    setForm({ duration: String(free ? free.months : 1), price: '' })
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setForm({ duration: String(plan.duration_months), price: String(Number(plan.price)) })
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
    if (!gymId || !userId || savingRef.current) return

    const months = Number(form.duration)
    const price = Number(form.price)

    if (!durationOptions.some(o => o.months === months)) {
      setFormError('Please select a duration.')
      return
    }
    if (form.price.trim() === '' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
      setFormError('Price must be a valid number.')
      return
    }

    // One plan per duration (the members screens label plans by duration only)
    const sameDuration = plans.find(p => p.duration_months === months && p.id !== editing?.id)
    if (sameDuration) {
      setFormError(duplicateMessage(months, sameDuration.is_active))
      if (!sameDuration.is_active) setShowInactive(true)
      return
    }

    savingRef.current = true
    setSaving(true)
    setFormError(null)

    try {
      // The list on screen can be stale (sync / another user), so check the database itself too
      const { data: existing, error: existingError } = await supabase
        .from('plans')
        .select('id, is_active')
        .eq('gym_id', gymId)
        .eq('duration_months', months)
      if (existingError) throw existingError
      const clash = ((existing as { id: string; is_active: boolean }[] | null) || []).find(
        p => p.id !== editing?.id
      )
      if (clash) {
        setFormError(duplicateMessage(months, clash.is_active))
        if (!clash.is_active) setShowInactive(true)
        await refreshPlans()
        return
      }

      const payload = {
        name: planLabel(months),
        duration_months: months,
        price
      }

      if (editing) {
        const { data, error: updateError } = await supabase
          .from('plans')
          .update(payload)
          .eq('id', editing.id)
          .eq('gym_id', gymId)
          .select('id')
        if (updateError) throw updateError
        if (!data || data.length === 0) {
          setFormError('The change was not saved. Only the owner or a manager can change plans.')
          return
        }
        void logAudit(gymId, userId, 'plan_updated', {
          plan_id: editing.id,
          old_price: Number(editing.price),
          new_price: price,
          duration_months: months
        })
      } else {
        const { data, error: insertError } = await supabase
          .from('plans')
          .insert({ ...payload, gym_id: gymId, is_active: true })
          .select('id')
        if (insertError) throw insertError
        void logAudit(gymId, userId, 'plan_created', {
          plan_id: data?.[0]?.id,
          duration_months: months,
          price
        })
      }

      setFormOpen(false)
      setEditing(null)
      await loadData()
    } catch (err) {
      console.error('Error saving plan:', err)
      setFormError('The plan could not be saved. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleToggleActive(plan: Plan) {
    if (!gymId || !userId) return
    setTogglingId(plan.id)
    setError(null)
    setNotice(null)

    if (!plan.is_active) {
      // Activating must not leave two active plans for the same duration
      const { data: dupes, error: dupError } = await supabase
        .from('plans')
        .select('id')
        .eq('gym_id', gymId)
        .eq('duration_months', plan.duration_months)
        .eq('is_active', true)
        .neq('id', plan.id)
      if (dupError) {
        console.error('Error checking plans:', dupError)
        setError('The status could not be changed. Please try again.')
        setTogglingId(null)
        return
      }
      if (dupes && dupes.length > 0) {
        setError(
          `An active ${planLabel(plan.duration_months)} plan already exists. Set it to Inactive first.`
        )
        setTogglingId(null)
        return
      }
    }

    const { data: toggleData, error: toggleError } = await supabase
      .from('plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id)
      .eq('gym_id', gymId)
      .select('id')

    if (toggleError) {
      console.error('Error toggling plan:', toggleError)
      setError('The status could not be changed. Please try again.')
    } else if (!toggleData || toggleData.length === 0) {
      setError('The status was not changed. Only the owner or a manager can change plans.')
    } else {
      setPlans(prev => prev.map(p => (p.id === plan.id ? { ...p, is_active: !p.is_active } : p)))
      void logAudit(gymId, userId, plan.is_active ? 'plan_deactivated' : 'plan_activated', {
        plan_id: plan.id,
        duration_months: plan.duration_months
      })
    }
    setTogglingId(null)
  }

  async function handleDelete() {
    if (!gymId || !userId || !deleteTarget) return
    setDeleting(true)
    setError(null)
    setNotice(null)

    // Plans are never hard-deleted (the desktop would never learn about it): remove = Inactive
    const { data, error: deleteError } = await supabase
      .from('plans')
      .update({ is_active: false })
      .eq('id', deleteTarget.id)
      .eq('gym_id', gymId)
      .select('id')

    if (deleteError) {
      console.error('Error removing plan:', deleteError)
      setError('The plan could not be removed. Please try again.')
    } else if (!data || data.length === 0) {
      setError('The plan was not removed. Only the owner or a manager can change plans.')
    } else {
      setPlans(prev => prev.map(p => (p.id === deleteTarget.id ? { ...p, is_active: false } : p)))
      void logAudit(gymId, userId, 'plan_deactivated', {
        plan_id: deleteTarget.id,
        duration_months: deleteTarget.duration_months,
        price: Number(deleteTarget.price)
      })
      setNotice(
        `${planLabel(deleteTarget.duration_months)} plan removed. It is now hidden from the list; use "Show inactive" to see it.`
      )
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Plans</h1>
        <Card className="border-0 shadow-lg animate-pulse">
          <CardHeader>
            <div className="h-5 bg-gray-200 rounded w-40"></div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map(i => (
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
        <h1 className="text-3xl font-bold text-gray-900">Plans</h1>
        <Button onClick={openAdd} disabled={!gymId}>
          <Plus className="w-4 h-4 mr-2" />
          Add Plan
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

      {duplicateLabels.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Duplicate active plans found: {duplicateLabels.join(', ')}. Remove the extra plan.
          </span>
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              All Plans ({visiblePlans.length})
            </CardTitle>
            {inactiveCount > 0 && (
              <button
                type="button"
                onClick={() => setShowInactive(v => !v)}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-blue-600"
              >
                {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visiblePlans.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {sortedPlans.length > 0
                ? 'No active plans. Click "Show inactive" to see older plans.'
                : <>No plans yet. Create your first plan with &quot;Add Plan&quot;.</>}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Duration</th>
                    <th className="px-3 py-3 font-medium">Price</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlans.map(plan => (
                    <tr
                      key={plan.id}
                      className={`border-b border-gray-100 hover:bg-gray-50${plan.is_active ? '' : ' opacity-60'}`}
                    >
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {planLabel(plan.duration_months)}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {plan.duration_months} month{plan.duration_months === 1 ? '' : 's'}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {fmt(Number(plan.price))}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            plan.is_active
                              ? 'bg-green-50 text-green-700 border-green-100'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleActive(plan)}
                            disabled={togglingId === plan.id}
                            title={plan.is_active ? 'Set to Inactive' : 'Set to Active'}
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(plan)}
                            title="Edit"
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-blue-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {plan.is_active && (
                            <button
                              onClick={() => setDeleteTarget(plan)}
                              title="Remove"
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                {editing ? 'Edit Plan' : 'Add Plan'}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Duration *</label>
                <select
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                  className={inputClass}
                >
                  {durationOptions.map(o => (
                    <option key={o.months} value={o.months}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Price ({currency}) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className={inputClass}
                  placeholder="3000"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Changing the price does not affect payments already made by existing members.
                </p>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Plan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove (= Inactive) confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">Remove plan?</h2>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{planLabel(deleteTarget.duration_months)}</span> plan
              ({fmt(Number(deleteTarget.price))}) will be set to Inactive. It will no longer be shown
              for new members, and past history stays safe. You can set it back to Active later.
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
        </div>
      )}
    </div>
  )
}