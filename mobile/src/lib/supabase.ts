import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { AppState } from 'react-native'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string }
const url = extra.supabaseUrl
const key = extra.supabaseKey

/** Null when the app was built without Supabase settings; the app then runs in local-only mode. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
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
