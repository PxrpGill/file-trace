import { useState } from 'react'
import { useUsersQuery } from '@/entities/user'
import { CreateUserForm } from '@/features/user/create-user'
import { ToggleActiveButton } from '@/features/user/edit-user'
import { ResetPasswordAction } from '@/features/user/reset-password'

export function UsersPage() {
  const [message, setMessage] = useState('')
  const users = useUsersQuery()

  return (
    <div>
      <CreateUserForm onMessage={setMessage} />
      {message && <p className="muted">{message}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Логин</th>
              <th>ФИО</th>
              <th>Роль</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => (
              <tr key={user.id}>
                <td className="mono">{user.username}</td>
                <td>{user.full_name || '—'}</td>
                <td>
                  <span className={`badge ${user.role === 'admin' ? 'admin' : ''}`}>
                    {user.role === 'admin' ? 'админ' : 'пользователь'}
                  </span>
                </td>
                <td>
                  {user.is_active ? (
                    'активен'
                  ) : (
                    <span className="badge blocked">заблокирован</span>
                  )}
                  {user.must_change_password && (
                    <span className="muted"> · ждёт смены пароля</span>
                  )}
                </td>
                <td className="actions">
                  <ResetPasswordAction user={user} onReset={setMessage} />{' '}
                  <ToggleActiveButton user={user} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
