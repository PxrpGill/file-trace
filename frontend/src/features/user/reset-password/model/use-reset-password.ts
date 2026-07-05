import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useResetPasswordMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      api.post(`/api/users/${userId}/reset-password`, { password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}
