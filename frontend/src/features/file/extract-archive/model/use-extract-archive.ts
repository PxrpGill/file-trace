import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useExtractArchiveMutation(fileId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['extract', fileId],
    mutationFn: () => api.post(`/api/files/${fileId}/extract`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
