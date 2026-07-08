import { useEffect, useRef, useState } from 'react'
import { Archive, Download, Eye, FilePlus2, FolderInput, Pencil, Trash2 } from 'lucide-react'
import { ContextMenu, Modal, TextPromptModal, ConfirmModal } from '@/shared/ui'
import { triggerDownload } from '@/shared/api'
import { flattenTree, useFolderTreeQuery, FolderPicker } from '@/entities/folder'
import type { FileItem } from '@/entities/file'
import { isArchiveFile, getPreviewKind } from '@/entities/file'
import { useUpdateFileMutation } from '@/features/file/rename-move-file'
import { useDeleteFileMutation } from '@/features/file/delete-file'
import { useCreateVersionMutation } from '@/features/file/create-version'
import { useExtractArchiveMutation } from '@/features/file/extract-archive'

type Dialog = 'rename' | 'move' | 'delete' | 'version' | null

export function FileContextMenu({
  file,
  canWrite,
  x,
  y,
  onClose,
  onOpenPreview,
  onError,
}: {
  file: FileItem
  canWrite: boolean
  x: number
  y: number
  onClose: () => void
  onOpenPreview: () => void
  onError: (message: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(true)
  const [dialog, setDialog] = useState<Dialog>(null)
  const versionInputRef = useRef<HTMLInputElement>(null)

  const tree = useFolderTreeQuery()
  const updateFile = useUpdateFileMutation()
  const deleteFile = useDeleteFileMutation()
  const createVersion = useCreateVersionMutation(file.id)
  const extractArchive = useExtractArchiveMutation(file.id)

  useEffect(() => {
    if (dialog === 'version') versionInputRef.current?.click()
  }, [dialog])

  const openDialog = (kind: Dialog) => {
    setMenuOpen(false)
    setDialog(kind)
  }

  const closeAll = () => {
    setDialog(null)
    onClose()
  }

  const previewKind = getPreviewKind(file.name)

  return (
    <>
      {menuOpen && (
        <ContextMenu x={x} y={y} onClose={onClose}>
          {previewKind && (
            <button type="button" onClick={() => { onOpenPreview(); onClose() }}>
              <Eye size={15} aria-hidden strokeWidth={1.75} /> Просмотр
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerDownload(`/api/files/${file.id}/download`)
              onClose()
            }}
          >
            <Download size={15} aria-hidden strokeWidth={1.75} /> Скачать
          </button>
          {canWrite && (
            <>
              <button type="button" onClick={() => openDialog('version')}>
                <FilePlus2 size={15} aria-hidden strokeWidth={1.75} /> Новая версия
              </button>
              {isArchiveFile(file.name) && (
                <button
                  type="button"
                  onClick={() => {
                    extractArchive.mutate(undefined, {
                      onError: () => onError('Не удалось распаковать архив'),
                    })
                    onClose()
                  }}
                >
                  <Archive size={15} aria-hidden strokeWidth={1.75} /> Распаковать
                </button>
              )}
              <button type="button" onClick={() => openDialog('rename')}>
                <Pencil size={15} aria-hidden strokeWidth={1.75} /> Переименовать
              </button>
              <button type="button" onClick={() => openDialog('move')}>
                <FolderInput size={15} aria-hidden strokeWidth={1.75} /> Переместить
              </button>
              <div className="sep" />
              <button type="button" className="danger" onClick={() => openDialog('delete')}>
                <Trash2 size={15} aria-hidden strokeWidth={1.75} /> Удалить
              </button>
            </>
          )}
        </ContextMenu>
      )}

      {dialog === 'version' && (
        <input
          ref={versionInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) {
              closeAll()
              return
            }
            createVersion.mutate(
              { file: f },
              {
                onError: () => onError('Не удалось загрузить новую версию'),
                onSettled: closeAll,
              },
            )
          }}
        />
      )}

      {dialog === 'rename' && (
        <TextPromptModal
          title="Переименовать файл"
          label="Новое имя файла"
          initial={file.name}
          onClose={closeAll}
          onSubmit={(name) => {
            updateFile.mutate({ fileId: file.id, body: { name } })
            closeAll()
          }}
        />
      )}

      {dialog === 'move' && (
        <Modal title={`Переместить «${file.name}»`} onClose={closeAll}>
          <label htmlFor="move-target">Папка назначения</label>
          <FolderPicker
            folders={flattenTree(tree.data ?? [])}
            excludeFolderId={file.folder_id}
            onSelect={(folderId) => {
              updateFile.mutate(
                { fileId: file.id, body: { folder_id: folderId } },
                { onError: () => onError('Нет права на запись в папку назначения') },
              )
              closeAll()
            }}
          />
          <div className="modal-actions">
            <button className="btn secondary" onClick={closeAll}>
              Отмена
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'delete' && (
        <ConfirmModal
          title="Удалить файл"
          text={`Файл «${file.name}» будет перемещён в корзину. Администратор сможет его восстановить.`}
          onClose={closeAll}
          onConfirm={() => {
            deleteFile.mutate(file.id)
            closeAll()
          }}
        />
      )}
    </>
  )
}
