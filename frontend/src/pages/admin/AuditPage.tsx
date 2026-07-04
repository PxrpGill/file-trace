import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, downloadBlob } from '../../api/client'
import type { AuditAction, AuditPage as AuditPageData, User } from '../../api/types'
import { ACTION_LABELS, formatDate } from '../../api/types'

const PAGE_SIZE = 50

export function AuditPage() {
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)

  const params: Record<string, string | number> = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }
  if (userId) params.user_id = userId
  if (action) params.action = action
  if (dateFrom) params.date_from = new Date(`${dateFrom}T00:00:00`).toISOString()
  if (dateTo) params.date_to = new Date(`${dateTo}T23:59:59`).toISOString()

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/api/users')).data,
  })
  const journal = useQuery({
    queryKey: ['audit', params],
    queryFn: async () =>
      (await api.get<AuditPageData>('/api/audit', { params })).data,
  })

  const exportCsv = () => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([k]) => k !== 'limit' && k !== 'offset')
        .map(([k, v]) => [k, String(v)]),
    )
    downloadBlob(`/api/audit/export.csv?${query}`, 'audit.csv')
  }

  const total = journal.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="filters">
        <label>
          Пользователь
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Все</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </label>
        <label>
          Действие
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Все</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          С даты
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <label>
          По дату
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <button className="btn secondary" onClick={exportCsv}>
          Экспорт CSV
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Когда</th>
              <th>Кто</th>
              <th>Действие</th>
              <th>Объект</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {(journal.data?.items ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className="mono">{formatDate(entry.created_at)}</td>
                <td className="mono">{entry.username ?? '—'}</td>
                <td>
                  <span className="stamp-cell badge">
                    {ACTION_LABELS[entry.action as AuditAction] ?? entry.action}
                  </span>
                </td>
                <td className="muted">
                  {describeObject(entry.details, entry.file_id, entry.folder_id)}
                </td>
                <td className="mono muted">{entry.ip ?? '—'}</td>
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Записей по выбранным фильтрам нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          className="btn secondary small"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          ← Назад
        </button>
        <span className="muted">
          Страница {page + 1} из {pages} · всего записей: {total}
        </span>
        <button
          className="btn secondary small"
          disabled={page + 1 >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Вперёд →
        </button>
      </div>
    </div>
  )
}

function describeObject(
  details: Record<string, unknown> | null,
  fileId: number | null,
  folderId: number | null,
): string {
  if (details) {
    if (typeof details.name === 'string') return details.name
    if (typeof details.new_name === 'string')
      return `${details.old_name} → ${details.new_name}`
    if (typeof details.username === 'string') return String(details.username)
    if (typeof details.level === 'string')
      return details.level === 'write' ? 'чтение и изменение' : 'чтение'
  }
  if (fileId) return `файл #${fileId}`
  if (folderId) return `папка #${folderId}`
  return '—'
}
