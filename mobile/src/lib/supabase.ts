import 'react-native-url-polyfill/auto'
import Constants from 'expo-constants'
import { getRandomValues } from 'expo-crypto'
import { AppState } from 'react-native'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { secureSessionStorage } from './secureSession'

// Hermes has no Web Crypto, and without crypto.getRandomValues supabase-js makes the PKCE verifier with Math.random.
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  globalThis.crypto = { ...globalThis.crypto, getRandomValues } as Crypto
}

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string }
const url = extra.supabaseUrl
const key = extra.supabaseKey

/** Null when the app was built without Supabase settings; the app then runs in local-only mode. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE: a confirmation link only works on the device that signed up (see lib/authLink.ts).
        auth: { storage: secureSessionStorage(), flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 20 } }
      })
    : null

// Refresh the session only while the app is on screen, as Supabase recommends for React Native.
if (supabase) {
  const client = supabase
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh()
    else client.auth.stopAutoRefresh()
  })
}
