import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AppIcon } from './AppIcon'
import { meetsSignUpRule, SIGN_UP_PASSWORD_RULE } from '../lib/passwordRule'

export const AUTH_REDIRECT = 'winnotes://auth-callback'

export function AuthScreen({ onOffline, notice }: { onOffline: () => void; notice?: string | null }): ReactNode {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(notice ?? null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!supabase) return
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
          setInfo('Check your email and click the confirmation link. It will open Notes and sign you in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const showRule = mode === 'signup' && error !== SIGN_UP_PASSWORD_RULE

  return (
    <div className="auth">
      <div className="auth-drag" />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <motion.div initial={{ rotate: -8, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.05 }}>
          <AppIcon size={72} />
        </motion.div>
        <h1>Notes</h1>
        <p className="auth-sub">Sign in to sync your notes and folders across your computers in real time.</p>

        {supabase ? (
          <form onSubmit={submit} className="auth-form">
            <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <input
              type="password"
              placeholder="Password"
              aria-describedby={showRule ? 'password-rule' : undefined}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {showRule ? (
              <p id="password-rule" className="auth-hint">
                {SIGN_UP_PASSWORD_RULE}
              </p>
            ) : null}
            <AnimatePresence mode="popLayout">
              {error ? (
                <motion.div key="err" className="auth-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {error}
                </motion.div>
              ) : null}
              {info ? (
                <motion.div key="info" className="auth-info" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {info}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <motion.button whileTap={{ scale: 0.98 }} className="auth-primary" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </motion.button>
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </form>
        ) : (
          <p className="auth-error">Cloud sync is not configured in this build.</p>
        )}
        <button className="auth-offline" onClick={onOffline}>
          Use without syncing
        </button>
      </motion.div>
    </div>
  )
}
