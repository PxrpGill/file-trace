import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useUploadFileMutation(folderId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['upload-file'],
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: globalThis.File
      onProgress?: (percent: number) => void
    }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/folders/${folderId}/files`, form, {
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
