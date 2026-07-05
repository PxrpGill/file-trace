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
