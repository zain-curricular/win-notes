import { describe, expect, it } from 'vitest'
import { parseAuthLink as desktop } from './authLink'
import { parseAuthLink as android } from '../../../../mobile/src/lib/authLink'

describe.each([
  ['desktop', desktop],
  ['Android', android]
])('sign-in links on %s', (_, parseAuthLink) => {
  it('refuses a link that carries tokens, so nobody can sign the app in to their own account', () => {
    expect(parseAuthLink('winnotes://auth-callback#access_token=a.b.c&refresh_token=r&token_type=bearer')).toEqual({ kind: 'refused' })
    expect(parseAuthLink('winnotes://auth-callback?access_token=a.b.c&refresh_token=r')).toEqual({ kind: 'refused' })
  })

  it('takes the PKCE code and the flow id Supabase adds to the redirect', () => {
    expect(parseAuthLink('winnotes://auth-callback?sb_flow_id=0123abcd4567ef89&code=9f2c')).toEqual({ kind: 'code', code: '9f2c', flowId: '0123abcd4567ef89' })
    expect(parseAuthLink('winnotes://auth-callback?code=9f2c')).toEqual({ kind: 'code', code: '9f2c', flowId: undefined })
  })

  it('passes on an error, and ignores other links', () => {
    expect(parseAuthLink('winnotes://auth-callback#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).toEqual({
      kind: 'error',
      message: 'Email link is invalid or has expired'
    })
    expect(parseAuthLink('winnotes://auth-callback')).toBeNull()
    expect(parseAuthLink('winnotes://other?code=9f2c')).toBeNull()
  })
})
