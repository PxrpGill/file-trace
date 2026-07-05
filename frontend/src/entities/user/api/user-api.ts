import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { User } from '../model/types'

export function useUsersQuery() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/api/users')).data,
  })
}
