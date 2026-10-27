import type { GymStatus } from '@/types/database'

export type GymGatePath = '/pending' | '/suspended' | '/expired'

/**
 * Returns the page a gym must be sent to, or null if access is allowed.
 * Fails closed: missing or unknown status is blocked.
 * expiresAt NULL/undefined/'' = no expiry.
 */
export function gymGate(
  status: GymStatus | string | null | undefined,
  expiresAt?: string | null,
  now: Date = new Date()
): GymGatePath | null {
  switch (status) {
    case 'active':
      break
    case 'pending':
      return '/pending'
    case 'suspended':
    case 'inactive':
      return '/suspended'
    default:
      // null (no gym) or unknown status
      return '/suspended'
  }

  if (expiresAt) {
    const t = new Date(expiresAt).getTime()
    // Unparseable date: fail closed
    if (Number.isNaN(t) || t <= now.getTime()) return '/expired'
  }

  return null
}
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reads ONLY the caller's own gym row and returns the gate path.
 * null = allowed, undefined = could not check (network/RLS error: keep current state).
 */
export async function fetchGymGate(
  client: SupabaseClient,
  gymId: string
): Promise<GymGatePath | null | undefined> {
  const { data, error } = await client
    .from('gyms')
    .select('status, expires_at')
    .eq('id', gymId)
    .maybeSingle()

  if (error) return undefined
  if (!data) return '/suspended' // row missing: fail closed
  return gymGate(data.status, data.expires_at)
}