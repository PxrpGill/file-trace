import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '@/entities/session'
import { useChangePasswordMutation } from '../model/use-change-password'

export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const { refresh } = useSession()
  const changePassword = useChangePasswordMutation()
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
      await changePassword.mutateAsync({ old_password: oldPassword, new_password: newPassword })
      await refresh()
      onSuccess()
    } catch {
      setError('Текущий пароль указан неверно')
    }
  }

  return (
    <form onSubmit={submit}>
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
  )
}
