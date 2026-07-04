import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function ChangePasswordPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== repeat) {
      setError('Пароли не совпадают')
      return
    }
    if (newPassword.length < 8) {
      setError('Новый пароль должен быть не короче 8 символов')
      return
    }
    setError('')
    try {
      await api.post('/api/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      await refresh()
      navigate('/', { replace: true })
    } catch {
      setError('Текущий пароль указан неверно')
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Смена пароля</h1>
        <p className="tagline">
          {user?.must_change_password
            ? 'Для продолжения работы задайте собственный пароль'
            : 'Задайте новый пароль'}
        </p>
        <label htmlFor="old">Текущий пароль</label>
        <input
          id="old"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <label htmlFor="new">Новый пароль</label>
        <input
          id="new"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <label htmlFor="repeat">Новый пароль ещё раз</label>
        <input
          id="repeat"
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn">Сохранить пароль</button>
      </form>
    </div>
  )
}
