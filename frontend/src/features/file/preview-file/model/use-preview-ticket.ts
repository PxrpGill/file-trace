import { useEffect, useState } from 'react'
import { api } from '@/shared/api'

/**
 * Mints a longer-lived preview ticket for `<video src>` — unlike blob-fetched
 * kinds, the video element issues its own Range requests directly against
 * the URL for the whole playback session, so it can't carry an Authorization
 * header and needs the ticket in the query string instead.
 */
export function usePreviewTicket(enabled: boolean) {
  const [ticket, setTicket] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setTicket(null)
    setError(null)
    api
      .post<{ ticket: string }>('/api/auth/preview-ticket')
      .then((response) => {
        if (!cancelled) setTicket(response.data.ticket)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось открыть предпросмотр')
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { ticket, isLoading: enabled && !ticket && !error, error }
}
