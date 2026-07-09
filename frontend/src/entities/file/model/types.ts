import type { PermissionLevel } from '@/entities/permission'
import type { FolderSearchResult } from '@/entities/folder'

export interface FileVersion {
  id: number
  version_no: number
  size: number
  mime_type: string
  sha256: string
  uploaded_by: number | null
  created_at: string
}

export interface FileItem {
  id: number
  folder_id: number
  name: string
  is_deleted: boolean
  current_version: FileVersion | null
}

export interface FileSearchResult {
  type: 'file'
  id: number
  folder_id: number
  folder_name: string
  name: string
  level: PermissionLevel
  current_version: FileVersion | null
}

export type SearchResult = FileSearchResult | FolderSearchResult

/** dataTransfer MIME-тип для drag-and-drop перемещения файлов на папку в дереве. */
export const FILE_IDS_DRAG_TYPE = 'application/x-filetrace-ids'

export interface BulkFailure {
  file_id: number
  reason: 'not_found' | 'forbidden'
}

export interface BulkMoveResult {
  moved: number[]
  skipped: BulkFailure[]
}

export interface BulkDeleteResult {
  deleted: number[]
  skipped: BulkFailure[]
}

export interface BulkDownloadTicketResult {
  ticket: string
  files: number[]
  skipped: BulkFailure[]
}

const ARCHIVE_EXTENSIONS = ['.zip', '.rar']

export function isArchiveFile(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export type PreviewKind = 'image' | 'video' | 'pdf' | 'office'

const PREVIEW_EXTENSIONS: Record<PreviewKind, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  video: ['.mp4', '.webm'],
  pdf: ['.pdf'],
  office: ['.docx', '.doc', '.xlsx', '.xls'],
}

export function getPreviewKind(name: string): PreviewKind | null {
  const lower = name.trim().toLowerCase()
  for (const kind of Object.keys(PREVIEW_EXTENSIONS) as PreviewKind[]) {
    if (PREVIEW_EXTENSIONS[kind].some((ext) => lower.endsWith(ext))) return kind
  }
  return null
}
