import { NavLink, Outlet } from 'react-router-dom'

export function AdminLayout() {
  return (
    <div className="admin">
      <nav className="admin-tabs">
        <NavLink to="users">Пользователи</NavLink>
        <NavLink to="permissions">Права доступа</NavLink>
        <NavLink to="trash">Корзина</NavLink>
        <NavLink to="audit">Журнал аудита</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
