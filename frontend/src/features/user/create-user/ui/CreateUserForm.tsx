import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Role } from '@/entities/user'
import { useCreateUserMutation } from '../model/use-create-user'

export function CreateUserForm({ onMessage }: { onMessage: (message: string) => void }) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('user')
  const createUser = useCreateUserMutation()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onMessage('')
    createUser.mutate(
      { username, full_name: fullName, password, role },
      {
        onSuccess: () => {
          setUsername('')
          setFullName('')
          setPassword('')
          setRole('user')
          onMessage('Пользователь создан. При первом входе он сменит пароль.')
        },
        onError: (err: unknown) => {
          const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          onMessage(detail ?? 'Не удалось создать пользователя')
        },
      },
    )
  }

  return (
    <form className="form-row" onSubmit={submit}>
      <label>
        Имя пользователя
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
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
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="user">Пользователь</option>
          <option value="admin">Администратор</option>
        </select>
      </label>
      <button className="btn">Создать пользователя</button>
    </form>
  )
}
