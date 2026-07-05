import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useRevokePermissionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (permissionId: number) => api.delete(`/api/permissions/${permissionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  })
}
