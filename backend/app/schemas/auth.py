from pydantic import BaseModel, Field

from app.models import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool

    model_config = {"from_attributes": True}


class DownloadTicketResponse(BaseModel):
    ticket: str
