import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useCreateFolderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; parent_id: number | null }) => api.post('/api/folders', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree'] }),
  })
}
