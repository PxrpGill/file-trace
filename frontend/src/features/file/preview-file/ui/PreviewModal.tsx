import type { FileItem } from '@/entities/file'
import { getPreviewKind } from '@/entities/file'
import { Modal } from '@/shared/ui'
import { triggerDownload } from '@/shared/api'
import { usePreviewObjectUrl } from '../model/use-preview-object-url'
import { usePreviewTicket } from '../model/use-preview-ticket'

export function PreviewModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const kind = getPreviewKind(file.name)
  const previewUrl = `/api/files/${file.id}/preview`
  const downloadUrl = `/api/files/${file.id}/download`

  const blob = usePreviewObjectUrl(
    previewUrl,
    kind === 'image' || kind === 'pdf' || kind === 'office',
  )
  const ticket = usePreviewTicket(kind === 'video')

  const fallback = (message: string) => (
    <div className="preview-fallback">
      <p>{message}</p>
      <button className="btn secondary small" onClick={() => triggerDownload(downloadUrl)}>
        Скачать
      </button>
    </div>
  )

  const renderBody = () => {
    if (kind === null) return fallback('Предпросмотр для этого файла недоступен.')

    if (kind === 'image' || kind === 'pdf' || kind === 'office') {
      if (blob.error) return fallback(blob.error)
      if (!blob.objectUrl) {
        return (
          <div className="preview-loading">
            {kind === 'office' ? 'Конвертация документа может занять до минуты…' : 'Загрузка…'}
          </div>
        )
      }
      return kind === 'image' ? (
        <img src={blob.objectUrl} alt={file.name} />
      ) : (
        <iframe src={blob.objectUrl} title={file.name} />
      )
    }

    if (kind === 'video') {
      if (ticket.error) return fallback(ticket.error)
      if (!ticket.ticket) return <div className="preview-loading">Загрузка…</div>
      const src = `${previewUrl}?ticket=${encodeURIComponent(ticket.ticket)}`
      return <video src={src} controls />
    }

    return null
  }

  return (
    <Modal title={file.name} onClose={onClose} className="modal-preview">
      <div className="preview-body">{renderBody()}</div>
    </Modal>
  )
}
