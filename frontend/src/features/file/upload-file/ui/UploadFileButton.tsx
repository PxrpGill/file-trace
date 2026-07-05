import { useRef } from 'react'
import { useUploadFileMutation } from '../model/use-upload-file'

export function UploadFileButton({
  folderId,
  onError,
}: {
  folderId: number
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadFileMutation(folderId)

  return (
    <>
      <button className="btn" onClick={() => inputRef.current?.click()}>
        Загрузить файл
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) {
            uploadFile.mutate(f, { onError: () => onError?.('Не удалось загрузить файл') })
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
