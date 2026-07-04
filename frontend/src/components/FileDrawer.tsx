import { useQuery } from '@tanstack/react-query'
import { api, downloadBlob } from '../api/client'
import type { AuditEntry, FileItem, FileVersion } from '../api/types'
import { ACTION_LABELS, formatDate, formatSize } from '../api/types'

const WAX_ACTIONS = new Set(['file_delete', 'file_purge', 'login_failed', 'permission_revoke'])

function detailLine(entry: AuditEntry): string | null {
  const d = entry.details
  if (!d) return null
  if (entry.action === 'file_rename') return `${d.old_name} → ${d.new_name}`
  if (entry.action === 'file_new_version' || entry.action === 'file_download')
    return d.version_no ? `версия ${d.version_no}` : null
  if (entry.action === 'file_upload' && typeof d.size === 'number')
    return formatSize(d.size)
  return null
}

export function FileDrawer({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const versions = useQuery({
    queryKey: ['versions', file.id],
    queryFn: async () =>
      (await api.get<FileVersion[]>(`/api/files/${file.id}/versions`)).data,
  })
  const history = useQuery({
    queryKey: ['file-audit', file.id],
    queryFn: async () =>
      (await api.get<AuditEntry[]>(`/api/files/${file.id}/audit`)).data,
  })

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <header>
          <h2>{file.name}</h2>
          <button className="btn secondary small" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="body">
          <h3>Версии</h3>
          {(versions.data ?? []).slice().reverse().map((v) => (
            <div className="version-row" key={v.id}>
              <span className="no">v{v.version_no}</span>
              <span className="meta">
                {formatSize(v.size)} · {formatDate(v.created_at)}
                <span className="hash" title={v.sha256}>
                  sha256 {v.sha256}
                </span>
              </span>
              <button
                className="btn secondary small"
                onClick={() =>
                  downloadBlob(
                    `/api/files/${file.id}/download?version_id=${v.id}`,
                    file.name,
                  )
                }
              >
                Скачать
              </button>
            </div>
          ))}

          <h3>История действий</h3>
          <ul className="trace">
            {(history.data ?? []).map((entry) => (
              <li key={entry.id} className={WAX_ACTIONS.has(entry.action) ? 'wax' : ''}>
                <span className="stamp">{ACTION_LABELS[entry.action]}</span>
                <span className="when">{formatDate(entry.created_at)}</span>
                <div className="who-line">
                  <b>{entry.username ?? '—'}</b>
                  {entry.ip && <span className="muted mono"> · {entry.ip}</span>}
                  {detailLine(entry) && (
                    <span className="muted"> · {detailLine(entry)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  )
}
