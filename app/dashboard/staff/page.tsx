'use client'

import { FormEvent, memo, useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, KeyRound, Loader2, Plus, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/lib/password'
import { useUser } from '@/lib/user-context'

interface StaffRow {
  id: string
  email: string
  full_name: string | null
  role: 'gym_owner' | 'manager' | 'receptionist'
  is_active: boolean
  must_change_password: boolean
}

const ROLE_LABEL: Record<string, string> = { gym_owner: 'Owner', manager: 'Manager', receptionist: 'Receptionist' }

async function api(method: string, body?: unknown) {
  const res = await fetch('/api/staff', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}

// Memoized row: typing in the "Add staff" form no longer re-renders every row.
const StaffTableRow = memo(function StaffTableRow({
  r,
  locked,
  busy,
  onAct,
  onReset,
}: {
  r: StaffRow
  locked: boolean
  busy: boolean
  onAct: (id: string, body: Record<string, unknown>) => void
  onReset: (r: StaffRow) => void
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="p-3 font-medium">{r.full_name || '-'}</td>
      <td className="p-3 text-gray-600">{r.email}</td>
      <td className="p-3">
        {locked ? ROLE_LABEL[r.role] : (
          <select
            value={r.role}
            disabled={busy}
            onChange={e => onAct(r.id, { action: 'role', role: e.target.value })}
            className="rounded-md border border-gray-200 bg-white px-2 py-1"
          >
            <option value="receptionist">Receptionist</option>
            <option value="manager">Manager</option>
          </select>
        )}
      </td>
      <td className="p-3">
        <span className={r.is_active ? 'text-emerald-700' : 'text-red-600'}>{r.is_active ? 'Active' : 'Disabled'}</span>
        {r.must_change_password && <span className="ml-2 text-xs text-amber-600">temp password</span>}
      </td>
      <td className="p-3 text-right">
        {!locked && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReset(r)}>
              <KeyRound className="mr-1 h-3.5 w-3.5" />Reset password
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              className={r.is_active ? 'text-red-600' : 'text-emerald-700'}
              onClick={() => onAct(r.id, { action: r.is_active ? 'deactivate' : 'activate' })}
            >
              {r.is_active ? <UserX className="mr-1 h-3.5 w-3.5" /> : <UserCheck className="mr-1 h-3.5 w-3.5" />}
              {r.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
})

export default function StaffPage() {
  const { user } = useUser()
  const [rows, setRows] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'receptionist', password: '' })
  const [saving, setSaving] = useState(false)
  const fetched = useRef(false)

  const load = useCallback(async () => {
    try {
      const j = await api('GET')
      setRows(j.staff)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const role = user?.role

  useEffect(() => {
    // Don't fire the request for users who will see nothing (non-owners).
    if (role && role !== 'gym_owner') return
    if (fetched.current) return
    fetched.current = true
     
    void load()
  }, [role, load])

  // Optimistic update: UI changes instantly, no refetch after success.
  // If the request fails, we resync from the server and show the error.
  const act = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    setError('')
    setRows(rs => rs.map(r => {
      if (r.id !== id) return r
      if (body.action === 'role') return { ...r, role: body.role as StaffRow['role'] }
      if (body.action === 'deactivate') return { ...r, is_active: false }
      if (body.action === 'activate') return { ...r, is_active: true }
      if (body.action === 'reset_password') return { ...r, must_change_password: true }
      return r
    }))
    try {
      await api('PATCH', { id, ...body })
    } catch (e) {
      const msg = (e as Error).message
      await load()
      setError(msg)
    } finally {
      setBusy(null)
    }
  }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const pw = validatePassword(form.password)
    if (pw) return setError(pw)
    setSaving(true)
    try {
      const json = await api('POST', form)
      // Same normalization the server applies (trim + lowercase email).
      const newRow: StaffRow = {
        id: json.id,
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        role: form.role as StaffRow['role'],
        is_active: true,
        must_change_password: true,
      }
      setRows(rs => [...rs, newRow])
      setForm({ full_name: '', email: '', role: 'receptionist', password: '' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const resetPw = useCallback((r: StaffRow) => {
    const p = window.prompt(`New temporary password for ${r.email} (min ${MIN_PASSWORD_LENGTH} characters).\nThey must change it at next login.`)
    if (p) void act(r.id, { action: 'reset_password', password: p })
  }, [act])

  if (user && user.role !== 'gym_owner') return null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Add staff member</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required disabled={saving} />
            <Input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required disabled={saving} autoComplete="off" />
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              disabled={saving}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="receptionist">Receptionist</option>
              <option value="manager">Manager</option>
            </select>
            <Input type="password" placeholder={`Temp password (${MIN_PASSWORD_LENGTH}+)`} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={MIN_PASSWORD_LENGTH} disabled={saving} autoComplete="new-password" />
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </form>
          <p className="mt-2 text-xs text-gray-500">The same email + password works on the web and the desktop app. The user must change the temporary password at first sign-in.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="p-6 text-center text-gray-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <StaffTableRow
                    key={r.id}
                    r={r}
                    locked={r.role === 'gym_owner' || r.id === user?.id}
                    busy={busy === r.id}
                    onAct={act}
                    onReset={resetPw}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}