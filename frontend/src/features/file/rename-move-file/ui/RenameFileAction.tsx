import { useState } from 'react'
import { TextPromptModal } from '@/shared/ui'
import type { FileItem } from '@/entities/file'
import { useUpdateFileMutation } from '../model/use-update-file'

export function RenameFileAction({ file }: { file: FileItem }) {
  const [open, setOpen] = useState(false)
  const updateFile = useUpdateFileMutation()

  return (
    <>
      <button className="btn secondary small" onClick={() => setOpen(true)}>
        Переименовать
      </button>
      {open && (
        <TextPromptModal
          title="Переименовать файл"
          label="Новое имя файла"
          initial={file.name}
          onClose={() => setOpen(false)}
          onSubmit={(name) => {
            setOpen(false)
            updateFile.mutate({ fileId: file.id, body: { name } })
          }}
        />
      )}
    </>
  )
}
