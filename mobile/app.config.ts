import { readFileSync } from 'fs'
import { join } from 'path'
import type { ConfigContext, ExpoConfig } from 'expo/config'

/** KEY=VALUE lines from a dotenv file; the Supabase settings live in ../.env.production. */
function readEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
        })
    )
  } catch {
    return {}
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = { ...readEnv(join(__dirname, '..', '.env.production')), ...process.env }
  return {
    ...config,
    name: 'Notes',
    slug: 'win-notes',
    version: '0.2.0',
    scheme: 'winnotes',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    android: {
      package: 'com.winnotes.app',
      versionCode: 2,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#f7e7a8' },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: false,
          data: [{ scheme: 'winnotes', host: 'auth-callback' }],
          category: ['BROWSABLE', 'DEFAULT']
        }
      ]
    },
    plugins: [['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#f7e7a8', dark: { backgroundColor: '#1c1c1e' } }]],
    ios: { bundleIdentifier: 'com.winnotes.app', supportsTablet: true },
    extra: {
      supabaseUrl: env.VITE_SUPABASE_URL ?? '',
      supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    }
  }
}
