import { useState } from 'react'
import { ConfirmModal } from '@/shared/ui'
import type { FileItem } from '@/entities/file'
import { useDeleteFileMutation } from '../model/use-delete-file'

export function DeleteFileAction({ file, onDeleted }: { file: FileItem; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false)
  const deleteFile = useDeleteFileMutation()

  return (
    <>
      <button className="btn danger small" onClick={() => setOpen(true)}>
        Удалить
      </button>
      {open && (
        <ConfirmModal
          title="Удалить файл"
          text={`Файл «${file.name}» будет перемещён в корзину. Администратор сможет его восстановить.`}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false)
            deleteFile.mutate(file.id, { onSuccess: onDeleted })
          }}
        />
      )}
    </>
  )
}
