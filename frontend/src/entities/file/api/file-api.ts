import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { AuditEntry } from '@/entities/audit'
import type { FileItem, FileVersion } from '../model/types'

export function useFilesQuery(folderId: number | null) {
  return useQuery({
    queryKey: ['files', folderId],
    enabled: folderId !== null,
    queryFn: async () => (await api.get<FileItem[]>(`/api/folders/${folderId}/files`)).data,
  })
}

export function useTrashQuery() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: async () => (await api.get<FileItem[]>('/api/files/trash')).data,
  })
}

export function useFileVersionsQuery(fileId: number) {
  return useQuery({
    queryKey: ['versions', fileId],
    queryFn: async () => (await api.get<FileVersion[]>(`/api/files/${fileId}/versions`)).data,
  })
}

export function useFileAuditQuery(fileId: number) {
  return useQuery({
    queryKey: ['file-audit', fileId],
    queryFn: async () => (await api.get<AuditEntry[]>(`/api/files/${fileId}/audit`)).data,
  })
}
