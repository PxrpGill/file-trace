import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Role } from '@/entities/user'

export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; full_name: string; password: string; role: Role }) =>
      api.post('/api/users', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}
