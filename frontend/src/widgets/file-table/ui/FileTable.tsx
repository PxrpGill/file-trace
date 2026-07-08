import { memo, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FILE_IDS_DRAG_TYPE } from '@/entities/file'

export interface FileTableColumn<T> {
  header: string
  className?: string
  render: (row: T) => ReactNode
}

const ROW_HEIGHT = 44
// Насколько рано (в пикселях до конца скролла) запрашивать следующую
// страницу — чуть раньше, чем пользователь долистает до последней строки.
const END_REACHED_MARGIN = ROW_HEIGHT * 5

interface FileRowProps<T extends { id: number }> {
  row: T
  columns: FileTableColumn<T>[]
  renderName: (row: T) => ReactNode
  renderActions: (row: T) => ReactNode
  selected: boolean
  highlighted: boolean
  onToggle: (id: number) => void
  onContextMenu?: (row: T, x: number, y: number) => void
  getDragIds?: (row: T) => number[]
}

function FileRowInner<T extends { id: number }>({
  row,
  columns,
  renderName,
  renderActions,
  selected,
  highlighted,
  onToggle,
  onContextMenu,
  getDragIds,
}: FileRowProps<T>) {
  return (
    <tr
      className={highlighted ? 'highlighted' : undefined}
      style={{ height: ROW_HEIGHT }}
      draggable={Boolean(getDragIds)}
      onDragStart={
        getDragIds
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData(FILE_IDS_DRAG_TYPE, JSON.stringify(getDragIds(row)))
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
      <td className="select-col">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(row.id)}
          aria-label="Выбрать файл"
        />
      </td>
      <td>{renderName(row)}</td>
      {columns.map((column) => (
        <td key={column.header} className={column.className}>
          {column.render(row)}
        </td>
      ))}
      <td className="actions">{renderActions(row)}</td>
    </tr>
  )
}

// Строка выделена в отдельный memo-компонент: без этого переключение одного
// чекбокса или тик прогресса загрузки в родителе перерисовывал бы все строки
// таблицы сразу, а не только ту, что реально изменилась.
const FileRow = memo(FileRowInner) as typeof FileRowInner

export function FileTable<T extends { id: number }>({
  rows,
  columns,
  renderName,
  renderActions,
  selectedIds,
  onToggle,
  onToggleAll,
  emptyMessage,
  onEndReached,
  highlightId,
  onContextMenu,
  draggable,
}: {
  rows: T[]
  columns: FileTableColumn<T>[]
  renderName: (row: T) => ReactNode
  renderActions: (row: T) => ReactNode
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onToggleAll: (checked: boolean) => void
  emptyMessage: string
  onEndReached?: () => void
  highlightId?: number | null
  onContextMenu?: (row: T, x: number, y: number) => void
  draggable?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Стабильная ссылка на функцию — не завязана на identity selectedIds,
  // иначе передача её в FileRow каждый рендер обесценивала бы memo у всех
  // строк (см. комментарий про FileRow ниже), хотя нужна свежая selectedIds
  // только в момент самого drag'а.
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const getDragIds = useCallback(
    (row: T) => (selectedIdsRef.current.has(row.id) ? [...selectedIdsRef.current] : [row.id]),
    [],
  )

  // Рендерим только видимое окно строк — при тысячах файлов в папке это
  // единственный способ не создавать тысячи DOM-узлов сразу (см. аудит
  // производительности: FileTable раньше рендерил rows.map без окна).
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  useEffect(() => {
    if (highlightId == null) return
    const index = rows.findIndex((row) => row.id === highlightId)
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: 'center' })
  }, [highlightId, rows, rowVirtualizer])

  if (rows.length === 0) {
    return <div className="empty">{emptyMessage}</div>
  }

  const allSelected = rows.every((row) => selectedIds.has(row.id))
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0
  const colSpan = columns.length + 2

  const handleScroll = () => {
    if (!onEndReached) return
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - END_REACHED_MARGIN) {
      onEndReached()
    }
  }

  return (
    <div className="table-wrap file-table-viewport" ref={scrollRef} onScroll={handleScroll}>
      <table>
        <thead>
          <tr>
            <th className="select-col">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label="Выбрать все файлы"
              />
            </th>
            <th>Имя</th>
            {columns.map((column) => (
              <th key={column.header}>{column.header}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td style={{ height: paddingTop, padding: 0, border: 'none' }} colSpan={colSpan} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <FileRow
                key={row.id}
                row={row}
                columns={columns}
                renderName={renderName}
                renderActions={renderActions}
                selected={selectedIds.has(row.id)}
                highlighted={row.id === highlightId}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
                getDragIds={draggable ? getDragIds : undefined}
              />
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td style={{ height: paddingBottom, padding: 0, border: 'none' }} colSpan={colSpan} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
