import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api/client'
import type { User } from '../../api/types'
import { Modal } from '../../components/Modal'

export function UsersPage() {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [message, setMessage] = useState('')
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/api/users')).data,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/users', { username, full_name: fullName, password, role }),
    onSuccess: () => {
      invalidate()
      setUsername('')
      setFullName('')
      setPassword('')
      setRole('user')
      setMessage('Пользователь создан. При первом входе он сменит пароль.')
    },
    onError: (error: { response?: { data?: { detail?: string } } }) =>
      setMessage(error.response?.data?.detail ?? 'Не удалось создать пользователя'),
  })

  const toggleActive = useMutation({
    mutationFn: (user: User) =>
      api.patch(`/api/users/${user.id}`, { is_active: !user.is_active }),
    onSuccess: invalidate,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setMessage('')
    create.mutate()
  }

  return (
    <div>
      <form className="form-row" onSubmit={submit}>
        <label>
          Имя пользователя
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          ФИО
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Временный пароль
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Роль
          <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}>
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
        <button className="btn">Создать пользователя</button>
      </form>
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
                  <button
                    className="btn secondary small"
                    onClick={() => {
                      setResetTarget(user)
                      setResetPassword('')
                    }}
                  >
                    Сбросить пароль
                  </button>{' '}
                  <button
                    className={`btn small ${user.is_active ? 'danger' : 'secondary'}`}
                    onClick={() => toggleActive.mutate(user)}
                  >
                    {user.is_active ? 'Заблокировать' : 'Разблокировать'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <Modal
          title={`Сброс пароля: ${resetTarget.username}`}
          onClose={() => setResetTarget(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await api.post(`/api/users/${resetTarget.id}/reset-password`, {
                password: resetPassword,
              })
              setResetTarget(null)
              setMessage(
                `Пароль для ${resetTarget.username} сброшен. При входе пользователь задаст новый.`,
              )
              invalidate()
            }}
          >
            <label htmlFor="reset-pass">Временный пароль (минимум 8 символов)</label>
            <input
              id="reset-pass"
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setResetTarget(null)}>
                Отмена
              </button>
              <button type="submit" className="btn">
                Сбросить
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
