import { useEffect, useState } from 'react'
import { api } from '@/shared/api'

/**
 * Fetches a preview URL as an authenticated blob (interceptor attaches the
 * Authorization header) and exposes it as an object URL for <img>/<iframe>.
 * Not a react-query hook — an object URL needs a deterministic owner to
 * revoke it, which the query cache doesn't give for free.
 */
export function usePreviewObjectUrl(url: string, enabled: boolean) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let created: string | null = null
    setObjectUrl(null)
    setError(null)
    api
      .get(url, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return
        created = URL.createObjectURL(response.data as Blob)
        setObjectUrl(created)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить предпросмотр')
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [url, enabled])

  return { objectUrl, isLoading: enabled && !objectUrl && !error, error }
}
