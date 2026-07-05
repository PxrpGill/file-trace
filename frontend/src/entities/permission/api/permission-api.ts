import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Permission } from '../model/types'

export function usePermissionsQuery(folderId: number | null) {
  return useQuery({
    queryKey: ['permissions', folderId],
    enabled: folderId !== null,
    queryFn: async () =>
      (await api.get<Permission[]>('/api/permissions', { params: { folder_id: folderId } })).data,
  })
}
