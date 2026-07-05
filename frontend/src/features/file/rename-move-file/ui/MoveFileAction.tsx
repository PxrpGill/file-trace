import { useState } from 'react'
import { Modal } from '@/shared/ui'
import type { FileItem } from '@/entities/file'
import { flattenTree, useFolderTreeQuery } from '@/entities/folder'
import { useUpdateFileMutation } from '../model/use-update-file'

export function MoveFileAction({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tree = useFolderTreeQuery()
  const updateFile = useUpdateFileMutation()
  const folders = flattenTree(tree.data ?? [])

  return (
    <>
      <button className="btn secondary small" disabled={disabled} onClick={() => setOpen(true)}>
        Переместить
      </button>
      {open && (
        <Modal title={`Переместить «${file.name}»`} onClose={() => setOpen(false)}>
          <label htmlFor="move-target">Папка назначения</label>
          <select
            id="move-target"
            defaultValue=""
            onChange={(e) => {
              const folderId = Number(e.target.value)
              if (!folderId) return
              setOpen(false)
              updateFile.mutate(
                { fileId: file.id, body: { folder_id: folderId } },
                { onError: () => onError?.('Нет права на запись в папку назначения') },
              )
            }}
          >
            <option value="" disabled>
              Выберите папку…
            </option>
            {folders
              .filter(({ node }) => node.level === 'write' && node.id !== file.folder_id)
              .map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {' '.repeat(depth * 3)}
                  {node.name}
                </option>
              ))}
          </select>
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
