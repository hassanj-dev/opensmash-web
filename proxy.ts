import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gymGate } from '@/lib/gym-access'
import { isRouteAllowed } from '@/lib/route-access'

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Redirect while keeping any cookies Supabase just set (refresh / sign-out)
  const redirectTo = (target: string) => {
    const r = NextResponse.redirect(new URL(target, req.url))
    res.cookies.getAll().forEach(c => r.cookies.set(c))
    return r
  }

  // getUser() server par verify karta hai (getSession() se zyada safe)
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname

  // Public routes (login na ho tab bhi khuli)
  const publicRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password']
  const isPublicRoute = publicRoutes.some(route => path.startsWith(route))

  // Reset-password par logged-in user ko rokna nahi (recovery link session banata hai,
  // aur must_change_password wale staff ko yahin password badalna hai)
  const isResetRoute = path.startsWith('/auth/reset-password')

  // Login nahi aur protected page => login par bhejo
  if (!authUser && !isPublicRoute) return redirectTo('/auth/login')

  // Login hai aur auth page khola => dashboard (reset-password ko chhor kar)
  if (authUser && isPublicRoute && !isResetRoute) return redirectTo('/dashboard')

  // Logged-in user, protected page: is_active, role, must_change_password aur gym status check (ek hi query).
  // Runs for EVERY request (no prefetch bypass), so a disabled user can never slip through.
  if (authUser && !isPublicRoute) {
    const { data: profile } = await supabase
      .from('users')
      .select('role, gym_id, is_active, must_change_password, gyms(status, expires_at)')
      .eq('id', authUser.id)
      .single()

    // No profile, or the account was switched off: end the session.
    // (Must sign out, otherwise /auth/login would bounce them back to /dashboard.)
    if (!profile || profile.is_active === false) {
      await supabase.auth.signOut({ scope: 'local' })
      return redirectTo('/auth/login?error=account_disabled')
    }

    // Staff with a temporary password must set their own before using the app.
    // /auth/reset-password is a public route, so this cannot loop.
    if (profile.must_change_password === true) {
      return redirectTo('/auth/reset-password')
    }

    const role = profile.role

    // Super admin has no gym: the gym dashboard is not for them, /admin is home (W3)
    if (role === 'super_admin' && path.startsWith('/dashboard')) {
      return redirectTo('/admin')
    }

    // Admin panel sirf super_admin ke liye
    if (path.startsWith('/admin') && role !== 'super_admin') {
      return redirectTo('/dashboard')
    }

    // Gym gate (super_admin bypass). Only an active, non-expired gym gets through.
    if (role !== 'super_admin') {
      type GymRel = { status: string; expires_at: string | null }
      const gymRel = profile.gyms as unknown as GymRel | GymRel[] | null
      const gym = Array.isArray(gymRel) ? gymRel[0] : gymRel

      const gate = profile.gym_id ? gymGate(gym?.status, gym?.expires_at) : '/suspended'

      if (gate && !path.startsWith(gate)) return redirectTo(gate)

      // Active gym that wanders onto a status page goes back to the app
      if (!gate && ['/pending', '/suspended', '/expired'].some(p => path.startsWith(p))) {
        return redirectTo('/dashboard')
      }
    }

    // Role guard: receptionist cannot open reports/plans/expenses/settings by URL,
    // manager cannot open settings (see lib/route-access.ts). RLS still protects the data.
    if (!isRouteAllowed(role, path)) return redirectTo('/dashboard')
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}