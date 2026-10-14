import { useColorScheme } from 'react-native'

export const light = {
  dark: false,
  bg: '#ffffff',
  grouped: '#f2f2f7',
  card: '#ffffff',
  text: '#1d1d1f',
  text2: '#6e6e73',
  text3: '#a1a1a6',
  sep: 'rgba(0,0,0,0.1)',
  accent: '#e0a800',
  accentText: '#a87e00',
  accentSoft: 'rgba(255,199,0,0.22)',
  danger: '#e5484d',
  field: 'rgba(0,0,0,0.055)',
  ripple: 'rgba(0,0,0,0.08)',
  sheet: '#ffffff',
  hlPurple: '#9b4fd1',
  hlPink: '#e0336b',
  hlOrange: '#e07800',
  hlMint: '#0f9f96',
  hlBlue: '#1f6fe0'
}

export const dark: typeof light = {
  dark: true,
  bg: '#1c1c1e',
  grouped: '#000000',
  card: '#1c1c1e',
  text: '#f2f2f7',
  text2: '#98989f',
  text3: '#6a6a70',
  sep: 'rgba(255,255,255,0.12)',
  accent: '#ffcc1a',
  accentText: '#ffd23f',
  accentSoft: 'rgba(255,196,0,0.26)',
  danger: '#ff5c61',
  field: 'rgba(255,255,255,0.09)',
  ripple: 'rgba(255,255,255,0.1)',
  sheet: '#2c2c2e',
  hlPurple: '#d08bff',
  hlPink: '#ff6f96',
  hlOrange: '#ffad42',
  hlMint: '#4fe0d6',
  hlBlue: '#5aa5ff'
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}
