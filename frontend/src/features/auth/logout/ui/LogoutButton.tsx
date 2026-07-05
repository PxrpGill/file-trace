import { useNavigate } from 'react-router-dom'
import { useLogout } from '../model/use-logout'

export function LogoutButton() {
  const navigate = useNavigate()
  const logout = useLogout()
  return (
    <button
      className="btn secondary small"
      style={{ color: '#c8d2e0', borderColor: '#3d4f6b' }}
      onClick={() => {
        logout()
        navigate('/login')
      }}
    >
      Выйти
    </button>
  )
}
