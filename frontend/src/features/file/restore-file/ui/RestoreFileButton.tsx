import type { FileItem } from '@/entities/file'
import { useRestoreFileMutation } from '../model/use-restore-file'

export function RestoreFileButton({ file }: { file: FileItem }) {
  const restoreFile = useRestoreFileMutation()
  return (
    <button className="btn secondary small" onClick={() => restoreFile.mutate(file.id)}>
      Восстановить
    </button>
  )
}
