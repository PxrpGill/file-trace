import { useEffect, useMemo, useState } from 'react'
import { Folder } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFileSearchQuery, summarizeBulkResult, FileIcon } from '@/entities/file'
import { useDebouncedValue, formatSize } from '@/shared/lib'
import { Modal } from '@/shared/ui'
import { FileTable, SelectionToolbar } from '@/widgets/file-table'
import { DownloadFileButton } from '@/features/file/download-file'
import { BulkMoveAction } from '@/features/file/bulk-move'
import { BulkDeleteAction } from '@/features/file/bulk-delete'
import { BulkDownloadAction } from '@/features/file/bulk-download'

const LEVEL_LABELS = { read: 'чтение', write: 'чтение и изменение' }

export function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [errorMessage, setErrorMessage] = useState('')
  const [resultMessage, setResultMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const debounced = useDebouncedValue(query, 300)
  const results = useFileSearchQuery(debounced)
  const folders = useMemo(
    () => (results.data ?? []).filter((r) => r.type === 'folder'),
    [results.data],
  )
  const files = useMemo(
    () => (results.data ?? []).filter((r) => r.type === 'file'),
    [results.data],
  )

  useEffect(() => {
    setSearchParams(debounced ? { q: debounced } : {}, { replace: true })
  }, [debounced])

  useEffect(() => {
    setSelectedIds(new Set())
    setResultMessage('')
  }, [debounced])

  return (
    <div className="browser">
      <main className="content">
        <div className="content-head">
          <h1>Поиск файлов и папок</h1>
        </div>

        <input
          type="search"
          placeholder="Поиск файлов и папок по названию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {resultMessage && (
          <div className="bulk-result-banner">
            {resultMessage}{' '}
            <button className="btn secondary small" onClick={() => setResultMessage('')}>
              ×
            </button>
          </div>
        )}

        <SelectionToolbar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <BulkDownloadAction
            fileIds={[...selectedIds]}
            onResult={(result) => {
              setResultMessage(
                summarizeBulkResult('Скачано', result.files.length, selectedIds.size, result.skipped),
              )
            }}
            onError={setErrorMessage}
          />{' '}
          <BulkMoveAction
            fileIds={[...selectedIds]}
            onDone={(result) => {
              setResultMessage(
                summarizeBulkResult('Перемещено', result.moved.length, selectedIds.size, result.skipped),
              )
              setSelectedIds(new Set())
            }}
            onError={setErrorMessage}
          />{' '}
          <BulkDeleteAction
            fileIds={[...selectedIds]}
            onDone={(result) => {
              setResultMessage(
                summarizeBulkResult('Удалено', result.deleted.length, selectedIds.size, result.skipped),
              )
              setSelectedIds(new Set())
            }}
          />
        </SelectionToolbar>

        {debounced.trim().length < 2 ? (
          <div className="empty">Введите не менее двух символов для поиска</div>
        ) : (
          <>
            {folders.length > 0 && (
              <div className="folder-results">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="folder-result-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/?folder=${folder.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/?folder=${folder.id}`)}
                  >
                    <span className="file-name">
                      <Folder size={16} aria-hidden strokeWidth={1.75} />
                      {folder.name}
                    </span>
                    <span className="mono folder-name">{folder.parent_name ?? 'Корень'}</span>
                    <span className="mono">{LEVEL_LABELS[folder.level]}</span>
                  </div>
                ))}
              </div>
            )}

            <FileTable
              rows={files}
              emptyMessage="Ничего не найдено"
              selectedIds={selectedIds}
              onToggle={(id) =>
                setSelectedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              onToggleAll={(checked) =>
                setSelectedIds(checked ? new Set(files.map((f) => f.id)) : new Set())
              }
              columns={[
                { header: 'Папка', render: (file) => file.folder_name },
                { header: 'Права', className: 'mono', render: (file) => LEVEL_LABELS[file.level] },
                {
                  header: 'Размер',
                  className: 'mono',
                  render: (file) =>
                    file.current_version ? formatSize(file.current_version.size) : '—',
                },
              ]}
              renderName={(file) => (
                <span
                  className="file-name"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/?folder=${file.folder_id}&highlight=${file.id}`)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && navigate(`/?folder=${file.folder_id}&highlight=${file.id}`)
                  }
                >
                  <FileIcon name={file.name} />
                  {file.name}
                </span>
              )}
              renderActions={(file) => (
                <DownloadFileButton url={`/api/files/${file.id}/download`} />
              )}
            />
          </>
        )}
      </main>

      {errorMessage && (
        <Modal title="Не получилось" onClose={() => setErrorMessage('')} className="danger">
          <p style={{ margin: 0 }}>{errorMessage}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setErrorMessage('')}>
              Понятно
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
