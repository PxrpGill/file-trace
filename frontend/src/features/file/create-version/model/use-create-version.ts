import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useCreateVersionMutation(fileId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['create-version', fileId],
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: globalThis.File
      onProgress?: (percent: number) => void
    }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/files/${fileId}/versions`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
