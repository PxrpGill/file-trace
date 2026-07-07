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
  id: number
  folder_id: number
  folder_name: string
  name: string
  current_version: FileVersion | null
}

const ARCHIVE_EXTENSIONS = ['.zip', '.rar']

export function isArchiveFile(name: string): boolean {
  const lower = name.toLowerCase()
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
  const lower = name.toLowerCase()
  for (const kind of Object.keys(PREVIEW_EXTENSIONS) as PreviewKind[]) {
    if (PREVIEW_EXTENSIONS[kind].some((ext) => lower.endsWith(ext))) return kind
  }
  return null
}
