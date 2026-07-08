import type { ReactNode } from 'react'

export function SelectionToolbar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  if (count === 0) return null

  return (
    <div className="bulk-toolbar" role="toolbar">
      <span>Выбрано файлов: {count}</span>
      <span className="spacer" />
      {children}
      <button className="btn secondary small" onClick={onClear}>
        Снять выделение
      </button>
    </div>
  )
}
