import axios from 'axios'

const TOKEN_KEY = 'filetrace_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token === null) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, token)
}

export const api = axios.create()

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && window.location.pathname !== '/login') {
    setToken(null)
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

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
