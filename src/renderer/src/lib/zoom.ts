// The browser's zoom steps, so each press changes the size by a familiar amount.
export const ZOOM_STEPS: readonly number[] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
const ZOOM_KEY = 'win-notes:zoom'

export function stepZoom(current: number, direction: 1 | -1): number {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse()
  return steps.find((z) => direction * (z - current) > 0.001) ?? steps[steps.length - 1]
}

/** Zoom is kept per computer, not per account, so it also applies before anyone signs in. */
export function savedZoom(): number {
  try {
    const zoom = Number(localStorage.getItem(ZOOM_KEY))
    return ZOOM_STEPS.includes(zoom) ? zoom : 1
  } catch {
    return 1
  }
}

export function applyZoom(zoom: number): void {
  document.documentElement.style.setProperty('--zoom', String(zoom))
  window.windowZoom?.set(zoom)
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom))
  } catch {
    // Storage can be unavailable; the zoom still applies for this session.
  }
}
