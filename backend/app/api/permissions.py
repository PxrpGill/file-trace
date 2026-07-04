from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import AdminUser, DbDep, client_ip
from app.models import AuditAction, Folder, FolderPermission, User
from app.schemas.folders import PermissionGrant, PermissionOut
from app.services import audit

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionOut])
def list_permissions(
    db: DbDep, _: AdminUser, folder_id: int | None = None
) -> list[FolderPermission]:
    query = db.query(FolderPermission)
    if folder_id is not None:
        query = query.filter_by(folder_id=folder_id)
    return query.all()


@router.post("", response_model=PermissionOut)
def grant_permission(
    body: PermissionGrant, db: DbDep, admin: AdminUser, request: Request
) -> FolderPermission:
    if db.get(Folder, body.folder_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if db.get(User, body.user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    permission = (
        db.query(FolderPermission)
        .filter_by(folder_id=body.folder_id, user_id=body.user_id)
        .first()
    )
    if permission is None:
        permission = FolderPermission(
            folder_id=body.folder_id,
            user_id=body.user_id,
            level=body.level,
            granted_by=admin.id,
        )
        db.add(permission)
    else:
        permission.level = body.level
        permission.granted_by = admin.id
    db.flush()
    audit.record(
        db,
        AuditAction.permission_grant,
        user_id=admin.id,
        folder_id=body.folder_id,
        target_user_id=body.user_id,
        ip=client_ip(request),
        details={"level": body.level.value},
    )
    db.commit()
    return permission


@router.delete("/{permission_id}")
def revoke_permission(
    permission_id: int, db: DbDep, admin: AdminUser, request: Request
) -> dict:
    permission = db.get(FolderPermission, permission_id)
    if permission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found"
        )
    audit.record(
        db,
        AuditAction.permission_revoke,
        user_id=admin.id,
        folder_id=permission.folder_id,
        target_user_id=permission.user_id,
        ip=client_ip(request),
        details={"level": permission.level.value},
    )
    db.delete(permission)
    db.commit()
    return {"status": "ok"}
