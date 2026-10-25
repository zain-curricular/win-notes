// Mirrors the server's sign-up rule in supabase/config.toml (minimum_password_length, password_requirements).
// The server still decides; this only saves a round trip.
export const SIGN_UP_PASSWORD_RULE = 'Use at least 8 characters, with an uppercase letter, a lowercase letter and a number.'

export const meetsSignUpRule = (password: string): boolean =>
  password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
