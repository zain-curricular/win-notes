import { useColorScheme } from 'react-native'

// Mirrors the desktop tokens in src/renderer/src/styles.css.
export const light = {
  dark: false,
  bg: '#ffffff',
  grouped: '#f4f4f1',
  card: '#ffffff',
  text: '#1c1c1e',
  text2: '#55555b',
  text3: '#6c6c72',
  textFaint: '#a5a5aa',
  sep: 'rgba(0,0,0,0.09)',
  accent: '#c98a0c',
  accentText: '#8a5d00',
  accentSoft: 'rgba(201,138,12,0.16)',
  danger: '#c9353b',
  success: '#2c8a52',
  field: 'rgba(0,0,0,0.05)',
  ripple: 'rgba(0,0,0,0.08)',
  sheet: '#ffffff',
  hlPurple: '#8e44c4',
  hlPink: '#c92a5c',
  hlOrange: '#b85f00',
  hlMint: '#0b7f78',
  hlBlue: '#1d63c9'
}

export const dark: typeof light = {
  dark: true,
  bg: '#1c1c1e',
  grouped: '#111113',
  card: '#1f1f22',
  text: '#ececee',
  text2: '#a8a8ae',
  text3: '#909096',
  textFaint: '#5f5f65',
  sep: 'rgba(255,255,255,0.11)',
  accent: '#e3b34c',
  accentText: '#f0c869',
  accentSoft: 'rgba(227,179,76,0.2)',
  danger: '#ff6b6b',
  success: '#5ccf8a',
  field: 'rgba(255,255,255,0.08)',
  ripple: 'rgba(255,255,255,0.1)',
  sheet: '#2a2a2d',
  hlPurple: '#d08bff',
  hlPink: '#ff7aa0',
  hlOrange: '#ffad42',
  hlMint: '#5fe0d6',
  hlBlue: '#6aaeff'
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}
