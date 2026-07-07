import io
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import (
    ActiveUser,
    ActiveUserOrPreviewTicket,
    ActiveUserOrTicket,
    AdminUser,
    DbDep,
    StorageDep,
    client_ip,
)
from app.models import (
    AuditAction,
    File,
    FileVersion,
    Folder,
    PermissionLevel,
    User,
)
from app.schemas.files import (
    ExtractResult,
    FileOut,
    FileSearchResult,
    FileUpdate,
    FileVersionOut,
    UploadTreeResult,
)
from app.services import audit
from app.services.archive import (
    ArchiveToolUnavailableError,
    ArchiveTooLargeError,
    CorruptArchiveError,
    UnsafeArchivePathError,
    UnsupportedArchiveError,
    open_archive,
    validate_entries,
)
from app.services.permissions import accessible_levels, require_folder_access
from app.services.preview import (
    PreviewConversionFailedError,
    PreviewConversionTimeoutError,
    PreviewKind,
    PreviewRangeNotSatisfiableError,
    PreviewSourceTooLargeError,
    PreviewToolUnavailableError,
    PreviewUnsupportedError,
    convert_office_to_pdf,
    get_preview_kind,
    get_preview_mime,
    iter_range,
    parse_range_header,
)
from app.services.storage import FileStorage
from app.services.tree_upload import (
    get_or_create_child_folder,
    resolve_folder_path,
    sanitize_relative_path,
    save_file_content,
)

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


def _resolve_version(db: Session, file: File, version_id: int | None) -> FileVersion:
    if version_id is None:
        version = file.current_version
    else:
        version = db.get(FileVersion, version_id)
        if version is not None and version.file_id != file.id:
            version = None
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version


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


@router.post(
    "/folders/{folder_id}/upload-tree",
    response_model=UploadTreeResult,
    status_code=status.HTTP_201_CREATED,
)
def upload_tree(
    folder_id: int,
    files: list[UploadFile],
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> UploadTreeResult:
    require_folder_access(db, user, folder_id, PermissionLevel.write)
    ip = client_ip(request)
    created = 0
    for upload in files:
        segments = sanitize_relative_path(upload.filename or "")
        if not segments:
            continue
        *dirs, name = segments
        target_folder_id = resolve_folder_path(db, folder_id, dirs, user.id, ip)
        save_file_content(
            db, storage, target_folder_id, name, upload.file, upload.content_type, user, ip
        )
        created += 1
    db.commit()
    return UploadTreeResult(files=created)


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
    version = _resolve_version(db, file, version_id)

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


@router.get("/files/{file_id}/preview")
def preview_file(
    file_id: int,
    db: DbDep,
    user: ActiveUserOrPreviewTicket,
    storage: StorageDep,
    request: Request,
    version_id: int | None = None,
) -> StreamingResponse:
    file = _get_file(db, user, file_id, PermissionLevel.read)
    version = _resolve_version(db, file, version_id)

    kind = get_preview_kind(file.name)
    if kind is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Формат не поддерживается для предпросмотра",
        )

    if kind is PreviewKind.office:
        if version.preview_key is None:
            try:
                blob = convert_office_to_pdf(
                    storage, file.name, version.storage_key, version.size
                )
            except PreviewToolUnavailableError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
                )
            except PreviewSourceTooLargeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(exc)
                )
            except PreviewConversionTimeoutError as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
                )
            except PreviewConversionFailedError as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
                )
            version.preview_key = blob.key
            version.preview_size = blob.size
            db.flush()
        stream_key = version.preview_key
        stream_size = version.preview_size
        content_type = "application/pdf"
    else:
        stream_key = version.storage_key
        stream_size = version.size
        content_type = get_preview_mime(file.name)

    try:
        byte_range = parse_range_header(request.headers.get("range"), stream_size)
    except PreviewRangeNotSatisfiableError:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{stream_size}"},
        )

    # Video seeking fires many Range requests per viewing session — only
    # audit the start of playback (no Range, or Range starting at 0), not
    # every subsequent seek, to avoid flooding audit_log.
    is_initial = byte_range is None or byte_range[0] == 0
    if is_initial:
        audit.record(
            db,
            AuditAction.file_preview,
            user_id=user.id,
            file_id=file.id,
            folder_id=file.folder_id,
            file_version_id=version.id,
            ip=client_ip(request),
            details={"name": file.name, "version_no": version.version_no, "kind": kind.value},
        )
    db.commit()

    headers = {
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(file.name)}",
    }
    handle = storage.open(stream_key)
    if byte_range is not None:
        start, end = byte_range
        headers["Content-Range"] = f"bytes {start}-{end}/{stream_size}"
        headers["Content-Length"] = str(end - start + 1)
        return StreamingResponse(
            iter_range(handle, start, end),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=content_type,
            headers=headers,
        )

    headers["Content-Length"] = str(stream_size)
    return StreamingResponse(handle, media_type=content_type, headers=headers)


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


ARCHIVE_EXTENSIONS = (".zip", ".rar")


def _archive_base_name(name: str) -> str:
    lower = name.lower()
    for ext in ARCHIVE_EXTENSIONS:
        if lower.endswith(ext):
            return name[: -len(ext)]
    return name


@router.post("/files/{file_id}/extract", response_model=ExtractResult)
def extract_archive(
    file_id: int,
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> ExtractResult:
    file = _get_file(db, user, file_id, PermissionLevel.write)
    if not file.name.lower().endswith(ARCHIVE_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Формат не поддерживается"
        )
    version = file.current_version
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    ip = client_ip(request)
    try:
        archive = open_archive(file.name, storage.open(version.storage_key))
    except UnsupportedArchiveError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Формат не поддерживается"
        )
    except ArchiveToolUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except CorruptArchiveError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось распаковать архив"
        )

    try:
        entries = archive.entries()
        try:
            validate_entries(entries)
        except ArchiveTooLargeError as exc:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(exc)
            )
        except UnsafeArchivePathError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        total_size = sum(e.size for e in entries if not e.is_dir)
        dest_name = _archive_base_name(file.name)
        dest_folder = get_or_create_child_folder(db, file.folder_id, dest_name, user.id, ip)

        files_created = 0
        for entry in entries:
            segments = sanitize_relative_path(entry.path)
            if not segments:
                continue
            if entry.is_dir:
                resolve_folder_path(db, dest_folder.id, segments, user.id, ip)
                continue
            *dirs, name = segments
            target_folder_id = resolve_folder_path(db, dest_folder.id, dirs, user.id, ip)
            data = archive.read(entry.path)
            save_file_content(
                db, storage, target_folder_id, name, io.BytesIO(data), None, user, ip
            )
            files_created += 1
    finally:
        archive.close()

    audit.record(
        db,
        AuditAction.file_extract,
        user_id=user.id,
        file_id=file.id,
        folder_id=dest_folder.id,
        ip=ip,
        details={"name": file.name, "files": files_created, "total_size": total_size},
    )
    db.commit()
    return ExtractResult(folder_id=dest_folder.id, files=files_created)


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
        if version.preview_key is not None:
            storage.delete(version.preview_key)
        db.delete(version)
    db.delete(file)
    db.commit()
    return {"status": "ok"}
