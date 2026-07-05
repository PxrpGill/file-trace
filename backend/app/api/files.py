from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import ActiveUser, ActiveUserOrTicket, AdminUser, DbDep, StorageDep, client_ip
from app.models import (
    AuditAction,
    File,
    FileVersion,
    Folder,
    PermissionLevel,
    User,
)
from app.schemas.files import FileOut, FileSearchResult, FileUpdate, FileVersionOut
from app.services import audit
from app.services.permissions import accessible_levels, require_folder_access
from app.services.storage import FileStorage

router = APIRouter(prefix="/api", tags=["files"])

MIN_SEARCH_QUERY_LENGTH = 2


def _get_file(
    db: Session,
    user: User,
    file_id: int,
    level: PermissionLevel,
    include_deleted: bool = False,
) -> File:
    file = db.get(File, file_id)
    if file is None or (file.is_deleted and not include_deleted):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    require_folder_access(db, user, file.folder_id, level)
    return file


def _save_version(
    db: Session, storage: FileStorage, file: File, upload: UploadFile, user: User
) -> FileVersion:
    blob = storage.save(upload.file)
    version = FileVersion(
        file=file,
        version_no=len(file.versions) + 1,
        size=blob.size,
        mime_type=upload.content_type or "application/octet-stream",
        sha256=blob.sha256,
        storage_key=blob.key,
        uploaded_by=user.id,
    )
    db.add(version)
    db.flush()
    return version


@router.get("/folders/{folder_id}/files", response_model=list[FileOut])
def list_files(folder_id: int, db: DbDep, user: ActiveUser) -> list[File]:
    require_folder_access(db, user, folder_id, PermissionLevel.read)
    return (
        db.query(File)
        .filter_by(folder_id=folder_id, is_deleted=False)
        .order_by(File.name)
        .all()
    )


@router.get("/files/search", response_model=list[FileSearchResult])
def search_files(
    db: DbDep,
    user: ActiveUser,
    q: str = Query(..., min_length=1, max_length=255),
    limit: int = Query(default=50, le=100),
) -> list[FileSearchResult]:
    term = q.strip()
    if len(term) < MIN_SEARCH_QUERY_LENGTH:
        return []

    folder_ids = list(accessible_levels(db, user).keys())
    if not folder_ids:
        return []

    # Read-only listing, like list_files/list_versions — no audit record,
    # since it discloses nothing beyond what browsing folders already reveals.
    rows = (
        db.query(File, Folder.name)
        .join(Folder, File.folder_id == Folder.id)
        .filter(File.folder_id.in_(folder_ids))
        .filter(File.is_deleted.is_(False))
        .filter(File.name.ilike(f"%{term}%"))
        .order_by(File.name)
        .limit(limit)
        .all()
    )
    return [
        FileSearchResult(
            id=file.id,
            folder_id=file.folder_id,
            folder_name=folder_name,
            name=file.name,
            current_version=file.current_version,
        )
        for file, folder_name in rows
    ]


@router.post(
    "/folders/{folder_id}/files",
    response_model=FileOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_file(
    folder_id: int,
    upload: UploadFile,
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> File:
    require_folder_access(db, user, folder_id, PermissionLevel.write)
    name = upload.filename or "unnamed"
    exists = (
        db.query(File)
        .filter_by(folder_id=folder_id, name=name, is_deleted=False)
        .first()
    )
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File with this name already exists; upload a new version instead",
        )
    file = File(folder_id=folder_id, name=name)
    db.add(file)
    db.flush()
    version = _save_version(db, storage, file, upload, user)
    audit.record(
        db,
        AuditAction.file_upload,
        user_id=user.id,
        file_id=file.id,
        folder_id=folder_id,
        file_version_id=version.id,
        ip=client_ip(request),
        details={"name": name, "size": version.size},
    )
    db.commit()
    return file


@router.get("/files/trash", response_model=list[FileOut])
def list_trash(db: DbDep, _: AdminUser) -> list[File]:
    return db.query(File).filter_by(is_deleted=True).order_by(File.deleted_at).all()


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    db: DbDep,
    user: ActiveUserOrTicket,
    storage: StorageDep,
    request: Request,
    version_id: int | None = None,
) -> StreamingResponse:
    file = _get_file(db, user, file_id, PermissionLevel.read)
    if version_id is None:
        version = file.current_version
    else:
        version = db.get(FileVersion, version_id)
        if version is None or version.file_id != file.id:
            version = None
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    audit.record(
        db,
        AuditAction.file_download,
        user_id=user.id,
        file_id=file.id,
        folder_id=file.folder_id,
        file_version_id=version.id,
        ip=client_ip(request),
        details={"name": file.name, "version_no": version.version_no},
    )
    db.commit()

    quoted = quote(file.name)
    return StreamingResponse(
        storage.open(version.storage_key),
        media_type=version.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quoted}",
            "Content-Length": str(version.size),
        },
    )


@router.get("/files/{file_id}/versions", response_model=list[FileVersionOut])
def list_versions(file_id: int, db: DbDep, user: ActiveUser) -> list[FileVersion]:
    file = _get_file(db, user, file_id, PermissionLevel.read)
    return file.versions


@router.post(
    "/files/{file_id}/versions",
    response_model=FileOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_new_version(
    file_id: int,
    upload: UploadFile,
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> File:
    file = _get_file(db, user, file_id, PermissionLevel.write)
    version = _save_version(db, storage, file, upload, user)
    audit.record(
        db,
        AuditAction.file_new_version,
        user_id=user.id,
        file_id=file.id,
        folder_id=file.folder_id,
        file_version_id=version.id,
        ip=client_ip(request),
        details={"name": file.name, "version_no": version.version_no, "size": version.size},
    )
    db.commit()
    db.refresh(file)
    return file


@router.patch("/files/{file_id}", response_model=FileOut)
def update_file(
    file_id: int, body: FileUpdate, db: DbDep, user: ActiveUser, request: Request
) -> File:
    file = _get_file(db, user, file_id, PermissionLevel.write)
    ip = client_ip(request)

    if body.name is not None and body.name != file.name:
        old_name = file.name
        file.name = body.name
        audit.record(
            db,
            AuditAction.file_rename,
            user_id=user.id,
            file_id=file.id,
            folder_id=file.folder_id,
            ip=ip,
            details={"old_name": old_name, "new_name": body.name},
        )

    if body.folder_id is not None and body.folder_id != file.folder_id:
        require_folder_access(db, user, body.folder_id, PermissionLevel.write)
        from_folder = file.folder_id
        file.folder_id = body.folder_id
        audit.record(
            db,
            AuditAction.file_move,
            user_id=user.id,
            file_id=file.id,
            folder_id=body.folder_id,
            ip=ip,
            details={"from_folder_id": from_folder, "to_folder_id": body.folder_id},
        )

    db.commit()
    return file


@router.delete("/files/{file_id}")
def delete_file(file_id: int, db: DbDep, user: ActiveUser, request: Request) -> dict:
    file = _get_file(db, user, file_id, PermissionLevel.write)
    file.is_deleted = True
    file.deleted_at = datetime.now(timezone.utc)
    file.deleted_by = user.id
    audit.record(
        db,
        AuditAction.file_delete,
        user_id=user.id,
        file_id=file.id,
        folder_id=file.folder_id,
        ip=client_ip(request),
        details={"name": file.name},
    )
    db.commit()
    return {"status": "ok"}


@router.post("/files/{file_id}/restore", response_model=FileOut)
def restore_file(
    file_id: int, db: DbDep, admin: AdminUser, request: Request
) -> File:
    file = _get_file(db, admin, file_id, PermissionLevel.write, include_deleted=True)
    if not file.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="File is not deleted"
        )
    file.is_deleted = False
    file.deleted_at = None
    file.deleted_by = None
    audit.record(
        db,
        AuditAction.file_restore,
        user_id=admin.id,
        file_id=file.id,
        folder_id=file.folder_id,
        ip=client_ip(request),
        details={"name": file.name},
    )
    db.commit()
    return file


@router.delete("/files/{file_id}/purge")
def purge_file(
    file_id: int, db: DbDep, admin: AdminUser, storage: StorageDep, request: Request
) -> dict:
    file = _get_file(db, admin, file_id, PermissionLevel.write, include_deleted=True)
    if not file.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Move the file to trash before purging",
        )
    audit.record(
        db,
        AuditAction.file_purge,
        user_id=admin.id,
        file_id=file.id,
        folder_id=file.folder_id,
        ip=client_ip(request),
        details={"name": file.name, "versions": len(file.versions)},
    )
    for version in file.versions:
        storage.delete(version.storage_key)
        db.delete(version)
    db.delete(file)
    db.commit()
    return {"status": "ok"}
