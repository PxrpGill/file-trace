from datetime import datetime

from pydantic import BaseModel

from app.models import AuditAction


class AuditEntryOut(BaseModel):
    id: int
    user_id: int | None
    username: str | None
    action: AuditAction
    file_id: int | None
    folder_id: int | None
    file_version_id: int | None
    target_user_id: int | None
    ip: str | None
    details: dict | None
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditEntryOut]
    total: int
