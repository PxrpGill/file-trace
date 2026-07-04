from pydantic import BaseModel, Field

from app.models import UserRole


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    full_name: str = ""
    password: str = Field(min_length=8)
    role: UserRole = UserRole.user


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    password: str = Field(min_length=8)
