import { useNavigate } from 'react-router-dom'
import { LoginForm } from '@/features/auth/login'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>File-Trace</h1>
        <p className="tagline">Хранилище файлов · каждое действие оставляет след</p>
        <LoginForm
          onSuccess={(mustChange) => navigate(mustChange ? '/change-password' : '/', { replace: true })}
        />
      </div>
    </div>
  )
}
