import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useUploadTreeMutation } from '../model/use-upload-tree'

export function UploadTreeButton({
  folderId,
  onError,
}: {
  folderId: number
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploadTree = useUploadTreeMutation(folderId)
  const [progress, setProgress] = useState<number | null>(null)

  if (progress !== null) {
    return (
      <span
        className="version-progress"
        style={{ '--pct': `${progress}%` } as CSSProperties}
      >
        <span className="version-progress-fill" />
        <span className="version-progress-label">{progress}%</span>
      </span>
    )
  }

  return (
    <>
      <button className="btn secondary" onClick={() => inputRef.current?.click()}>
        Загрузить папку
      </button>
      <input
        ref={(node) => {
          inputRef.current = node
          node?.setAttribute('webkitdirectory', '')
        }}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            setProgress(0)
            uploadTree.mutate(
              { files, onProgress: setProgress },
              {
                onError: () => onError?.('Не удалось загрузить папку'),
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
