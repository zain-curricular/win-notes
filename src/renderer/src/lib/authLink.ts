export type AuthLink = { kind: 'code'; code: string; flowId?: string } | { kind: 'error'; message: string } | { kind: 'refused' }

/**
 * What a winnotes://auth-callback link asks for. Only a PKCE code is accepted: it can be exchanged only with the
 * verifier this device stored at sign-up, so a link carrying someone else's tokens never signs the app in.
 */
export function parseAuthLink(url: string): AuthLink | null {
  if (!url.startsWith('winnotes://auth-callback')) return null
  const [beforeHash, hash = ''] = url.split('#', 2)
  const query = new URLSearchParams(beforeHash.split('?')[1] ?? '')
  const fragment = new URLSearchParams(hash)
  const message = query.get('error_description') ?? fragment.get('error_description')
  if (message) return { kind: 'error', message }
  const code = query.get('code')
  if (code) return { kind: 'code', code, flowId: query.get('sb_flow_id') ?? undefined }
  if (['access_token', 'refresh_token'].some((k) => query.has(k) || fragment.has(k))) return { kind: 'refused' }
  return null
}

export const UNUSABLE_LINK = "This sign-in link can't be used here. If you just confirmed your email, sign in with your email and password."
