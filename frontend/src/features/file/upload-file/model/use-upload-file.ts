import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useUploadFileMutation(folderId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: globalThis.File) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/folders/${folderId}/files`, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
