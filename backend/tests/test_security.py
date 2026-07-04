from app.services.security import hash_password, verify_password


def test_correct_password_verifies():
    assert verify_password("s3cret", hash_password("s3cret"))


def test_wrong_password_rejected():
    assert not verify_password("wrong", hash_password("s3cret"))


def test_hash_is_not_plaintext():
    assert "s3cret" not in hash_password("s3cret")
