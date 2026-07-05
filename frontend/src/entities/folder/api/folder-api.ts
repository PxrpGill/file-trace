import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { FolderNode } from '../model/types'

export function useFolderTreeQuery() {
  return useQuery({
    queryKey: ['tree'],
    queryFn: async () => (await api.get<FolderNode[]>('/api/folders/tree')).data,
  })
}
