import { useNavigate } from 'react-router-dom'
import { useSession } from '@/entities/session'
import { ChangePasswordForm } from '@/features/auth/change-password'

export function ChangePasswordPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Смена пароля</h1>
        <p className="tagline">
          {user?.must_change_password
            ? 'Для продолжения работы задайте собственный пароль'
            : 'Задайте новый пароль'}
        </p>
        <ChangePasswordForm onSuccess={() => navigate('/', { replace: true })} />
      </div>
    </div>
  )
}
