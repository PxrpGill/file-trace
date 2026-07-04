"""Blob storage behind a small interface so S3 can replace local disk later.

Blobs are immutable and content-addressed by a random hex key; the database
maps file versions to keys via FileVersion.storage_key.
"""

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class StoredBlob:
    key: str
    size: int
    sha256: str


class FileStorage(Protocol):
    def save(self, stream: BinaryIO) -> StoredBlob: ...

    def open(self, key: str) -> BinaryIO: ...

    def delete(self, key: str) -> None: ...


class LocalDiskStorage:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        # two-level fan-out keeps directories small at large file counts
        return self.root / key[:2] / key

    def save(self, stream: BinaryIO) -> StoredBlob:
        key = uuid.uuid4().hex
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size = 0
        with path.open("wb") as out:
            while chunk := stream.read(_CHUNK):
                digest.update(chunk)
                size += len(chunk)
                out.write(chunk)
        return StoredBlob(key=key, size=size, sha256=digest.hexdigest())

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
