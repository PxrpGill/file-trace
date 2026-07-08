import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { BulkMoveResult } from '@/entities/file'

export function useBulkMoveMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fileIds, folderId }: { fileIds: number[]; folderId: number }) =>
      (
        await api.post<BulkMoveResult>('/api/files/bulk-move', {
          file_ids: fileIds,
          folder_id: folderId,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
      queryClient.invalidateQueries({ queryKey: ['file-search'] })
    },
  })
}
