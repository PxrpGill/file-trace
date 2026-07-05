import { useState } from 'react'
import { Modal } from '@/shared/ui'
import type { User } from '@/entities/user'
import { useResetPasswordMutation } from '../model/use-reset-password'

export function ResetPasswordAction({
  user,
  onReset,
}: {
  user: User
  onReset: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const resetPassword = useResetPasswordMutation()

  return (
    <>
      <button
        className="btn secondary small"
        onClick={() => {
          setOpen(true)
          setPassword('')
        }}
      >
        Сбросить пароль
      </button>
      {open && (
        <Modal title={`Сброс пароля: ${user.username}`} onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              resetPassword.mutate(
                { userId: user.id, password },
                {
                  onSuccess: () => {
                    setOpen(false)
                    onReset(`Пароль для ${user.username} сброшен. При входе пользователь задаст новый.`)
                  },
                },
              )
            }}
          >
            <label htmlFor="reset-pass">Временный пароль (минимум 8 символов)</label>
            <input
              id="reset-pass"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                Отмена
              </button>
              <button type="submit" className="btn">
                Сбросить
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
