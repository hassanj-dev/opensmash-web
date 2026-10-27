import { createBrowserClient } from '@supabase/ssr'

// Get environment variables with defaults for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Client-side Supabase client
export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
)
