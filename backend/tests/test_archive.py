import glob
import io
import os
import shutil as shutil_module
import tempfile
import zipfile

import pytest

from app.services.archive import (
    ArchiveEntry,
    ArchiveTooLargeError,
    CorruptArchiveError,
    UnsafeArchivePathError,
    UnsupportedArchiveError,
    open_archive,
    validate_entries,
)


def make_zip(entries: dict[str, bytes]) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    buf.seek(0)
    return buf


def test_open_archive_rejects_unsupported_extension():
    with pytest.raises(UnsupportedArchiveError):
        open_archive("data.7z", io.BytesIO(b""))


def test_zip_reader_lists_entries_and_reads_content():
    stream = make_zip({"a.txt": b"hello", "sub/b.txt": b"world"})
    archive = open_archive("bundle.zip", stream)
    try:
        entries = {e.path: e for e in archive.entries()}
        assert entries["a.txt"].size == 5
        assert entries["a.txt"].is_dir is False
        assert archive.read("sub/b.txt") == b"world"
    finally:
        archive.close()


def test_validate_entries_rejects_dotdot_path():
    with pytest.raises(UnsafeArchivePathError):
        validate_entries([ArchiveEntry(path="../evil.txt", is_dir=False, size=1)])


def test_validate_entries_rejects_absolute_path():
    with pytest.raises(UnsafeArchivePathError):
        validate_entries([ArchiveEntry(path="/etc/passwd", is_dir=False, size=1)])


def test_validate_entries_rejects_too_many_entries():
    entries = [ArchiveEntry(path=f"{i}.txt", is_dir=False, size=1) for i in range(10_001)]
    with pytest.raises(ArchiveTooLargeError):
        validate_entries(entries)


def test_validate_entries_rejects_oversized_total(monkeypatch):
    import app.services.archive as archive_module

    monkeypatch.setattr(archive_module, "MAX_TOTAL_UNCOMPRESSED_SIZE", 10)
    with pytest.raises(ArchiveTooLargeError):
        validate_entries([ArchiveEntry(path="a.txt", is_dir=False, size=11)])


def test_validate_entries_accepts_safe_entries():
    entries = [
        ArchiveEntry(path="a.txt", is_dir=False, size=1),
        ArchiveEntry(path="sub/", is_dir=True, size=0),
    ]
    validate_entries(entries)


def test_open_archive_rejects_corrupt_zip():
    with pytest.raises(CorruptArchiveError):
        open_archive("bundle.zip", io.BytesIO(b"not a real zip file"))


def test_validate_entries_path_safety_checked_before_count_limit():
    entries = [ArchiveEntry(path=f"{i}.txt", is_dir=False, size=1) for i in range(10_001)]
    entries.append(ArchiveEntry(path="../evil.txt", is_dir=False, size=1))
    with pytest.raises(UnsafeArchivePathError):
        validate_entries(entries)


@pytest.mark.skipif(
    shutil_module.which("unrar") is None and shutil_module.which("unar") is None,
    reason="no unrar/unar binary available",
)
def test_rar_corrupt_archive_does_not_leak_temp_file():
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "*.rar")))
    with pytest.raises(CorruptArchiveError):
        open_archive("bundle.rar", io.BytesIO(b"not a real rar file"))
    after = set(glob.glob(os.path.join(tempfile.gettempdir(), "*.rar")))
    assert after - before == set()
