import type { FileItem } from '@/entities/file'
import { useExtractArchiveMutation } from '../model/use-extract-archive'

export function ExtractArchiveAction({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
  const extractArchive = useExtractArchiveMutation(file.id)

  return (
    <button
      className="btn secondary small"
      disabled={disabled || extractArchive.isPending}
      onClick={() =>
        extractArchive.mutate(undefined, {
          onError: () => onError?.('Не удалось распаковать архив'),
        })
      }
    >
      Распаковать
    </button>
  )
}
