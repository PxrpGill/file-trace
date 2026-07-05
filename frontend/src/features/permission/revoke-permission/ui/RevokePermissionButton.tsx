import { useRevokePermissionMutation } from '../model/use-revoke-permission'

export function RevokePermissionButton({ permissionId }: { permissionId: number }) {
  const revoke = useRevokePermissionMutation()
  return (
    <button className="btn danger small" onClick={() => revoke.mutate(permissionId)}>
      Отозвать
    </button>
  )
}
