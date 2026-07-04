"""Single entry point for writing audit records.

Records are added to the caller's session and committed together with the
action they describe, so an action and its trace are atomic.
"""

from sqlalchemy.orm import Session

from app.models import AuditAction, AuditLog


def record(
    db: Session,
    action: AuditAction,
    *,
    user_id: int | None = None,
    file_id: int | None = None,
    folder_id: int | None = None,
    file_version_id: int | None = None,
    target_user_id: int | None = None,
    ip: str | None = None,
    details: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        file_id=file_id,
        folder_id=folder_id,
        file_version_id=file_version_id,
        target_user_id=target_user_id,
        ip=ip,
        details=details,
    )
    db.add(entry)
    return entry
