import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useSession } from '@/entities/session'
import { LoginPage } from '@/pages/login'
import { ChangePasswordPage } from '@/pages/change-password'
import { BrowserPage } from '@/pages/browser'
import { SearchPage } from '@/pages/search'
import { UsersPage } from '@/pages/admin/users'
import { PermissionsPage } from '@/pages/admin/permissions'
import { TrashPage } from '@/pages/admin/trash'
import { AuditPage } from '@/pages/admin/audit'
import { AppLayout } from '@/widgets/app-layout'
import { AdminLayout } from '@/widgets/admin-layout'

function RequireAuth() {
  const { user, loading } = useSession()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  return <Outlet />
}

function RequireAdmin() {
  const { user } = useSession()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<BrowserPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="permissions" element={<PermissionsPage />} />
              <Route path="trash" element={<TrashPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
