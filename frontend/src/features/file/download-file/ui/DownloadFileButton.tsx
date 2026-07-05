import { triggerDownload } from '@/shared/api'

export function DownloadFileButton({ url, label = 'Скачать' }: { url: string; label?: string }) {
  return (
    <button className="btn secondary small" onClick={() => triggerDownload(url)}>
      {label}
    </button>
  )
}
