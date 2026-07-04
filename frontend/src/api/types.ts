export type Role = 'admin' | 'user'
export type PermissionLevel = 'read' | 'write'

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  is_active: boolean
  must_change_password: boolean
}

export interface FolderNode {
  id: number
  parent_id: number | null
  name: string
  level: PermissionLevel
  children: FolderNode[]
}

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

export interface Permission {
  id: number
  folder_id: number
  user_id: number
  level: PermissionLevel
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Вход',
  login_failed: 'Неудачный вход',
  logout: 'Выход',
  file_upload: 'Загрузка файла',
  file_download: 'Скачивание',
  file_new_version: 'Новая версия',
  file_rename: 'Переименование файла',
  file_move: 'Перемещение файла',
  file_delete: 'Удаление файла',
  file_restore: 'Восстановление файла',
  file_purge: 'Окончательное удаление',
  folder_create: 'Создание папки',
  folder_rename: 'Переименование папки',
  folder_delete: 'Удаление папки',
  user_create: 'Создание пользователя',
  user_update: 'Изменение пользователя',
  user_password_reset: 'Сброс пароля',
  permission_grant: 'Выдача права',
  permission_revoke: 'Отзыв права',
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes
  let unit = ''
  for (const u of units) {
    value /= 1024
    unit = u
    if (value < 1024) break
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`
}

export function formatDate(iso: string): string {
  // метки времени приходят в UTC; sqlite отдаёт их без указания зоны
  const utc = /Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
  return new Date(utc).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
