import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FILE_IDS_DRAG_TYPE } from '@/entities/file'

const TILE_WIDTH = 140
const TILE_GAP = 10
const TILE_HEIGHT = 116

export function FileGrid<T extends { id: number }>({
  rows,
  selectedIds,
  onToggle,
  onOpenRow,
  renderIcon,
  renderName,
  renderMeta,
  getTitle,
  onContextMenu,
  emptyMessage,
  onEndReached,
  highlightId,
  draggable,
}: {
  rows: T[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onOpenRow?: (row: T) => void
  renderIcon: (row: T) => ReactNode
  renderName: (row: T) => ReactNode
  renderMeta?: (row: T) => ReactNode
  getTitle?: (row: T) => string
  onContextMenu?: (row: T, x: number, y: number) => void
  emptyMessage: string
  onEndReached?: () => void
  highlightId?: number | null
  draggable?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // scrollRef должен быть примонтирован независимо от того, пуст ли rows на
  // момент первого рендера (данные ещё грузятся) — иначе измерение ширины
  // всегда попадало бы на null (early return рендерил другую ветку без ref)
  // и колонки схлопывались бы в одну до следующего ресайза окна.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) setContainerWidth(el.clientWidth)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const columnsPerRow = Math.max(1, Math.floor((containerWidth + TILE_GAP) / (TILE_WIDTH + TILE_GAP)))
  const rowCount = rows.length === 0 ? 0 : Math.ceil(rows.length / columnsPerRow)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TILE_HEIGHT + TILE_GAP,
    overscan: 4,
  })

  useEffect(() => {
    if (highlightId == null || rows.length === 0) return
    const index = rows.findIndex((row) => row.id === highlightId)
    if (index >= 0) rowVirtualizer.scrollToIndex(Math.floor(index / columnsPerRow), { align: 'center' })
  }, [highlightId, rows, columnsPerRow, rowVirtualizer])

  const handleScroll = () => {
    if (!onEndReached) return
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - TILE_HEIGHT * 3) {
      onEndReached()
    }
  }

  return (
    <div className="table-wrap file-table-viewport" ref={scrollRef} onScroll={handleScroll} style={{ padding: rows.length === 0 ? 0 : 10 }}>
      {rows.length === 0 ? (
        <div className="empty">{emptyMessage}</div>
      ) : (
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columnsPerRow
            const tiles = rows.slice(start, start + columnsPerRow)
            return (
              <div
                key={virtualRow.key}
                className="file-tile-row"
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  left: 0,
                  right: 0,
                }}
              >
                {tiles.map((row) => {
                  const selected = selectedIds.has(row.id)
                  return (
                    <div
                      key={row.id}
                      className={`file-tile${selected ? ' selected' : ''}${row.id === highlightId ? ' highlighted' : ''}`}
                      style={{ width: TILE_WIDTH }}
                      title={getTitle?.(row)}
                      onClick={() => onOpenRow?.(row)}
                      draggable={draggable}
                      onDragStart={
                        draggable
                          ? (e) => {
                              const ids = selectedIds.has(row.id) ? [...selectedIds] : [row.id]
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData(FILE_IDS_DRAG_TYPE, JSON.stringify(ids))
                            }
                          : undefined
                      }
                      onContextMenu={
                        onContextMenu
                          ? (e) => {
                              e.preventDefault()
                              onContextMenu(row, e.clientX, e.clientY)
                            }
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        className="tile-check"
                        checked={selected}
                        onChange={() => onToggle(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Выбрать файл"
                      />
                      {renderIcon(row)}
                      <span className="tile-name">{renderName(row)}</span>
                      {renderMeta && <span className="tile-meta">{renderMeta(row)}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
