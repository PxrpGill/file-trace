import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import type { FileItem } from '../../api/types'
import { formatSize } from '../../api/types'
import { ConfirmModal } from '../../components/Modal'

export function TrashPage() {
  const queryClient = useQueryClient()
  const [purgeTarget, setPurgeTarget] = useState<FileItem | null>(null)

  const trash = useQuery({
    queryKey: ['trash'],
    queryFn: async () => (await api.get<FileItem[]>('/api/files/trash')).data,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trash'] })
    queryClient.invalidateQueries({ queryKey: ['files'] })
  }

  const restore = useMutation({
    mutationFn: (id: number) => api.post(`/api/files/${id}/restore`),
    onSuccess: invalidate,
  })
  const purge = useMutation({
    mutationFn: (id: number) => api.delete(`/api/files/${id}/purge`),
    onSuccess: invalidate,
  })

  if ((trash.data ?? []).length === 0) {
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
          {(trash.data ?? []).map((file) => (
            <tr key={file.id}>
              <td>{file.name}</td>
              <td className="mono">
                {file.current_version ? formatSize(file.current_version.size) : '—'}
              </td>
              <td className="actions">
                <button
                  className="btn secondary small"
                  onClick={() => restore.mutate(file.id)}
                >
                  Восстановить
                </button>{' '}
                <button className="btn danger small" onClick={() => setPurgeTarget(file)}>
                  Удалить навсегда
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {purgeTarget && (
        <ConfirmModal
          title="Удалить навсегда"
          text={`Файл «${purgeTarget.name}» и все его версии будут удалены безвозвратно. Запись об удалении останется в журнале аудита.`}
          confirmLabel="Удалить навсегда"
          onClose={() => setPurgeTarget(null)}
          onConfirm={() => {
            purge.mutate(purgeTarget.id)
            setPurgeTarget(null)
          }}
        />
      )}
    </div>
  )
}
