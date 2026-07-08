import { useState } from 'react'
import { Modal } from '@/shared/ui'
import { flattenTree, useFolderTreeQuery, FolderPicker } from '@/entities/folder'
import type { BulkMoveResult } from '@/entities/file'
import { useBulkMoveMutation } from '../model/use-bulk-move-file'

export function BulkMoveAction({
  fileIds,
  onDone,
  onError,
}: {
  fileIds: number[]
  onDone?: (result: BulkMoveResult) => void
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tree = useFolderTreeQuery()
  const bulkMove = useBulkMoveMutation()
  const folders = flattenTree(tree.data ?? [])

  return (
    <>
      <button
        className="btn secondary small"
        disabled={fileIds.length === 0}
        onClick={() => setOpen(true)}
      >
        Переместить
      </button>
      {open && (
        <Modal title={`Переместить файлы (${fileIds.length})`} onClose={() => setOpen(false)}>
          <label htmlFor="move-target">Папка назначения</label>
          <FolderPicker
            folders={folders}
            onSelect={(folderId) => {
              setOpen(false)
              bulkMove.mutate(
                { fileIds, folderId },
                {
                  onSuccess: onDone,
                  onError: () => onError?.('Не удалось переместить файлы'),
                },
              )
            }}
          />
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
