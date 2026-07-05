export type PermissionLevel = 'read' | 'write'

export interface Permission {
  id: number
  folder_id: number
  user_id: number
  level: PermissionLevel
}
