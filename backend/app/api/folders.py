from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import ActiveUser, DbDep, client_ip
from app.models import AuditAction, File, Folder, PermissionLevel, UserRole
from app.schemas.folders import FolderCreate, FolderNode, FolderOut, FolderRename
from app.services import audit
from app.services.permissions import accessible_levels, require_folder_access

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/tree", response_model=list[FolderNode])
def tree(db: DbDep, user: ActiveUser) -> list[FolderNode]:
    levels = accessible_levels(db, user)
    folders = {f.id: f for f in db.query(Folder).order_by(Folder.name)}
    nodes = {
        fid: FolderNode(
            id=folders[fid].id,
            parent_id=folders[fid].parent_id,
            name=folders[fid].name,
            level=level,
            children=[],
        )
        for fid, level in levels.items()
    }
    roots: list[FolderNode] = []
    for node in nodes.values():
        parent = nodes.get(node.parent_id) if node.parent_id else None
        if parent is not None:
            parent.children.append(node)
        else:
            roots.append(node)
    return roots


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(
    body: FolderCreate, db: DbDep, user: ActiveUser, request: Request
) -> Folder:
    if body.parent_id is None:
        if user.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin can create root folders",
            )
    else:
        require_folder_access(db, user, body.parent_id, PermissionLevel.write)
    if db.query(Folder).filter_by(parent_id=body.parent_id, name=body.name).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Folder already exists"
        )
    folder = Folder(parent_id=body.parent_id, name=body.name, created_by=user.id)
    db.add(folder)
    db.flush()
    audit.record(
        db,
        AuditAction.folder_create,
        user_id=user.id,
        folder_id=folder.id,
        ip=client_ip(request),
        details={"name": folder.name},
    )
    db.commit()
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
def rename_folder(
    folder_id: int, body: FolderRename, db: DbDep, user: ActiveUser, request: Request
) -> Folder:
    folder = require_folder_access(db, user, folder_id, PermissionLevel.write)
    old_name = folder.name
    folder.name = body.name
    audit.record(
        db,
        AuditAction.folder_rename,
        user_id=user.id,
        folder_id=folder.id,
        ip=client_ip(request),
        details={"old_name": old_name, "new_name": body.name},
    )
    db.commit()
    return folder


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: int, db: DbDep, user: ActiveUser, request: Request
) -> dict:
    folder = require_folder_access(db, user, folder_id, PermissionLevel.write)
    has_children = db.query(Folder).filter_by(parent_id=folder.id).first() is not None
    has_files = (
        db.query(File).filter_by(folder_id=folder.id, is_deleted=False).first()
        is not None
    )
    if has_children or has_files:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Folder is not empty"
        )
    audit.record(
        db,
        AuditAction.folder_delete,
        user_id=user.id,
        folder_id=folder.id,
        ip=client_ip(request),
        details={"name": folder.name},
    )
    db.delete(folder)
    db.commit()
    return {"status": "ok"}
