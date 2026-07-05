import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useRestoreFileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileId: number) => api.post(`/api/files/${fileId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
