import { setToken } from '@/shared/api'
import { useSession } from '@/entities/session'

export function useLogout() {
  const { setUser } = useSession()
  return () => {
    setToken(null)
    setUser(null)
  }
}
