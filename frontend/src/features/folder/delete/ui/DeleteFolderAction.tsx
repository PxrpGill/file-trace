import { useState } from 'react'
import { ConfirmModal } from '@/shared/ui'
import type { FolderNode } from '@/entities/folder'
import { useDeleteFolderMutation } from '../model/use-delete-folder'

export function DeleteFolderAction({
  folder,
  onDeleted,
  onError,
}: {
  folder: FolderNode
  onDeleted: () => void
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const deleteFolder = useDeleteFolderMutation()

  return (
    <>
      <button className="btn danger" onClick={() => setOpen(true)}>
        Удалить папку
      </button>
      {open && (
        <ConfirmModal
          title="Удалить папку"
          text={`Папка «${folder.name}» будет удалена. Удалить можно только пустую папку.`}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false)
            deleteFolder.mutate(folder.id, {
              onSuccess: onDeleted,
              onError: () => onError?.('Папка не пуста — сначала удалите её содержимое'),
            })
          }}
        />
      )}
    </>
  )
}
