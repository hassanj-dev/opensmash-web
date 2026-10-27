// ONE password rule for web, API and desktop (desktop uses the same numbers).
// Also set Supabase: Authentication > Providers > Email > Minimum password length = 8
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72 // bcrypt limit

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
  if (password.length > MAX_PASSWORD_LENGTH)
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`
  return null
}