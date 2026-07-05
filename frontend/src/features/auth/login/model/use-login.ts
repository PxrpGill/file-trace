import { useMutation } from '@tanstack/react-query'
import { api, setToken } from '@/shared/api'
import { useSession } from '@/entities/session'

export function useLoginMutation() {
  const { refresh } = useSession()
  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const { data } = await api.post('/api/auth/login', { username, password })
      setToken(data.access_token)
      await refresh()
      return { mustChange: data.must_change_password as boolean }
    },
  })
}
