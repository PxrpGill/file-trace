import type { FileItem, FileVersion } from '@/entities/file'
import { useFileAuditQuery, useFileVersionsQuery } from '@/entities/file'
import type { AuditEntry } from '@/entities/audit'
import { ACTION_LABELS } from '@/entities/audit'
import { formatDate, formatSize } from '@/shared/lib'
import { DownloadFileButton } from '@/features/file/download-file'

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
  const versions = useFileVersionsQuery(file.id)
  const history = useFileAuditQuery(file.id)
  const historyEntries = history.data?.pages.flatMap((page) => page.items) ?? []

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
          {(versions.data ?? []).slice().reverse().map((v: FileVersion) => (
            <div className="version-row" key={v.id}>
              <span className="no">v{v.version_no}</span>
              <span className="meta">
                {formatSize(v.size)} · {formatDate(v.created_at)}
                <span className="hash" title={v.sha256}>
                  sha256 {v.sha256}
                </span>
              </span>
              <DownloadFileButton url={`/api/files/${file.id}/download?version_id=${v.id}`} />
            </div>
          ))}

          <h3>История действий</h3>
          <ul className="trace">
            {historyEntries.map((entry) => (
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
          {history.hasNextPage && (
            <button
              className="btn secondary small"
              onClick={() => history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
            >
              {history.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
