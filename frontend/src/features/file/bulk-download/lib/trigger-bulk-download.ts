import { api } from '@/shared/api'
import type { BulkDownloadTicketResult } from '@/entities/file'

/**
 * Как triggerDownload() — обменивает список file_ids на короткоживущий
 * scoped-тикет, затем переходит по ссылке с ?ticket= обычной навигацией
 * (не fetch+blob), чтобы браузер показывал нативный прогресс скачивания ZIP.
 */
export async function triggerBulkDownload(fileIds: number[]): Promise<BulkDownloadTicketResult> {
  const { data } = await api.post<BulkDownloadTicketResult>('/api/files/bulk-download-ticket', {
    file_ids: fileIds,
  })
  const link = document.createElement('a')
  link.href = `/api/files/bulk-download-zip?ticket=${encodeURIComponent(data.ticket)}`
  link.click()
  return data
}
