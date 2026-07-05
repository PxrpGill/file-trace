import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { PermissionLevel } from '@/entities/permission'

export function useGrantPermissionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { folder_id: number; user_id: number; level: PermissionLevel }) =>
      api.post('/api/permissions', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  })
}
