"""Folder access resolution.

A permission granted on a folder applies to its whole subtree; when several
ancestors carry explicit permissions for the user, the nearest one wins.
Admins implicitly have write everywhere.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Folder, FolderPermission, PermissionLevel, User, UserRole


def effective_level(db: Session, user: User, folder: Folder) -> PermissionLevel | None:
    if user.role == UserRole.admin:
        return PermissionLevel.write
    current: Folder | None = folder
    while current is not None:
        permission = (
            db.query(FolderPermission)
            .filter_by(folder_id=current.id, user_id=user.id)
            .first()
        )
        if permission is not None:
            return permission.level
        current = db.get(Folder, current.parent_id) if current.parent_id else None
    return None


def require_folder_access(
    db: Session, user: User, folder_id: int, level: PermissionLevel
) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    actual = effective_level(db, user, folder)
    if actual is None or (level == PermissionLevel.write and actual != PermissionLevel.write):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to folder")
    return folder


def accessible_levels(db: Session, user: User) -> dict[int, PermissionLevel]:
    """Effective permission level for every folder the user can see."""
    folders = db.query(Folder).all()
    if user.role == UserRole.admin:
        return {f.id: PermissionLevel.write for f in folders}

    explicit = {
        p.folder_id: p.level
        for p in db.query(FolderPermission).filter_by(user_id=user.id)
    }
    by_id = {f.id: f for f in folders}
    result: dict[int, PermissionLevel] = {}

    def resolve(folder: Folder) -> PermissionLevel | None:
        if folder.id in result:
            return result[folder.id]
        level = explicit.get(folder.id)
        if level is None and folder.parent_id is not None:
            level = resolve(by_id[folder.parent_id])
        if level is not None:
            result[folder.id] = level
        return level

    for folder in folders:
        resolve(folder)
    return result
