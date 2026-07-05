import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useCreateVersionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fileId, file }: { fileId: number; file: globalThis.File }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/files/${fileId}/versions`, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
