export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'file_upload' | 'file_download' | 'file_new_version'
  | 'file_rename' | 'file_move' | 'file_delete' | 'file_restore' | 'file_purge'
  | 'folder_create' | 'folder_rename' | 'folder_delete'
  | 'user_create' | 'user_update' | 'user_password_reset'
  | 'permission_grant' | 'permission_revoke'

export interface AuditEntry {
  id: number
  user_id: number | null
  username: string | null
  action: AuditAction
  file_id: number | null
  folder_id: number | null
  file_version_id: number | null
  target_user_id: number | null
  ip: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface AuditPage {
  items: AuditEntry[]
  total: number
}
