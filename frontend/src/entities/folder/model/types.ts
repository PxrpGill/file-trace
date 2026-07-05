import type { PermissionLevel } from '@/entities/permission'

export interface FolderNode {
  id: number
  parent_id: number | null
  name: string
  level: PermissionLevel
  children: FolderNode[]
}
