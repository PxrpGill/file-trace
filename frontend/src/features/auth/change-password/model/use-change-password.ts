import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (body: { old_password: string; new_password: string }) =>
      api.post('/api/auth/change-password', body),
  })
}
