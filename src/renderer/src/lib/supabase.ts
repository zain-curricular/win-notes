import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Null when the app was built without Supabase settings; the app then runs in local-only mode. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE: a confirmation link only works on the device that signed up (see lib/authLink.ts).
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 20 } }
      })
    : null
