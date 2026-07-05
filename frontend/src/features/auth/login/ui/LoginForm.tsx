import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLoginMutation } from '../model/use-login'

export function LoginForm({ onSuccess }: { onSuccess: (mustChange: boolean) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = useLoginMutation()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const { mustChange } = await login.mutateAsync({ username, password })
      onSuccess(mustChange)
    } catch {
      setError('Неверное имя пользователя или пароль')
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="username">Имя пользователя</label>
      <input
        id="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        autoFocus
        required
      />
      <label htmlFor="password">Пароль</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error && <p className="error-text">{error}</p>}
      <button className="btn" disabled={login.isPending}>
        Войти
      </button>
    </form>
  )
}
