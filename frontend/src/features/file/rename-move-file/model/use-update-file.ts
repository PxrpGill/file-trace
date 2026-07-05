import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useUpdateFileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ fileId, body }: { fileId: number; body: { name?: string; folder_id?: number } }) =>
      api.patch(`/api/files/${fileId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
