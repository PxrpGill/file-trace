from pydantic import BaseModel, Field

from app.models import PermissionLevel


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: int | None = None


class FolderRename(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class FolderOut(BaseModel):
    id: int
    parent_id: int | None
    name: str

    model_config = {"from_attributes": True}


class FolderNode(FolderOut):
    level: PermissionLevel
    children: list["FolderNode"] = []


class PermissionGrant(BaseModel):
    folder_id: int
    user_id: int
    level: PermissionLevel


class PermissionOut(BaseModel):
    id: int
    folder_id: int
    user_id: int
    level: PermissionLevel

    model_config = {"from_attributes": True}
