import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditAction(str, enum.Enum):
    login = "login"
    login_failed = "login_failed"
    logout = "logout"
    file_upload = "file_upload"
    file_download = "file_download"
    file_new_version = "file_new_version"
    file_rename = "file_rename"
    file_move = "file_move"
    file_delete = "file_delete"
    file_restore = "file_restore"
    file_purge = "file_purge"
    file_extract = "file_extract"
    file_preview = "file_preview"
    folder_create = "folder_create"
    folder_rename = "folder_rename"
    folder_delete = "folder_delete"
    user_create = "user_create"
    user_update = "user_update"
    user_password_reset = "user_password_reset"
    permission_grant = "permission_grant"
    permission_revoke = "permission_revoke"


class AuditLog(Base):
    """Append-only: no update or delete path exists anywhere in the API."""

    __tablename__ = "audit_log"
    __table_args__ = (
        # file_history() filters by file_id and sorts by created_at — a
        # composite index lets Postgres satisfy both in one index scan
        # instead of a bitmap-AND of the separate single-column indexes.
        Index("ix_audit_log_file_created", "file_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(index=True)
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, native_enum=False), index=True
    )
    file_id: Mapped[int | None] = mapped_column(index=True)
    folder_id: Mapped[int | None] = mapped_column(index=True)
    file_version_id: Mapped[int | None] = mapped_column()
    target_user_id: Mapped[int | None] = mapped_column()
    ip: Mapped[str | None] = mapped_column(String(45))
    details: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
