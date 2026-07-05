import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { AuditPage } from '../model/types'

export function useAuditLogQuery(params: Record<string, string | number>) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: async () => (await api.get<AuditPage>('/api/audit', { params })).data,
  })
}
