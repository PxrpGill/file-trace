import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { BulkDeleteResult } from '@/entities/file'

export function useBulkDeleteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fileIds: number[]) =>
      (await api.post<BulkDeleteResult>('/api/files/bulk-delete', { file_ids: fileIds })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
      queryClient.invalidateQueries({ queryKey: ['file-search'] })
    },
  })
}
