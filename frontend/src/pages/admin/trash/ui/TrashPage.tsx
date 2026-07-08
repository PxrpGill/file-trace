import { useTrashQuery } from '@/entities/file'
import { formatSize } from '@/shared/lib'
import { RestoreFileButton } from '@/features/file/restore-file'
import { PurgeFileAction } from '@/features/file/purge-file'

export function TrashPage() {
  const trash = useTrashQuery()
  const files = trash.data?.pages.flatMap((page) => page.items) ?? []

  if (files.length === 0) {
    return <div className="empty">Корзина пуста</div>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Имя</th>
            <th>Размер</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td>{file.name}</td>
              <td className="mono">
                {file.current_version ? formatSize(file.current_version.size) : '—'}
              </td>
              <td className="actions">
                <RestoreFileButton file={file} /> <PurgeFileAction file={file} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trash.hasNextPage && (
        <button
          className="btn secondary small"
          onClick={() => trash.fetchNextPage()}
          disabled={trash.isFetchingNextPage}
        >
          {trash.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
        </button>
      )}
    </div>
  )
}
