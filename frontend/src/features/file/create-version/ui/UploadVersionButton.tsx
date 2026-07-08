import { useRef, useState } from 'react'
import type { FileItem } from '@/entities/file'
import { ProgressBar } from '@/shared/ui'
import { useCreateVersionMutation } from '../model/use-create-version'

export function UploadVersionButton({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const createVersion = useCreateVersionMutation(file.id)
  const [progress, setProgress] = useState<number | null>(null)

  if (progress !== null) {
    return <ProgressBar percent={progress} />
  }

  return (
    <>
      <button
        className="btn secondary small"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Новая версия
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setProgress(0)
            createVersion.mutate(
              { file: f, onProgress: setProgress },
              {
                onError: () => onError?.('Не удалось загрузить новую версию'),
                onSettled: () => setProgress(null),
              },
            )
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
