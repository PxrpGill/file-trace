import { useRef } from 'react'

export function UploadFileButton({
  onFilesSelected,
}: {
  onFilesSelected: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

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
          onFilesSelected(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </>
  )
}
