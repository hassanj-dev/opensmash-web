'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
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

export default function StaffPage() {
  const { user } = useUser()
  const [rows, setRows] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'receptionist', password: '' })
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    setError('')
    try {
      await api('PATCH', { id, ...body })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const pw = validatePassword(form.password)
    if (pw) return setError(pw)
    setSaving(true)
    try {
      await api('POST', form)
      setForm({ full_name: '', email: '', role: 'receptionist', password: '' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const resetPw = (r: StaffRow) => {
    const p = window.prompt(`New temporary password for ${r.email} (min ${MIN_PASSWORD_LENGTH} characters).\nThey must change it at next login.`)
    if (p) void act(r.id, { action: 'reset_password', password: p })
  }

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
                {rows.map(r => {
                  const locked = r.role === 'gym_owner' || r.id === user?.id
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{r.full_name || '-'}</td>
                      <td className="p-3 text-gray-600">{r.email}</td>
                      <td className="p-3">
                        {locked ? ROLE_LABEL[r.role] : (
                          <select
                            value={r.role}
                            disabled={busy === r.id}
                            onChange={e => void act(r.id, { action: 'role', role: e.target.value })}
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
                            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => resetPw(r)}>
                              <KeyRound className="mr-1 h-3.5 w-3.5" />Reset password
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === r.id}
                              className={r.is_active ? 'text-red-600' : 'text-emerald-700'}
                              onClick={() => void act(r.id, { action: r.is_active ? 'deactivate' : 'activate' })}
                            >
                              {r.is_active ? <UserX className="mr-1 h-3.5 w-3.5" /> : <UserCheck className="mr-1 h-3.5 w-3.5" />}
                              {r.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}