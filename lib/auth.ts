import { supabase } from './supabase/client'
import { User, UserRole, GymStatus } from '@/types/database'

import { MIN_PASSWORD_LENGTH, validatePassword } from './password'
export { MIN_PASSWORD_LENGTH, validatePassword }

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) return null

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (error) {
      console.error('Error fetching user profile:', error)
      return null
    }

    return user
  } catch (error) {
    console.error('Error in getCurrentUser:', error)
    return null
  }
}

export async function checkGymStatus(gymId: string): Promise<GymStatus> {
  try {
    const { data, error } = await supabase
      .from('gyms')
      .select('status')
      .eq('id', gymId)
      .single()

    if (error || !data) return 'inactive'

    return data.status as GymStatus
  } catch (error) {
    console.error('Error checking gym status:', error)
    return 'inactive'
  }
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    'super_admin': 4,
    'gym_owner': 3,
    'manager': 2,
    'receptionist': 1
  }

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      throw new Error('Email abhi confirm nahi hui. Apni inbox mein confirmation link kholein.')
    }
    throw error
  }

  let mustChangePassword = false

  if (data.user) {
    const user = await getCurrentUser()

    // Missing profile or deactivated user: fail closed
    if (!user || user.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('Your account is disabled. Please contact your gym owner or the platform administrator.')
    }

    mustChangePassword = user.must_change_password === true

    // Gym status (pending / suspended / inactive) is handled by proxy.ts,
    // which sends the user to /pending or /suspended after login.
  }

  // Extra field: the login page can send these users to the password-change screen
  return { ...data, mustChangePassword }
}

// Gym, user profile aur default plans database trigger (handle_new_user) khud banata hai.
export async function signUp(email: string, password: string, fullName: string, gymName: string) {
  const passwordError = validatePassword(password)
  if (passwordError) throw new Error(passwordError)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, gym_name: gymName },
      // Confirmation link lands on the login page of THIS site (add it in Supabase > URL Configuration > Redirect URLs)
      emailRedirectTo: `${window.location.origin}/auth/login`,
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Failed to create user account')

  // With email confirmation ON, Supabase does not return an error for an email that is
  // already registered: it returns a user with no identities and sends nothing.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Yeh email pehle se registered hai. Login karein ya password reset karein.')
  }

  // No session = the user must confirm the email first; the page should say so
  // instead of "Redirecting to dashboard".
  return { ...data, needsEmailConfirmation: !data.session }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  // Session already gone (expired / other tab): treat as signed out, do not block the redirect
  if (error && error.name !== 'AuthSessionMissingError') throw error
}

export async function resetPassword(email: string) {
  // This URL must be listed in Supabase: Authentication > URL Configuration > Redirect URLs
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const passwordError = validatePassword(newPassword)
  if (passwordError) throw new Error(passwordError)

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  })
  if (error) throw error

  // A staff member who got a temporary password is no longer "must change" once they set their own.
  // Filter on true so normal password changes do not touch the row.
  if (data.user?.id) {
    // SECURITY DEFINER function from Phase 1: clears the flag for auth.uid() only.
    const { error: flagError } = await supabase.rpc('clear_must_change_password')
    if (flagError) {
      throw new Error('Password changed, but the account could not be updated. Please try again.')
    }
  }
}