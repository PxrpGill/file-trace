from datetime import datetime

from pydantic import BaseModel


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
    current_version: FileVersionOut | None

    model_config = {"from_attributes": True}


class UploadTreeResult(BaseModel):
    files: int


class ExtractResult(BaseModel):
    folder_id: int
    files: int
