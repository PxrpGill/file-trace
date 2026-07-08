import { useState } from 'react'
import type { BulkDownloadTicketResult } from '@/entities/file'
import { triggerBulkDownload } from '../lib/trigger-bulk-download'

export function BulkDownloadAction({
  fileIds,
  onResult,
  onError,
}: {
  fileIds: number[]
  onResult?: (result: BulkDownloadTicketResult) => void
  onError?: (message: string) => void
}) {
  const [pending, setPending] = useState(false)

  return (
    <button
      className="btn secondary small"
      disabled={pending || fileIds.length === 0}
      onClick={async () => {
        setPending(true)
        try {
          const result = await triggerBulkDownload(fileIds)
          onResult?.(result)
        } catch {
          onError?.('Не удалось скачать файлы')
        } finally {
          setPending(false)
        }
      }}
    >
      Скачать
    </button>
  )
}
