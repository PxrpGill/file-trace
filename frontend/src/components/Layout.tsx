import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <span className="seal" aria-hidden />
          File-Trace
        </span>
        <nav>
          <NavLink to="/" end>
            Файлы
          </NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Администрирование</NavLink>}
        </nav>
        <span className="who">
          <b>{user?.full_name || user?.username}</b>
          {user?.role === 'admin' && ' · администратор'}
        </span>
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
      </header>
      <Outlet />
    </div>
  )
}
