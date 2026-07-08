import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

const MENU_WIDTH_ESTIMATE = 200
const MENU_HEIGHT_ESTIMATE = 260

export function ContextMenu({ x, y, onClose, children }: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - MENU_WIDTH_ESTIMATE)
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT_ESTIMATE)

  return (
    <div className="context-menu" style={{ left: Math.max(4, left), top: Math.max(4, top) }} ref={ref} role="menu">
      {children}
    </div>
  )
}
