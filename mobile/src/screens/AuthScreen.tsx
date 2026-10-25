import { useState } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useTheme } from '../theme'
import { meetsSignUpRule, SIGN_UP_PASSWORD_RULE } from '../lib/passwordRule'

export const AUTH_REDIRECT = 'winnotes://auth-callback'

export function AuthScreen({ notice, onOffline }: { notice: string | null; onOffline: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(notice)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!supabase || busy) return
    if (mode === 'signup' && !meetsSignUpRule(password)) return setError(SIGN_UP_PASSWORD_RULE)
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // Opens the app from the confirmation email and signs in (must be an allowed redirect URL in Supabase).
          options: { emailRedirectTo: AUTH_REDIRECT }
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Check your email and tap the confirmation link. It will open Notes and sign you in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field = [styles.input, { backgroundColor: t.field, color: t.text }]
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={[styles.h1, { color: t.text }]}>Notes</Text>
        <Text style={[styles.sub, { color: t.text2 }]}>Sign in to sync your notes and folders with your computers in real time.</Text>

        {supabase ? (
          <View style={styles.form}>
            <TextInput
              style={field}
              placeholder="Email"
              placeholderTextColor={t.text3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={field}
              placeholder="Password"
              placeholderTextColor={t.text3}
              secureTextEntry
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            {mode === 'signup' && error !== SIGN_UP_PASSWORD_RULE ? <Text style={[styles.msg, { color: t.text3 }]}>{SIGN_UP_PASSWORD_RULE}</Text> : null}
            {error ? (
              <Text style={[styles.msg, { color: t.danger }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : null}
            {info ? (
              <Text style={[styles.msg, { color: t.text2 }]} accessibilityLiveRegion="polite">
                {info}
              </Text>
            ) : null}
            <Pressable
              onPress={submit}
              disabled={busy || !email || password.length < 6}
              accessibilityRole="button"
              accessibilityLabel={mode === 'signin' ? 'Sign In' : 'Create Account'}
              accessibilityState={{ disabled: busy || !email || password.length < 6, busy }}
              style={({ pressed }) => [styles.primary, { backgroundColor: t.accent, opacity: pressed ? 0.85 : busy || !email || password.length < 6 ? 0.5 : 1 }]}>
              {busy ? <ActivityIndicator color="#1d1d1f" /> : <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>}
            </Pressable>
            <Pressable
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
              style={styles.link}
              accessibilityRole="button"
            >
              <Text style={{ color: t.accentText, fontSize: 15 }}>{mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.msg, { color: t.danger }]}>Cloud sync is not configured in this build.</Text>
        )}
        <Pressable onPress={onOffline} style={styles.link} accessibilityRole="button">
          <Text style={{ color: t.text2, fontSize: 15 }}>Use without syncing</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 28 },
  logo: { width: 84, height: 84, borderRadius: 20, marginBottom: 16 },
  h1: { fontSize: 30, fontWeight: '700', letterSpacing: -0.4 },
  sub: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 28, lineHeight: 21 },
  form: { width: '100%', maxWidth: 380, gap: 10 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  msg: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 6 },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#1d1d1f', fontSize: 17, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 12 }
})
