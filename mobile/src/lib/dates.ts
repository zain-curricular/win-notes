const DAY = 86_400_000

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function daysAgo(d: Date, now: Date): number {
  return Math.round((dayStart(now) - dayStart(d)) / DAY)
}

/** Section headers used by the macOS Notes list. */
export function groupLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const days = daysAgo(d, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 Days'
  if (days < 30) return 'Previous 30 Days'
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'long' })
  return String(d.getFullYear())
}

/** Short date shown on each row: time today, "Yesterday", weekday this week, else a numeric date. */
export function rowDate(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const days = daysAgo(d, now)
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' })
}

/** "14 October 2026 at 9:41 AM", shown above the note. */
export function fullDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

export function time(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : 0
}
