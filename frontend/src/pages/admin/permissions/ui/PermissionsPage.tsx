import { useState } from 'react'
import { flattenTree, useFolderTreeQuery } from '@/entities/folder'
import { useUsersQuery } from '@/entities/user'
import { usePermissionsQuery } from '@/entities/permission'
import { GrantPermissionForm } from '@/features/permission/grant-permission'
import { RevokePermissionButton } from '@/features/permission/revoke-permission'

export function PermissionsPage() {
  const [folderId, setFolderId] = useState<number | null>(null)

  const tree = useFolderTreeQuery()
  const users = useUsersQuery()
  const permissions = usePermissionsQuery(folderId)

  const folders = flattenTree(tree.data ?? [])
  const usernameById = new Map((users.data ?? []).map((u) => [u.id, u.username]))

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
                {' '.repeat(depth * 3)}
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <GrantPermissionForm folderId={folderId} />
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
                    <RevokePermissionButton permissionId={permission.id} />
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
