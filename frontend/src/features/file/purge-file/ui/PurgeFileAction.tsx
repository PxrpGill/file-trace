import { useState } from 'react'
import { ConfirmModal } from '@/shared/ui'
import type { FileItem } from '@/entities/file'
import { usePurgeFileMutation } from '../model/use-purge-file'

export function PurgeFileAction({ file }: { file: FileItem }) {
  const [open, setOpen] = useState(false)
  const purgeFile = usePurgeFileMutation()

  return (
    <>
      <button className="btn danger small" onClick={() => setOpen(true)}>
        Удалить навсегда
      </button>
      {open && (
        <ConfirmModal
          title="Удалить навсегда"
          text={`Файл «${file.name}» и все его версии будут удалены безвозвратно. Запись об удалении останется в журнале аудита.`}
          confirmLabel="Удалить навсегда"
          onClose={() => setOpen(false)}
          onConfirm={() => {
            purgeFile.mutate(file.id)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
