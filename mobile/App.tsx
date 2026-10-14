import { useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './src/lib/supabase'
import { saveNow, useStore } from './src/lib/store'
import { flushNow, startSync, stopSync } from './src/lib/sync'
import { useTheme } from './src/theme'
import { AuthScreen } from './src/screens/AuthScreen'
import { FoldersScreen } from './src/screens/FoldersScreen'
import { NotesScreen } from './src/screens/NotesScreen'
import { EditorScreen } from './src/screens/EditorScreen'
import type { RootStackParamList } from './src/navigation'

const MODE_KEY = 'win-notes:mode'
const Stack = createNativeStackNavigator<RootStackParamList>()

/** Confirmation emails open winnotes://auth-callback#access_token=…&refresh_token=… */
async function handleAuthLink(url: string | null, onNotice: (s: string) => void): Promise<void> {
  if (!url || !supabase || !url.includes('auth-callback')) return
  const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '')
  const error = params.get('error_description')
  if (error) {
    onNotice(error.replace(/\+/g, ' '))
    return
  }
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return
  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token })
  if (sessionError) onNotice(`${sessionError.message}. Sign in with your email and password.`)
}

export default function App() {
  const t = useTheme()
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [localMode, setLocalMode] = useState<boolean | undefined>(undefined)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((v) => setLocalMode(v === 'local'))
  }, [])

  useEffect(() => {
    Linking.getInitialURL().then((url) => handleAuthLink(url, setAuthNotice))
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthLink(url, setAuthNotice))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? (localMode || !supabase ? 'local' : null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoaded(false)
    if (userId !== 'local') AsyncStorage.removeItem(MODE_KEY)
    useStore
      .getState()
      .load(userId)
      .then(() => {
        if (cancelled) return
        setLoaded(true)
        if (userId !== 'local') startSync(userId)
      })
    return () => {
      cancelled = true
      stopSync()
      useStore.getState().reset()
      setLoaded(false)
    }
  }, [userId])

  // Persist immediately when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveNow()
    })
    return () => sub.remove()
  }, [])

  const signOut = async (): Promise<void> => {
    await flushNow().catch(() => {})
    await supabase?.auth.signOut()
  }
  const signIn = (): void => {
    AsyncStorage.removeItem(MODE_KEY)
    setLocalMode(false)
  }

  const navTheme = t.dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: t.bg, primary: t.accentText, card: t.bg } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: t.bg, primary: t.accentText, card: t.bg } }

  const booting = session === undefined || localMode === undefined || (userId && !loaded)

  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {booting ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />
      ) : userId ? (
        <NavigationContainer theme={navTheme} key={userId}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="Folders">{(props) => <FoldersScreen {...props} email={session?.user.email} onSignOut={signOut} onSignIn={signIn} />}</Stack.Screen>
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="Editor" component={EditorScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <AuthScreen
          key={authNotice ?? 'auth'}
          notice={authNotice}
          onOffline={() => {
            AsyncStorage.setItem(MODE_KEY, 'local')
            setLocalMode(true)
          }}
        />
      )}
    </SafeAreaProvider>
  )
}
