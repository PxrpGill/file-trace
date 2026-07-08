from datetime import datetime

from pydantic import BaseModel, Field

from app.models import PermissionLevel

MAX_BULK_FILES = 200


class FileVersionOut(BaseModel):
    id: int
    version_no: int
    size: int
    mime_type: str
    sha256: str
    uploaded_by: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileOut(BaseModel):
    id: int
    folder_id: int
    name: str
    is_deleted: bool
    current_version: FileVersionOut | None

    model_config = {"from_attributes": True}


class FileUpdate(BaseModel):
    name: str | None = None
    folder_id: int | None = None


class FileSearchResult(BaseModel):
    id: int
    folder_id: int
    folder_name: str
    name: str
    level: PermissionLevel
    current_version: FileVersionOut | None

    model_config = {"from_attributes": True}


class UploadTreeResult(BaseModel):
    files: int


class ExtractResult(BaseModel):
    folder_id: int
    files: int


class BulkFileRequest(BaseModel):
    file_ids: list[int] = Field(min_length=1, max_length=MAX_BULK_FILES)


class BulkMoveRequest(BulkFileRequest):
    folder_id: int


class BulkFailure(BaseModel):
    file_id: int
    reason: str  # "not_found" | "forbidden"


class BulkMoveResult(BaseModel):
    moved: list[int]
    skipped: list[BulkFailure]


class BulkDeleteResult(BaseModel):
    deleted: list[int]
    skipped: list[BulkFailure]


class BulkDownloadTicketResult(BaseModel):
    ticket: str
    files: list[int]
    skipped: list[BulkFailure]
