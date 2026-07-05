import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { User } from '@/entities/user'

export function useToggleActiveMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (user: User) => api.patch(`/api/users/${user.id}`, { is_active: !user.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}
