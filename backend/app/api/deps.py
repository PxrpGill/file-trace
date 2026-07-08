from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import User, UserRole
from app.services.security import (
    decode_access_token,
    decode_bulk_download_ticket,
    decode_download_ticket,
    decode_preview_ticket,
)
from app.services.storage import FileStorage, LocalDiskStorage

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


DbDep = Annotated[Session, Depends(get_db)]


def get_storage() -> FileStorage:
    return LocalDiskStorage(settings.storage_root)


StorageDep = Annotated[FileStorage, Depends(get_storage)]


def client_ip(request: Request) -> str | None:
    # за nginx реальный адрес приходит в X-Real-IP (см. frontend/nginx.conf)
    return request.headers.get("x-real-ip") or (
        request.client.host if request.client else None
    )


def get_current_user(
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )
    if credentials is None:
        raise unauthorized
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_active_user(user: CurrentUser) -> User:
    """Like get_current_user, but blocks accounts pending a password change."""
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return user


ActiveUser = Annotated[User, Depends(get_active_user)]


def require_admin(user: ActiveUser) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def _make_ticket_or_header_dep(
    decode_ticket_fn: Callable[[str], int | None],
) -> Callable[[Session, Request, HTTPAuthorizationCredentials | None], User]:
    """Builds a dependency like get_current_user, that also accepts a
    short-lived ticket of one specific purpose via ?ticket= for browser-
    native src/href requests that can't carry an Authorization header."""

    def dep(
        db: DbDep,
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> User:
        unauthorized = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
        ticket = request.query_params.get("ticket")
        if ticket is not None:
            user_id = decode_ticket_fn(ticket)
        elif credentials is not None:
            user_id = decode_access_token(credentials.credentials)
        else:
            raise unauthorized
        if user_id is None:
            raise unauthorized
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            raise unauthorized
        return user

    return dep


get_user_from_ticket_or_header = _make_ticket_or_header_dep(decode_download_ticket)
get_user_from_preview_ticket_or_header = _make_ticket_or_header_dep(decode_preview_ticket)


def get_active_user_or_ticket(
    user: Annotated[User, Depends(get_user_from_ticket_or_header)],
) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return user


ActiveUserOrTicket = Annotated[User, Depends(get_active_user_or_ticket)]


def get_active_user_or_preview_ticket(
    user: Annotated[User, Depends(get_user_from_preview_ticket_or_header)],
) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return user


ActiveUserOrPreviewTicket = Annotated[User, Depends(get_active_user_or_preview_ticket)]


def get_bulk_download_ticket_claims(db: DbDep, ticket: str) -> tuple[User, list[int]]:
    """Like get_current_user, but for the bulk-download ticket, which carries
    both the user id and the already-permission-filtered file id list — a
    bare bearer header wouldn't know which files, so there's no header
    fallback here (unlike get_user_from_ticket_or_header)."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )
    claims = decode_bulk_download_ticket(ticket)
    if claims is None:
        raise unauthorized
    user_id, file_ids = claims
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user, file_ids


BulkDownloadTicket = Annotated[tuple[User, list[int]], Depends(get_bulk_download_ticket_claims)]


def require_admin_or_ticket(user: ActiveUserOrTicket) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


AdminUserOrTicket = Annotated[User, Depends(require_admin_or_ticket)]
