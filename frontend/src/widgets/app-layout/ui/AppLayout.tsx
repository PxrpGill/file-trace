import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '@/entities/session'
import { LogoutButton } from '@/features/auth/logout'
import { GlobalSearch } from './GlobalSearch'

export function AppLayout() {
  const { user } = useSession()

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
        <GlobalSearch />
        <span className="who">
          <b>{user?.full_name || user?.username}</b>
          {user?.role === 'admin' && ' · администратор'}
        </span>
        <LogoutButton />
      </header>
      <Outlet />
    </div>
  )
}
