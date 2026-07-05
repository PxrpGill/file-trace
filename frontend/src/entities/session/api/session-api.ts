import { api } from '@/shared/api'
import type { User } from '@/entities/user'

export async function fetchCurrentUser(): Promise<User> {
  const { data } = await api.get<User>('/api/auth/me')
  return data
}
