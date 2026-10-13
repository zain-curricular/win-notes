import type { ReactNode } from 'react'

/** The app icon: a yellow-topped notepad with ruled lines. Also rendered to build/icon.png. */
export function AppIcon({ size = 64 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="ai-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#f5b800" />
        </linearGradient>
        <linearGradient id="ai-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f2f2f4" />
        </linearGradient>
        <clipPath id="ai-clip">
          <rect x="100" y="100" width="824" height="824" rx="185" />
        </clipPath>
      </defs>
      <g clipPath="url(#ai-clip)">
        <rect x="100" y="100" width="824" height="824" fill="url(#ai-paper)" />
        <rect x="100" y="100" width="824" height="250" fill="url(#ai-top)" />
        <g stroke="#d9d9de" strokeWidth="14">
          <line x1="100" y1="500" x2="924" y2="500" />
          <line x1="100" y1="620" x2="924" y2="620" />
          <line x1="100" y1="740" x2="924" y2="740" />
          <line x1="100" y1="860" x2="924" y2="860" />
        </g>
        <g fill="#b3b3b8">
          {[190, 300, 410, 520, 630, 740, 850].map((x) => (
            <circle key={x} cx={x} cy="380" r="16" />
          ))}
        </g>
      </g>
      <rect x="100" y="100" width="824" height="824" rx="185" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4" />
    </svg>
  )
}
