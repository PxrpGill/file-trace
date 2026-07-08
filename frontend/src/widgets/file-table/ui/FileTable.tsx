import { memo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

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
  onToggle: (id: number) => void
}

function FileRowInner<T extends { id: number }>({
  row,
  columns,
  renderName,
  renderActions,
  selected,
  onToggle,
}: FileRowProps<T>) {
  return (
    <tr style={{ height: ROW_HEIGHT }}>
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
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Рендерим только видимое окно строк — при тысячах файлов в папке это
  // единственный способ не создавать тысячи DOM-узлов сразу (см. аудит
  // производительности: FileTable раньше рендерил rows.map без окна).
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

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
                onToggle={onToggle}
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
