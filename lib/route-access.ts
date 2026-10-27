// Role -> which /dashboard pages may be opened.
// Used by proxy.ts (server) and app/dashboard/layout.tsx (client).
// This is only the UI/route layer: RLS in the database stays the real security.

const OWNER_ONLY = ['/dashboard/settings', '/dashboard/staff']
const MANAGER_UP = ['/dashboard/plans', '/dashboard/expenses', '/dashboard/reports']

function hit(list: string[], path: string) {
  return list.some(base => path === base || path.startsWith(base + '/'))
}

export function isRouteAllowed(role: string | null | undefined, path: string): boolean {
  if (role === 'super_admin') return true
  if (hit(OWNER_ONLY, path)) return role === 'gym_owner'
  if (hit(MANAGER_UP, path)) return role === 'gym_owner' || role === 'manager'
  return true
}