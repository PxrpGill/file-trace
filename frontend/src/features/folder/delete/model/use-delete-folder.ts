import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useDeleteFolderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (folderId: number) => api.delete(`/api/folders/${folderId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree'] }),
  })
}
