import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import type { FolderNode, Permission, PermissionLevel, User } from '../../api/types'
import { flattenTree } from '../../components/FolderTree'

export function PermissionsPage() {
  const queryClient = useQueryClient()
  const [folderId, setFolderId] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [level, setLevel] = useState<PermissionLevel>('read')

  const tree = useQuery({
    queryKey: ['tree'],
    queryFn: async () => (await api.get<FolderNode[]>('/api/folders/tree')).data,
  })
  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/api/users')).data,
  })
  const permissions = useQuery({
    queryKey: ['permissions', folderId],
    enabled: folderId !== null,
    queryFn: async () =>
      (await api.get<Permission[]>('/api/permissions', { params: { folder_id: folderId } })).data,
  })

  const grant = useMutation({
    mutationFn: () =>
      api.post('/api/permissions', { folder_id: folderId, user_id: userId, level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  })
  const revoke = useMutation({
    mutationFn: (id: number) => api.delete(`/api/permissions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  })

  const folders = flattenTree(tree.data ?? [])
  const usernameById = new Map((users.data ?? []).map((u) => [u.id, u.username]))
  const regularUsers = (users.data ?? []).filter((u) => u.role !== 'admin')

  return (
    <div>
      <p className="muted">
        Право на папку действует на всё её поддерево; ближайшее явно выданное право
        имеет приоритет. Администраторы видят всё без явных прав.
      </p>
      <div className="form-row">
        <label>
          Папка
          <select
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Выберите папку…</option>
            {folders.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {' '.repeat(depth * 3)}
                {node.name}
              </option>
            ))}
          </select>
        </label>
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
          onClick={() => grant.mutate()}
        >
          Выдать право
        </button>
      </div>

      {folderId !== null && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Уровень</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(permissions.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    На эту папку права ещё не выдавались
                  </td>
                </tr>
              )}
              {(permissions.data ?? []).map((permission) => (
                <tr key={permission.id}>
                  <td className="mono">{usernameById.get(permission.user_id) ?? permission.user_id}</td>
                  <td>
                    <span className="badge">
                      {permission.level === 'write' ? 'чтение и изменение' : 'чтение'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      className="btn danger small"
                      onClick={() => revoke.mutate(permission.id)}
                    >
                      Отозвать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
