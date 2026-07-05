export type Role = 'admin' | 'user'

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  is_active: boolean
  must_change_password: boolean
}
