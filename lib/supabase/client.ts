import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// `next build` prerenders pages on the server, and env vars may not be set on
// that machine. Only during that phase a harmless placeholder is allowed.
// Everywhere else a missing variable is a deployment mistake: fail loudly
// instead of silently talking to a fake server.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

if ((!supabaseUrl || !supabaseAnonKey) && !isBuildPhase) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set both in .env.local (development) or in the hosting dashboard (production).'
  )
}

// Client-side Supabase client
export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)