import { api } from './client'

/**
 * Downloads a protected URL as a native browser download (with progress),
 * by exchanging the session token for a short-lived download ticket first —
 * plain navigation can't carry the Authorization header, but the ticket
 * can ride in the query string safely because it expires in 60s.
 */
export async function triggerDownload(url: string) {
  const { data } = await api.post<{ ticket: string }>('/api/auth/download-ticket')
  const sep = url.includes('?') ? '&' : '?'
  const link = document.createElement('a')
  link.href = `${url}${sep}ticket=${encodeURIComponent(data.ticket)}`
  link.click()
}
