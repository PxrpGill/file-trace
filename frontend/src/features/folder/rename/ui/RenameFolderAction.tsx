import { useState } from 'react'
import { TextPromptModal } from '@/shared/ui'
import type { FolderNode } from '@/entities/folder'
import { useRenameFolderMutation } from '../model/use-rename-folder'

export function RenameFolderAction({
  folder,
  onRenamed,
  onError,
}: {
  folder: FolderNode
  onRenamed: (name: string) => void
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const renameFolder = useRenameFolderMutation()

  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        Переименовать
      </button>
      {open && (
        <TextPromptModal
          title="Переименовать папку"
          label="Новое название"
          initial={folder.name}
          onClose={() => setOpen(false)}
          onSubmit={(name) => {
            setOpen(false)
            renameFolder.mutate(
              { folderId: folder.id, name },
              {
                onSuccess: () => onRenamed(name),
                onError: () => onError?.('Не удалось переименовать папку'),
              },
            )
          }}
        />
      )}
    </>
  )
}
