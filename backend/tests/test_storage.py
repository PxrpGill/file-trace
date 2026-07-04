import hashlib
import io

import pytest

from app.services.storage import LocalDiskStorage


@pytest.fixture()
def storage(tmp_path):
    return LocalDiskStorage(tmp_path)


def test_save_and_open_roundtrip(storage):
    blob = storage.save(io.BytesIO(b"hello world"))
    with storage.open(blob.key) as f:
        assert f.read() == b"hello world"


def test_save_computes_size_and_sha256(storage):
    payload = b"x" * 100_000
    blob = storage.save(io.BytesIO(payload))
    assert blob.size == 100_000
    assert blob.sha256 == hashlib.sha256(payload).hexdigest()


def test_keys_are_unique(storage):
    a = storage.save(io.BytesIO(b"same"))
    b = storage.save(io.BytesIO(b"same"))
    assert a.key != b.key


def test_delete_removes_blob(storage):
    blob = storage.save(io.BytesIO(b"bye"))
    storage.delete(blob.key)
    with pytest.raises(FileNotFoundError):
        storage.open(blob.key)
