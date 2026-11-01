import { NextResponse, after } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gymGate } from '@/lib/gym-access'
import { validatePassword } from '@/lib/password'

export const runtime = 'nodejs'

const STAFF_ROLES = ['manager', 'receptionist'] as const
type StaffRole = (typeof STAFF_ROLES)[number]
const BAN_FOREVER = '876000h' // ~100 years: refresh tokens stop working, desktop gets blocked too
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

// Caller must be an ACTIVE gym_owner of an ACTIVE gym. Everything comes from the DB, never from the request body.
async function requireOwner() {
  const sb = await createServerSupabaseClient()
  // getClaims() verifies the JWT locally when the project uses asymmetric signing keys (no Auth-server round trip).
  // Otherwise supabase-js falls back to asking the Auth server. is_active is still checked in the DB below.
  const { data: claimsData } = await sb.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { error: fail('Not signed in.', 401) }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('users')
    .select('id, role, gym_id, is_active, gyms(status, expires_at)')
    .eq('id', userId)
    .single()

  if (!me || me.is_active === false) return { error: fail('Account disabled.', 403) }
  if (me.role !== 'gym_owner' || !me.gym_id) return { error: fail('Only the gym owner can manage staff.', 403) }

  const g = me.gyms as unknown as { status: string; expires_at: string | null } | { status: string; expires_at: string | null }[] | null
  const gym = Array.isArray(g) ? g[0] : g
  if (gymGate(gym?.status, gym?.expires_at)) return { error: fail('Your gym is not active.', 403) }

  return { admin, ownerId: me.id as string, gymId: me.gym_id as string }
}

async function audit(admin: ReturnType<typeof createAdminClient>, gymId: string, userId: string, action: string, details: Record<string, unknown>) {
  const { error } = await admin.from('audit_log').insert({ gym_id: gymId, user_id: userId, action, details })
  if (error) console.warn('audit_log insert failed:', error.message)
}

// GET: staff of the owner's gym
export async function GET() {
  const ctx = await requireOwner()
  if ('error' in ctx) return ctx.error
  const { data, error } = await ctx.admin
    .from('users')
    .select('id, email, full_name, role, is_active, must_change_password, created_at')
    .eq('gym_id', ctx.gymId)
    .order('created_at', { ascending: true })
  if (error) return fail('Could not load staff.', 500)
  return NextResponse.json({ staff: data, me: ctx.ownerId })
}

// POST: create { email, full_name, role, password }
export async function POST(req: Request) {
  const ctx = await requireOwner()
  if ('error' in ctx) return ctx.error
  const body = await req.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  const fullName = String(body?.full_name ?? '').trim()
  const role = body?.role as StaffRole
  const password = String(body?.password ?? '')

  if (!EMAIL_RE.test(email)) return fail('Enter a valid email.')
  if (!fullName) return fail('Full name is required.')
  if (!STAFF_ROLES.includes(role)) return fail('Role must be manager or receptionist.')
  const pwErr = validatePassword(password)
  if (pwErr) return fail(pwErr)

  const { admin, gymId, ownerId } = ctx
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // owner vouches for this address; no mail needed
    user_metadata: { full_name: fullName },
    app_metadata: { gym_id: gymId, role, must_change_password: true },
  })
  if (cErr || !created.user) {
    const dup = /already|registered|exists/i.test(cErr?.message ?? '')
    return fail(dup ? 'That email is already registered.' : 'Could not create the account.', dup ? 409 : 500)
  }

  // Profile row. Upsert, because handle_new_user may (or may not) have inserted one. See sql/phase2a.sql.
  const { error: pErr } = await admin.from('users').upsert(
    { id: created.user.id, gym_id: gymId, email, full_name: fullName, role, is_active: true, must_change_password: true },
    { onConflict: 'id' }
  )
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id) // no half-created accounts
    return fail('Could not create the profile.', 500)
  }

  // Audit runs after the response is sent, so the user doesn't wait for it.
  const newId = created.user.id
  after(() => audit(admin, gymId, ownerId, 'staff_created', { target: newId, email, role }))
  return NextResponse.json({ id: newId }, { status: 201 })
}

// PATCH: { id, action: 'role' | 'deactivate' | 'activate' | 'reset_password', role?, password? }
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '')
  const action = String(body?.action ?? '')

  // Owner check and target lookup are independent, so run them together.
  const [ctx, { data: target }] = await Promise.all([
    requireOwner(),
    createAdminClient().from('users').select('id, role, gym_id, email').eq('id', id).maybeSingle(),
  ])
  if ('error' in ctx) return ctx.error
  const { admin, gymId, ownerId } = ctx

  if (!target || target.gym_id !== gymId) return fail('Staff member not found.', 404) // other gyms look like "not found"
  if (target.role === 'gym_owner' || target.role === 'super_admin') return fail('Owner accounts cannot be changed here.', 403)
  if (id === ownerId) return fail('You cannot change your own account here.', 403)

  if (action === 'role') {
    const role = body?.role as StaffRole
    if (!STAFF_ROLES.includes(role)) return fail('Role must be manager or receptionist.')
    const { error } = await admin.from('users').update({ role }).eq('id', id)
    if (error) return fail('Could not change the role.', 500)
    await admin.auth.admin.updateUserById(id, { app_metadata: { role } })
    after(() => audit(admin, gymId, ownerId, 'staff_role_changed', { target: id, role }))
    return NextResponse.json({ ok: true })
  }

  if (action === 'deactivate' || action === 'activate') {
    const on = action === 'activate'
    const { error } = await admin.from('users').update({ is_active: on }).eq('id', id)
    if (error) return fail('Could not update the account.', 500)
    // Ban at the Auth level too: blocks new logins AND token refresh (this is what stops the desktop).
    const { error: bErr } = await admin.auth.admin.updateUserById(id, { ban_duration: on ? 'none' : BAN_FOREVER })
    if (bErr) return fail('Profile updated, but the sign-in block failed. Try again.', 500)
    after(() => audit(admin, gymId, ownerId, on ? 'staff_activated' : 'staff_deactivated', { target: id }))
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_password') {
    const password = String(body?.password ?? '')
    const pwErr = validatePassword(password)
    if (pwErr) return fail(pwErr)
    const { error } = await admin.auth.admin.updateUserById(id, {
      password,
      app_metadata: { must_change_password: true },
    })
    if (error) return fail('Could not reset the password.', 500)
    await admin.from('users').update({ must_change_password: true }).eq('id', id)
    after(() => audit(admin, gymId, ownerId, 'staff_password_reset', { target: id }))
    return NextResponse.json({ ok: true })
  }

  return fail('Unknown action.')
}