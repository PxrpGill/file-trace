from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    """Returns the user id, or None for any invalid/expired token."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


_TICKET_TTL = {
    "download": timedelta(seconds=60),
    "preview": timedelta(minutes=20),
    "bulk_download": timedelta(seconds=60),
}


def create_ticket(user_id: int, purpose: str, extra_claims: dict | None = None) -> str:
    """Short-lived, scoped JWT for browser-native `src`/`href` requests that
    can't carry an Authorization header. `purpose` becomes the JWT audience,
    so a ticket minted for one purpose is rejected for another. `extra_claims`
    lets a ticket carry data beyond the user id (e.g. bulk_download's file ids),
    since a GET request has no body to carry it separately."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + _TICKET_TTL[purpose],
        "aud": purpose,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_ticket_payload(token: str, purpose: str) -> dict | None:
    """Like decode_ticket, but returns the full claim set (for tickets that
    carry data beyond the user id, e.g. bulk_download's file_ids)."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=purpose,
        )
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def decode_ticket(token: str, purpose: str) -> int | None:
    """Returns the user id for a valid, unexpired ticket of that purpose, else None."""
    payload = decode_ticket_payload(token, purpose)
    if payload is None:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


def create_download_ticket(user_id: int) -> str:
    """Short-lived, scoped JWT for browser-native downloads via ?ticket=."""
    return create_ticket(user_id, "download")


def decode_download_ticket(token: str) -> int | None:
    """Returns the user id for a valid, unexpired download ticket, else None."""
    return decode_ticket(token, "download")


def create_bulk_download_ticket(user_id: int, file_ids: list[int]) -> str:
    """Short-lived ticket carrying the already-permission-filtered file id
    list, since the GET that consumes it can't carry a request body."""
    return create_ticket(user_id, "bulk_download", extra_claims={"file_ids": file_ids})


def decode_bulk_download_ticket(token: str) -> tuple[int, list[int]] | None:
    """Returns (user_id, file_ids) for a valid, unexpired bulk-download ticket, else None."""
    payload = decode_ticket_payload(token, "bulk_download")
    if payload is None:
        return None
    try:
        return int(payload["sub"]), [int(i) for i in payload["file_ids"]]
    except (KeyError, ValueError, TypeError):
        return None


def create_preview_ticket(user_id: int) -> str:
    """Longer-lived ticket for `<video src>` preview playback, which keeps
    re-requesting the same URL (via Range) for the whole viewing session —
    a 60s download ticket would expire mid-playback."""
    return create_ticket(user_id, "preview")


def decode_preview_ticket(token: str) -> int | None:
    """Returns the user id for a valid, unexpired preview ticket, else None."""
    return decode_ticket(token, "preview")
