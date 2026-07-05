import csv
import io
import json
from collections.abc import Iterator
from datetime import datetime

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import ActiveUser, AdminUser, AdminUserOrTicket, DbDep
from app.models import AuditAction, AuditLog, PermissionLevel, User
from app.schemas.audit import AuditEntryOut, AuditPage
from app.services.permissions import require_folder_access

router = APIRouter(prefix="/api", tags=["audit"])

CSV_COLUMNS = [
    "id",
    "created_at",
    "username",
    "action",
    "file_id",
    "folder_id",
    "file_version_id",
    "target_user_id",
    "ip",
    "details",
]


def _entry(record: AuditLog, usernames: dict[int, str]) -> AuditEntryOut:
    return AuditEntryOut(
        id=record.id,
        user_id=record.user_id,
        username=usernames.get(record.user_id) if record.user_id else None,
        action=record.action,
        file_id=record.file_id,
        folder_id=record.folder_id,
        file_version_id=record.file_version_id,
        target_user_id=record.target_user_id,
        ip=record.ip,
        details=record.details,
        created_at=record.created_at,
    )


def _usernames(db: Session) -> dict[int, str]:
    return dict(db.query(User.id, User.username))


def _filtered(
    db: Session,
    user_id: int | None,
    action: AuditAction | None,
    file_id: int | None,
    folder_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    query = db.query(AuditLog)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action is not None:
        query = query.filter(AuditLog.action == action)
    if file_id is not None:
        query = query.filter(AuditLog.file_id == file_id)
    if folder_id is not None:
        query = query.filter(AuditLog.folder_id == folder_id)
    if date_from is not None:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to is not None:
        query = query.filter(AuditLog.created_at <= date_to)
    return query


@router.get("/files/{file_id}/audit", response_model=list[AuditEntryOut])
def file_history(file_id: int, db: DbDep, user: ActiveUser) -> list[AuditEntryOut]:
    from app.api.files import _get_file

    _get_file(db, user, file_id, PermissionLevel.read)
    usernames = _usernames(db)
    records = (
        db.query(AuditLog)
        .filter(AuditLog.file_id == file_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .all()
    )
    return [_entry(r, usernames) for r in records]


@router.get("/audit", response_model=AuditPage)
def journal(
    db: DbDep,
    _: AdminUser,
    user_id: int | None = None,
    action: AuditAction | None = None,
    file_id: int | None = None,
    folder_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
) -> AuditPage:
    query = _filtered(db, user_id, action, file_id, folder_id, date_from, date_to)
    total = query.count()
    records = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    usernames = _usernames(db)
    return AuditPage(items=[_entry(r, usernames) for r in records], total=total)


@router.get("/audit/export.csv")
def export_csv(
    db: DbDep,
    _: AdminUserOrTicket,
    user_id: int | None = None,
    action: AuditAction | None = None,
    file_id: int | None = None,
    folder_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StreamingResponse:
    query = _filtered(db, user_id, action, file_id, folder_id, date_from, date_to)
    records = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).all()
    usernames = _usernames(db)

    def rows() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(CSV_COLUMNS)
        for r in records:
            entry = _entry(r, usernames)
            writer.writerow(
                [
                    entry.id,
                    entry.created_at.isoformat(),
                    entry.username or "",
                    entry.action.value,
                    entry.file_id or "",
                    entry.folder_id or "",
                    entry.file_version_id or "",
                    entry.target_user_id or "",
                    entry.ip or "",
                    json.dumps(entry.details, ensure_ascii=False) if entry.details else "",
                ]
            )
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    return StreamingResponse(
        rows(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=audit.csv"},
    )
