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

/** Downloads a protected URL as a browser attachment, keeping the auth header. */
export async function downloadBlob(url: string, fallbackName: string) {
  const response = await api.get(url, { responseType: 'blob' })
  const disposition: string = response.headers['content-disposition'] ?? ''
  const match = disposition.match(/filename\*=UTF-8''(.+)$/)
  const name = match ? decodeURIComponent(match[1]) : fallbackName
  const link = document.createElement('a')
  link.href = URL.createObjectURL(response.data)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
