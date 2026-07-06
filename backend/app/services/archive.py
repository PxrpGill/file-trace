"""Reading zip/rar archives for the "extract into folders" feature.

Entries are listed via the underlying library's central-directory
parsing, which never requires decompressing anything — that lets callers
validate size/count limits and reject unsafe paths before touching a
single byte of file content.
"""

import os
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from typing import BinaryIO, Protocol

MAX_TOTAL_UNCOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024  # 2 GiB
MAX_ENTRY_COUNT = 10_000


@dataclass(frozen=True)
class ArchiveEntry:
    path: str
    is_dir: bool
    size: int


class UnsupportedArchiveError(Exception):
    """Extension is neither .zip nor .rar."""


class ArchiveToolUnavailableError(Exception):
    """.rar was uploaded but no unrar/unar/7z binary is installed."""


class ArchiveTooLargeError(Exception):
    """Uncompressed size or entry count exceeds the configured limit."""


class UnsafeArchivePathError(Exception):
    """An entry path is absolute or escapes via `..` (zip-slip)."""

    def __init__(self, path: str) -> None:
        super().__init__(f"Небезопасный путь в архиве: {path}")
        self.path = path


class ArchiveReader(Protocol):
    def entries(self) -> list[ArchiveEntry]: ...
    def read(self, path: str) -> bytes: ...
    def close(self) -> None: ...


class ZipArchiveReader:
    def __init__(self, stream: BinaryIO) -> None:
        self._zip = zipfile.ZipFile(stream)

    def entries(self) -> list[ArchiveEntry]:
        return [
            ArchiveEntry(path=info.filename, is_dir=info.is_dir(), size=info.file_size)
            for info in self._zip.infolist()
        ]

    def read(self, path: str) -> bytes:
        return self._zip.read(path)

    def close(self) -> None:
        self._zip.close()


class RarArchiveReader:
    def __init__(self, stream: BinaryIO) -> None:
        import rarfile

        if shutil.which("unrar") is None and shutil.which("unar") is None:
            raise ArchiveToolUnavailableError(
                "Распаковка RAR недоступна: не найден unrar/unar на сервере"
            )
        fd, self._tmp_path = tempfile.mkstemp(suffix=".rar")
        with os.fdopen(fd, "wb") as tmp:
            shutil.copyfileobj(stream, tmp)
        self._rar = rarfile.RarFile(self._tmp_path)

    def entries(self) -> list[ArchiveEntry]:
        return [
            ArchiveEntry(path=info.filename, is_dir=info.is_dir(), size=info.file_size)
            for info in self._rar.infolist()
        ]

    def read(self, path: str) -> bytes:
        return self._rar.read(path)

    def close(self) -> None:
        self._rar.close()
        os.unlink(self._tmp_path)


def open_archive(filename: str, stream: BinaryIO) -> ArchiveReader:
    lower = filename.lower()
    if lower.endswith(".zip"):
        return ZipArchiveReader(stream)
    if lower.endswith(".rar"):
        return RarArchiveReader(stream)
    raise UnsupportedArchiveError(filename)


def is_unsafe_archive_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if normalized.startswith("/"):
        return True
    return any(segment == ".." for segment in normalized.split("/"))


def validate_entries(entries: list[ArchiveEntry]) -> None:
    if len(entries) > MAX_ENTRY_COUNT:
        raise ArchiveTooLargeError(
            f"Слишком много файлов в архиве: {len(entries)} (максимум {MAX_ENTRY_COUNT})"
        )
    total_size = sum(e.size for e in entries if not e.is_dir)
    if total_size > MAX_TOTAL_UNCOMPRESSED_SIZE:
        raise ArchiveTooLargeError(
            f"Архив слишком большой в распакованном виде: {total_size} байт"
        )
    for entry in entries:
        if is_unsafe_archive_path(entry.path):
            raise UnsafeArchivePathError(entry.path)
