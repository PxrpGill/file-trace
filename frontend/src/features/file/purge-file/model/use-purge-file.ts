import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function usePurgeFileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileId: number) => api.delete(`/api/files/${fileId}/purge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
