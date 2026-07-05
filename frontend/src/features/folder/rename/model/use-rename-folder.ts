import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useRenameFolderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ folderId, name }: { folderId: number; name: string }) =>
      api.patch(`/api/folders/${folderId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree'] }),
  })
}
