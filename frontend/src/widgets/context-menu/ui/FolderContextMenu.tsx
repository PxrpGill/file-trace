import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { ContextMenu, TextPromptModal, ConfirmModal } from '@/shared/ui'
import type { FolderNode } from '@/entities/folder'
import { useRenameFolderMutation } from '@/features/folder/rename'
import { useDeleteFolderMutation } from '@/features/folder/delete'

type Dialog = 'rename' | 'delete' | null

export function FolderContextMenu({
  folder,
  canWrite,
  x,
  y,
  onClose,
  onRenamed,
  onDeleted,
  onError,
}: {
  folder: FolderNode
  canWrite: boolean
  x: number
  y: number
  onClose: () => void
  onRenamed: (name: string) => void
  onDeleted: () => void
  onError: (message: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(true)
  const [dialog, setDialog] = useState<Dialog>(null)

  const renameFolder = useRenameFolderMutation()
  const deleteFolder = useDeleteFolderMutation()

  const openDialog = (kind: Dialog) => {
    setMenuOpen(false)
    setDialog(kind)
  }

  const closeAll = () => {
    setDialog(null)
    onClose()
  }

  if (!canWrite) return null

  return (
    <>
      {menuOpen && (
        <ContextMenu x={x} y={y} onClose={onClose}>
          <button type="button" onClick={() => openDialog('rename')}>
            <Pencil size={15} aria-hidden strokeWidth={1.75} /> Переименовать
          </button>
          <button type="button" className="danger" onClick={() => openDialog('delete')}>
            <Trash2 size={15} aria-hidden strokeWidth={1.75} /> Удалить
          </button>
        </ContextMenu>
      )}

      {dialog === 'rename' && (
        <TextPromptModal
          title="Переименовать папку"
          label="Новое название"
          initial={folder.name}
          onClose={closeAll}
          onSubmit={(name) => {
            renameFolder.mutate(
              { folderId: folder.id, name },
              {
                onSuccess: () => onRenamed(name),
                onError: () => onError('Не удалось переименовать папку'),
              },
            )
            closeAll()
          }}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmModal
          title="Удалить папку"
          text={`Папка «${folder.name}» будет удалена. Удалить можно только пустую папку.`}
          onClose={closeAll}
          onConfirm={() => {
            deleteFolder.mutate(folder.id, {
              onSuccess: onDeleted,
              onError: () => onError('Папка не пуста — сначала удалите её содержимое'),
            })
            closeAll()
          }}
        />
      )}
    </>
  )
}
