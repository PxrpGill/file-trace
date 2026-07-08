"""Folder access resolution.

A permission granted on a folder applies to its whole subtree; when several
ancestors carry explicit permissions for the user, the nearest one wins.
Admins implicitly have write everywhere.

Both lookups below run as a single `WITH RECURSIVE` query instead of walking
the folder tree with one SQL round-trip per level — important since
`require_folder_access` runs on almost every request.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session, aliased

from app.models import Folder, FolderPermission, PermissionLevel, User, UserRole


def effective_level(db: Session, user: User, folder: Folder) -> PermissionLevel | None:
    if user.role == UserRole.admin:
        return PermissionLevel.write

    ancestors = (
        select(Folder.id.label("id"), Folder.parent_id.label("parent_id"), literal(0).label("depth"))
        .where(Folder.id == folder.id)
        .cte("ancestors", recursive=True)
    )
    parent = aliased(Folder)
    ancestors = ancestors.union_all(
        select(
            parent.id.label("id"),
            parent.parent_id.label("parent_id"),
            (ancestors.c.depth + 1).label("depth"),
        ).join(ancestors, parent.id == ancestors.c.parent_id)
    )

    row = db.execute(
        select(FolderPermission.level)
        .join(ancestors, FolderPermission.folder_id == ancestors.c.id)
        .where(FolderPermission.user_id == user.id)
        .order_by(ancestors.c.depth.asc())
        .limit(1)
    ).first()
    return row[0] if row is not None else None


def permits(actual: PermissionLevel | None, level: PermissionLevel) -> bool:
    return actual is not None and (level != PermissionLevel.write or actual == PermissionLevel.write)


def require_folder_access(
    db: Session, user: User, folder_id: int, level: PermissionLevel
) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if not permits(effective_level(db, user, folder), level):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to folder")
    return folder


def accessible_levels(db: Session, user: User) -> dict[int, PermissionLevel]:
    """Effective permission level for every folder the user can see."""
    if user.role == UserRole.admin:
        ids = db.execute(select(Folder.id)).scalars().all()
        return {folder_id: PermissionLevel.write for folder_id in ids}

    root_permission = aliased(FolderPermission)
    base = (
        select(Folder.id.label("folder_id"), root_permission.level.label("level"))
        .select_from(Folder)
        .outerjoin(
            root_permission,
            (root_permission.folder_id == Folder.id) & (root_permission.user_id == user.id),
        )
        .where(Folder.parent_id.is_(None))
    )
    levels = base.cte("folder_levels", recursive=True)

    child = aliased(Folder)
    child_permission = aliased(FolderPermission)
    recursive = (
        select(
            child.id.label("folder_id"),
            func.coalesce(child_permission.level, levels.c.level).label("level"),
        )
        .select_from(child)
        .join(levels, child.parent_id == levels.c.folder_id)
        .outerjoin(
            child_permission,
            (child_permission.folder_id == child.id) & (child_permission.user_id == user.id),
        )
    )
    levels = levels.union_all(recursive)

    rows = db.execute(select(levels.c.folder_id, levels.c.level)).all()
    return {folder_id: level for folder_id, level in rows if level is not None}
