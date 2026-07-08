import { useState } from 'react'
import { ConfirmModal } from '@/shared/ui'
import type { BulkDeleteResult } from '@/entities/file'
import { useBulkDeleteMutation } from '../model/use-bulk-delete-file'

export function BulkDeleteAction({
  fileIds,
  onDone,
}: {
  fileIds: number[]
  onDone?: (result: BulkDeleteResult) => void
}) {
  const [open, setOpen] = useState(false)
  const bulkDelete = useBulkDeleteMutation()

  return (
    <>
      <button
        className="btn danger small"
        disabled={fileIds.length === 0}
        onClick={() => setOpen(true)}
      >
        Удалить
      </button>
      {open && (
        <ConfirmModal
          title="Удалить файлы"
          text={`${fileIds.length} файл(ов) будет перемещено в корзину. Администратор сможет их восстановить.`}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false)
            bulkDelete.mutate(fileIds, { onSuccess: onDone })
          }}
        />
      )}
    </>
  )
}
