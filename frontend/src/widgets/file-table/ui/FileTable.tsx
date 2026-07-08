import type { ReactNode } from 'react'

export interface FileTableColumn<T> {
  header: string
  className?: string
  render: (row: T) => ReactNode
}

export function FileTable<T extends { id: number }>({
  rows,
  columns,
  renderName,
  renderActions,
  selectedIds,
  onToggle,
  onToggleAll,
  emptyMessage,
}: {
  rows: T[]
  columns: FileTableColumn<T>[]
  renderName: (row: T) => ReactNode
  renderActions: (row: T) => ReactNode
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onToggleAll: (checked: boolean) => void
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return <div className="empty">{emptyMessage}</div>
  }

  const allSelected = rows.every((row) => selectedIds.has(row.id))

  return (
    <div className="table-wrap">
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
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="select-col">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
