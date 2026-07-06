"""Shared helpers for turning a batch of paths into a folder/file tree.

Used by both the "upload a whole directory" endpoint and archive
extraction: both need to walk a list of relative paths, creating
whatever intermediate folders are missing, and save each file either as
a brand new File or as a new FileVersion of an existing one.
"""

from typing import BinaryIO

from sqlalchemy.orm import Session

from app.models import AuditAction, File, FileVersion, Folder, User
from app.services import audit
from app.services.storage import FileStorage


def sanitize_relative_path(path: str) -> list[str]:
    """Split a `/`-separated path into segments, dropping empty, `.` and
    `..` segments so a batch upload can never escape its target folder."""
    normalized = path.replace("\\", "/")
    return [s for s in normalized.split("/") if s not in ("", ".", "..")]


def get_or_create_child_folder(
    db: Session, parent_id: int, name: str, user_id: int, ip: str | None
) -> Folder:
    folder = db.query(Folder).filter_by(parent_id=parent_id, name=name).first()
    if folder is not None:
        return folder
    folder = Folder(parent_id=parent_id, name=name, created_by=user_id)
    db.add(folder)
    db.flush()
    audit.record(
        db,
        AuditAction.folder_create,
        user_id=user_id,
        folder_id=folder.id,
        ip=ip,
        details={"name": name},
    )
    return folder


def resolve_folder_path(
    db: Session,
    root_folder_id: int,
    segments: list[str],
    user_id: int,
    ip: str | None,
) -> int:
    folder_id = root_folder_id
    for segment in segments:
        folder_id = get_or_create_child_folder(db, folder_id, segment, user_id, ip).id
    return folder_id


def save_file_content(
    db: Session,
    storage: FileStorage,
    folder_id: int,
    name: str,
    stream: BinaryIO,
    content_type: str | None,
    user: User,
    ip: str | None,
) -> File:
    """Save `stream` as `name` in `folder_id`: a new File if the name is
    free, otherwise a new FileVersion of the existing one."""
    file = (
        db.query(File)
        .filter_by(folder_id=folder_id, name=name, is_deleted=False)
        .first()
    )
    is_new = file is None
    if is_new:
        file = File(folder_id=folder_id, name=name)
        db.add(file)
        db.flush()

    blob = storage.save(stream)
    version = FileVersion(
        file=file,
        version_no=len(file.versions) + 1,
        size=blob.size,
        mime_type=content_type or "application/octet-stream",
        sha256=blob.sha256,
        storage_key=blob.key,
        uploaded_by=user.id,
    )
    db.add(version)
    db.flush()

    if is_new:
        audit.record(
            db,
            AuditAction.file_upload,
            user_id=user.id,
            file_id=file.id,
            folder_id=folder_id,
            file_version_id=version.id,
            ip=ip,
            details={"name": name, "size": version.size},
        )
    else:
        audit.record(
            db,
            AuditAction.file_new_version,
            user_id=user.id,
            file_id=file.id,
            folder_id=folder_id,
            file_version_id=version.id,
            ip=ip,
            details={"name": name, "version_no": version.version_no, "size": version.size},
        )
    return file
