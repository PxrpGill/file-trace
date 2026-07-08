import type { CSSProperties } from 'react'

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <span className="version-progress" style={{ '--pct': `${percent}%` } as CSSProperties}>
      <span className="version-progress-fill" />
      <span className="version-progress-label">{percent}%</span>
    </span>
  )
}
