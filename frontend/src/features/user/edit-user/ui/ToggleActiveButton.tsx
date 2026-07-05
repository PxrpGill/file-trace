import type { User } from '@/entities/user'
import { useToggleActiveMutation } from '../model/use-toggle-active'

export function ToggleActiveButton({ user }: { user: User }) {
  const toggleActive = useToggleActiveMutation()
  return (
    <button
      className={`btn small ${user.is_active ? 'danger' : 'secondary'}`}
      onClick={() => toggleActive.mutate(user)}
    >
      {user.is_active ? 'Заблокировать' : 'Разблокировать'}
    </button>
  )
}
