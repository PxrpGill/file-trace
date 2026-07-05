from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings
from app.services.security import (
    create_access_token,
    create_download_ticket,
    decode_access_token,
    decode_download_ticket,
    hash_password,
    verify_password,
)


def test_correct_password_verifies():
    assert verify_password("s3cret", hash_password("s3cret"))


def test_wrong_password_rejected():
    assert not verify_password("wrong", hash_password("s3cret"))


def test_hash_is_not_plaintext():
    assert "s3cret" not in hash_password("s3cret")


def test_create_download_ticket_is_decodable():
    ticket = create_download_ticket(42)
    assert decode_download_ticket(ticket) == 42


def test_decode_download_ticket_rejects_expired():
    expired = jwt.encode(
        {
            "sub": "42",
            "aud": "download",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_download_ticket(expired) is None


def test_decode_download_ticket_rejects_normal_access_token():
    token = create_access_token(42)
    assert decode_download_ticket(token) is None


def test_decode_access_token_rejects_download_ticket():
    ticket = create_download_ticket(42)
    assert decode_access_token(ticket) is None
