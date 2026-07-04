import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PermissionLevel(str, enum.Enum):
    read = "read"
    write = "write"


class FolderPermission(Base):
    __tablename__ = "folder_permissions"
    __table_args__ = (
        UniqueConstraint("folder_id", "user_id", name="uq_permission_folder_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(ForeignKey("folders.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    level: Mapped[PermissionLevel] = mapped_column(Enum(PermissionLevel, native_enum=False))
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
