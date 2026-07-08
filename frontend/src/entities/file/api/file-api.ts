import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { AuditEntry } from '@/entities/audit'
import type { FileItem, FileSearchResult, FileVersion } from '../model/types'

const PAGE_SIZE = 200

interface Page<T> {
  items: T[]
  offset: number
  total: number
}

function totalFrom(headers: Record<string, unknown>, fallback: number): number {
  const raw = headers['x-total-count']
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nextOffset<T>(lastPage: Page<T>): number | undefined {
  const loaded = lastPage.offset + lastPage.items.length
  return loaded < lastPage.total ? loaded : undefined
}

export function useFilesQuery(folderId: number | null) {
  return useInfiniteQuery({
    queryKey: ['files', folderId],
    enabled: folderId !== null,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page<FileItem>> => {
      const res = await api.get<FileItem[]>(`/api/folders/${folderId}/files`, {
        params: { limit: PAGE_SIZE, offset: pageParam },
      })
      return { items: res.data, offset: pageParam, total: totalFrom(res.headers, res.data.length) }
    },
    getNextPageParam: nextOffset,
  })
}

export function useFileSearchQuery(query: string) {
  const term = query.trim()
  return useQuery({
    queryKey: ['file-search', term],
    enabled: term.length >= 2,
    queryFn: async () =>
      (await api.get<FileSearchResult[]>('/api/files/search', { params: { q: term } })).data,
  })
}

export function useTrashQuery() {
  return useInfiniteQuery({
    queryKey: ['trash'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page<FileItem>> => {
      const res = await api.get<FileItem[]>('/api/files/trash', {
        params: { limit: PAGE_SIZE, offset: pageParam },
      })
      return { items: res.data, offset: pageParam, total: totalFrom(res.headers, res.data.length) }
    },
    getNextPageParam: nextOffset,
  })
}

export function useFileVersionsQuery(fileId: number) {
  return useQuery({
    queryKey: ['versions', fileId],
    queryFn: async () => (await api.get<FileVersion[]>(`/api/files/${fileId}/versions`)).data,
  })
}

export function useFileAuditQuery(fileId: number) {
  return useInfiniteQuery({
    queryKey: ['file-audit', fileId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page<AuditEntry>> => {
      const res = await api.get<AuditEntry[]>(`/api/files/${fileId}/audit`, {
        params: { limit: PAGE_SIZE, offset: pageParam },
      })
      return { items: res.data, offset: pageParam, total: totalFrom(res.headers, res.data.length) }
    },
    getNextPageParam: nextOffset,
  })
}
