import { supabase } from '@/lib/supabase/client'

// Best-effort audit trail from the web app. Never blocks or breaks the page:
// if the insert fails (RLS, network) it only logs a warning.
// RLS (audit_insert) requires user_id = auth.uid() and gym_id = own gym.
export async function logAudit(
  gymId: string,
  userId: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      gym_id: gymId,
      user_id: userId,
      action,
      details: details ?? null
    })
    if (error) console.warn('audit_log insert failed:', error.message)
  } catch (err) {
    console.warn('audit_log insert error:', err)
  }
}