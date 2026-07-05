import { useState } from 'react'
import { useUsersQuery } from '@/entities/user'
import type { PermissionLevel } from '@/entities/permission'
import { useGrantPermissionMutation } from '../model/use-grant-permission'

export function GrantPermissionForm({ folderId }: { folderId: number | null }) {
  const [userId, setUserId] = useState<number | null>(null)
  const [level, setLevel] = useState<PermissionLevel>('read')
  const users = useUsersQuery()
  const grant = useGrantPermissionMutation()
  const regularUsers = (users.data ?? []).filter((u) => u.role !== 'admin')

  return (
    <>
      <label>
        Пользователь
        <select
          value={userId ?? ''}
          onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Выберите пользователя…</option>
          {regularUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
              {u.full_name ? ` — ${u.full_name}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Уровень
        <select value={level} onChange={(e) => setLevel(e.target.value as PermissionLevel)}>
          <option value="read">Чтение</option>
          <option value="write">Чтение и изменение</option>
        </select>
      </label>
      <button
        className="btn"
        disabled={folderId === null || userId === null}
        onClick={() => {
          if (folderId !== null && userId !== null) grant.mutate({ folder_id: folderId, user_id: userId, level })
        }}
      >
        Выдать право
      </button>
    </>
  )
}
