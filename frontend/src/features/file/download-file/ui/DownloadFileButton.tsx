import { triggerDownload } from '@/shared/api'

export function DownloadFileButton({
  url,
  label = 'Скачать',
  disabled,
}: {
  url: string
  label?: string
  disabled?: boolean
}) {
  return (
    <button className="btn secondary small" disabled={disabled} onClick={() => triggerDownload(url)}>
      {label}
    </button>
  )
}
