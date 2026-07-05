import { useRef } from 'react'
import type { FileItem } from '@/entities/file'
import { useCreateVersionMutation } from '../model/use-create-version'

export function UploadVersionButton({
  file,
  onError,
}: {
  file: FileItem
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const createVersion = useCreateVersionMutation()

  return (
    <>
      <button className="btn secondary small" onClick={() => inputRef.current?.click()}>
        Новая версия
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            createVersion.mutate(
              { fileId: file.id, file: f },
              { onError: () => onError?.('Не удалось загрузить новую версию') },
            )
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
