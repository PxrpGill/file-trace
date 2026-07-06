import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useUploadTreeMutation(folderId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      files,
      onProgress,
    }: {
      files: FileList
      onProgress?: (percent: number) => void
    }) => {
      const form = new FormData()
      for (const file of Array.from(files)) {
        form.append('files', file, file.webkitRelativePath || file.name)
      }
      await api.post(`/api/folders/${folderId}/upload-tree`, form, {
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
