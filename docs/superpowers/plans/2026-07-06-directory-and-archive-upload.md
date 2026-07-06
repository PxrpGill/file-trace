# Загрузка директорий и распаковка zip/rar-архивов — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload a whole directory (with subfolders) in one action, and extract an already-uploaded zip/rar archive into the folder tree, both reusing the existing files/folders/audit model.

**Architecture:** Two new backend endpoints (`POST /api/folders/{folder_id}/upload-tree`, `POST /api/files/{file_id}/extract`) share a small service module (`app/services/tree_upload.py`) that knows how to create-or-reuse nested folders from a list of path segments and save a file as either a new `File` or a new `FileVersion`. A second new service module (`app/services/archive.py`) wraps `zipfile`/`rarfile` behind one interface that lists entries (name/size/is_dir) without decompressing, so size/count limits and zip-slip paths can be rejected before anything is written. Frontend adds a directory-picker button and a per-file "Распаковать" action, both following the existing upload/mutation patterns in the codebase (progress-on-button, `useIsMutating`-based disabling of sibling actions).

**Tech Stack:** FastAPI + SQLAlchemy 2.x (sync) backend, stdlib `zipfile`, new `rarfile` dependency + system `unar` binary; React + TS + Vite + tanstack-query frontend.

## Global Constraints

- Право на запись проверяется один раз, на корневой папке запроса — оно действует на всё поддерево (`require_folder_access`).
- Конфликт имени файла при батч-загрузке директории или при распаковке архива → создаётся новая `FileVersion` (не 409, в отличие от одиночной загрузки).
- Сегменты пути `.`/`..`/пустые при батч-загрузке директории — молча отбрасываются (не создают папок).
- Распаковка архива: путь записи, который абсолютный или содержит сегмент `..` (zip-slip) → весь запрос отклоняется 400, ничего не создаётся.
- Распаковка архива: лимиты — суммарный несжатый размер записей ≤ 2 GiB (`2 * 1024 * 1024 * 1024`), количество записей ≤ `10_000`; превышение → 413, ничего не создаётся.
- Любая ошибка в процессе батч-загрузки или распаковки — весь запрос откатывается (без частичного успеха), одна транзакция, один `db.commit()` в конце.
- Пароль-защищённые или повреждённые архивы → 400.
- RAR: зависимость `rarfile` (Python) + системный бинарник `unrar`/`unar`, добавляется в `backend/Dockerfile`.
- Один новый `AuditAction.file_extract`; загрузка директории и создание вложенных объектов при распаковке используют уже существующие `folder_create`/`file_upload`/`file_new_version`.

---

## File Structure

**Backend — новые файлы:**
- `backend/app/services/tree_upload.py` — `sanitize_relative_path`, `get_or_create_child_folder`, `resolve_folder_path`, `save_file_content`. Используется обоими новыми эндпоинтами.
- `backend/app/services/archive.py` — `ArchiveEntry`, `ZipArchiveReader`, `RarArchiveReader`, `open_archive`, `validate_entries`, `is_unsafe_archive_path`, плюс исключения (`UnsupportedArchiveError`, `ArchiveToolUnavailableError`, `ArchiveTooLargeError`, `UnsafeArchivePathError`).
- `backend/tests/test_tree_upload.py`, `backend/tests/test_archive.py`, `backend/tests/test_upload_tree.py`, `backend/tests/test_extract.py`.

**Backend — изменяемые файлы:**
- `backend/app/models/audit.py` — новый `AuditAction.file_extract`.
- `backend/app/schemas/files.py` — новые `UploadTreeResult`, `ExtractResult`.
- `backend/app/api/files.py` — новые эндпоинты `upload_tree`, `extract_archive`.
- `backend/pyproject.toml` / `backend/uv.lock` — зависимость `rarfile`.
- `backend/Dockerfile` — установка `unar`.

**Frontend — новые файлы:**
- `frontend/src/features/file/upload-tree/{model/use-upload-tree.ts,ui/UploadTreeButton.tsx,index.ts}`.
- `frontend/src/features/file/extract-archive/{model/use-extract-archive.ts,ui/ExtractArchiveAction.tsx,index.ts}`.

**Frontend — изменяемые файлы:**
- `frontend/src/entities/file/model/types.ts`, `frontend/src/entities/file/index.ts` — `isArchiveFile`.
- `frontend/src/entities/audit/model/types.ts`, `frontend/src/entities/audit/model/action-labels.ts` — `file_extract`.
- `frontend/src/pages/browser/ui/BrowserPage.tsx` — подключение обеих новых фич.

---

### Task 1: `tree_upload.py` — путь-в-папки и сохранение файла с версионированием

**Files:**
- Create: `backend/app/services/tree_upload.py`
- Test: `backend/tests/test_tree_upload.py`

**Interfaces:**
- Produces: `sanitize_relative_path(path: str) -> list[str]`; `get_or_create_child_folder(db: Session, parent_id: int, name: str, user_id: int, ip: str | None) -> Folder`; `resolve_folder_path(db: Session, root_folder_id: int, segments: list[str], user_id: int, ip: str | None) -> int`; `save_file_content(db: Session, storage: FileStorage, folder_id: int, name: str, stream: BinaryIO, content_type: str | None, user: User, ip: str | None) -> File`. Tasks 3 and 5 import all four.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_tree_upload.py
import io

from app.models import Folder
from app.services.storage import LocalDiskStorage
from app.services.tree_upload import (
    get_or_create_child_folder,
    resolve_folder_path,
    sanitize_relative_path,
    save_file_content,
)


def test_sanitize_relative_path_drops_empty_dot_and_dotdot_segments():
    assert sanitize_relative_path("a/b/c.txt") == ["a", "b", "c.txt"]
    assert sanitize_relative_path("a//./../b/c.txt") == ["a", "b", "c.txt"]
    assert sanitize_relative_path("") == []
    assert sanitize_relative_path("../../x.txt") == ["x.txt"]


def test_resolve_folder_path_creates_nested_folders_and_audits(db, admin):
    root = Folder(name="Root", created_by=admin.id)
    db.add(root)
    db.commit()

    folder_id = resolve_folder_path(db, root.id, ["a", "b"], admin.id, "127.0.0.1")
    db.commit()

    a = db.query(Folder).filter_by(parent_id=root.id, name="a").one()
    b = db.query(Folder).filter_by(parent_id=a.id, name="b").one()
    assert folder_id == b.id


def test_resolve_folder_path_with_no_segments_returns_root(db, admin):
    root = Folder(name="Root", created_by=admin.id)
    db.add(root)
    db.commit()

    assert resolve_folder_path(db, root.id, [], admin.id, None) == root.id


def test_get_or_create_child_folder_reuses_existing(db, admin):
    root = Folder(name="Root", created_by=admin.id)
    db.add(root)
    db.commit()

    first = get_or_create_child_folder(db, root.id, "a", admin.id, None)
    db.commit()
    again = get_or_create_child_folder(db, root.id, "a", admin.id, None)
    db.commit()
    assert first.id == again.id


def test_save_file_content_creates_then_new_version(db, admin, tmp_path):
    root = Folder(name="Root", created_by=admin.id)
    db.add(root)
    db.commit()
    storage = LocalDiskStorage(tmp_path / "blobs")

    file = save_file_content(
        db, storage, root.id, "a.txt", io.BytesIO(b"v1"), "text/plain", admin, None
    )
    db.commit()
    assert file.current_version.version_no == 1
    assert file.current_version.size == 2

    file2 = save_file_content(
        db, storage, root.id, "a.txt", io.BytesIO(b"v2-bytes"), "text/plain", admin, None
    )
    db.commit()
    assert file2.id == file.id
    assert file2.current_version.version_no == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_tree_upload.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.tree_upload'`

- [ ] **Step 3: Implement `tree_upload.py`**

```python
# backend/app/services/tree_upload.py
"""Shared helpers for turning a batch of paths into a folder/file tree.

Used by both the "upload a whole directory" endpoint and archive
extraction: both need to walk a list of relative paths, creating
whatever intermediate folders are missing, and save each file either as
a brand new File or as a new FileVersion of an existing one.
"""

from typing import BinaryIO

from sqlalchemy.orm import Session

from app.models import AuditAction, File, FileVersion, Folder, User
from app.services import audit
from app.services.storage import FileStorage


def sanitize_relative_path(path: str) -> list[str]:
    """Split a `/`-separated path into segments, dropping empty, `.` and
    `..` segments so a batch upload can never escape its target folder."""
    normalized = path.replace("\\", "/")
    return [s for s in normalized.split("/") if s not in ("", ".", "..")]


def get_or_create_child_folder(
    db: Session, parent_id: int, name: str, user_id: int, ip: str | None
) -> Folder:
    folder = db.query(Folder).filter_by(parent_id=parent_id, name=name).first()
    if folder is not None:
        return folder
    folder = Folder(parent_id=parent_id, name=name, created_by=user_id)
    db.add(folder)
    db.flush()
    audit.record(
        db,
        AuditAction.folder_create,
        user_id=user_id,
        folder_id=folder.id,
        ip=ip,
        details={"name": name},
    )
    return folder


def resolve_folder_path(
    db: Session,
    root_folder_id: int,
    segments: list[str],
    user_id: int,
    ip: str | None,
) -> int:
    folder_id = root_folder_id
    for segment in segments:
        folder_id = get_or_create_child_folder(db, folder_id, segment, user_id, ip).id
    return folder_id


def save_file_content(
    db: Session,
    storage: FileStorage,
    folder_id: int,
    name: str,
    stream: BinaryIO,
    content_type: str | None,
    user: User,
    ip: str | None,
) -> File:
    """Save `stream` as `name` in `folder_id`: a new File if the name is
    free, otherwise a new FileVersion of the existing one."""
    file = (
        db.query(File)
        .filter_by(folder_id=folder_id, name=name, is_deleted=False)
        .first()
    )
    is_new = file is None
    if is_new:
        file = File(folder_id=folder_id, name=name)
        db.add(file)
        db.flush()

    blob = storage.save(stream)
    version = FileVersion(
        file=file,
        version_no=len(file.versions) + 1,
        size=blob.size,
        mime_type=content_type or "application/octet-stream",
        sha256=blob.sha256,
        storage_key=blob.key,
        uploaded_by=user.id,
    )
    db.add(version)
    db.flush()

    if is_new:
        audit.record(
            db,
            AuditAction.file_upload,
            user_id=user.id,
            file_id=file.id,
            folder_id=folder_id,
            file_version_id=version.id,
            ip=ip,
            details={"name": name, "size": version.size},
        )
    else:
        audit.record(
            db,
            AuditAction.file_new_version,
            user_id=user.id,
            file_id=file.id,
            folder_id=folder_id,
            file_version_id=version.id,
            ip=ip,
            details={"name": name, "version_no": version.version_no, "size": version.size},
        )
    return file
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_tree_upload.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/tree_upload.py tests/test_tree_upload.py
git commit -m "feat: сервис для создания вложенных папок и версионирования файлов при батч-загрузке"
```

---

### Task 2: `POST /api/folders/{folder_id}/upload-tree`

**Files:**
- Modify: `backend/app/schemas/files.py`
- Modify: `backend/app/api/files.py`
- Test: `backend/tests/test_upload_tree.py`

**Interfaces:**
- Consumes: `sanitize_relative_path`, `resolve_folder_path`, `save_file_content` from Task 1 (`app.services.tree_upload`).
- Produces: `UploadTreeResult` schema (`files: int`), route `POST /api/folders/{folder_id}/upload-tree`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_upload_tree.py
from app.models import AuditAction, AuditLog, File, Folder

from tests.test_auth import auth_header
from tests.test_folders import grant, make_folder


def upload_tree(client, headers, folder_id, paths_and_contents, expect=201):
    files = [("files", (path, content)) for path, content in paths_and_contents]
    response = client.post(
        f"/api/folders/{folder_id}/upload-tree", files=files, headers=headers
    )
    assert response.status_code == expect, response.text
    return response.json()


def test_upload_tree_creates_nested_folders_and_files(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")

    body = upload_tree(
        client,
        admin_h,
        root["id"],
        [("docs/report.pdf", b"pdf"), ("docs/img/photo.png", b"png")],
    )
    assert body["files"] == 2

    docs = db.query(Folder).filter_by(parent_id=root["id"], name="docs").one()
    img = db.query(Folder).filter_by(parent_id=docs.id, name="img").one()
    assert db.query(File).filter_by(folder_id=docs.id, name="report.pdf").count() == 1
    assert db.query(File).filter_by(folder_id=img.id, name="photo.png").count() == 1
    assert db.query(AuditLog).filter_by(action=AuditAction.folder_create).count() == 2
    assert db.query(AuditLog).filter_by(action=AuditAction.file_upload).count() == 2


def test_upload_tree_conflict_creates_new_version(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    upload_tree(client, admin_h, root["id"], [("a.txt", b"v1")])
    body = upload_tree(client, admin_h, root["id"], [("a.txt", b"v2-bytes")])
    assert body["files"] == 1

    file = db.query(File).filter_by(folder_id=root["id"], name="a.txt").one()
    assert file.current_version.version_no == 2
    assert db.query(AuditLog).filter_by(action=AuditAction.file_new_version).count() == 1


def test_upload_tree_drops_dotdot_segments(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    upload_tree(client, admin_h, root["id"], [("../../etc/evil.txt", b"x")])

    etc = db.query(Folder).filter_by(name="etc").one()
    assert etc.parent_id == root["id"]
    assert db.query(File).filter_by(folder_id=etc.id, name="evil.txt").count() == 1


def test_upload_tree_requires_write(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    root = make_folder(client, admin_h, "Root")
    grant(client, admin_h, root["id"], user.id, "read")

    response = client.post(
        f"/api/folders/{root['id']}/upload-tree",
        files=[("files", ("a.txt", b"x"))],
        headers=alice_h,
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_upload_tree.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Add `UploadTreeResult` schema**

In `backend/app/schemas/files.py`, append:

```python
class UploadTreeResult(BaseModel):
    files: int
```

- [ ] **Step 4: Add the endpoint**

In `backend/app/api/files.py`, update the import lines:

```python
from app.schemas.files import (
    ExtractResult,
    FileOut,
    FileSearchResult,
    FileUpdate,
    FileVersionOut,
    UploadTreeResult,
)
from app.services.tree_upload import (
    get_or_create_child_folder,
    resolve_folder_path,
    sanitize_relative_path,
    save_file_content,
)
```

(`ExtractResult` and `get_or_create_child_folder` are unused until Task 4 — that's expected; Task 4 completes these imports' usage.)

Add the endpoint (placed after `upload_file`):

```python
@router.post(
    "/folders/{folder_id}/upload-tree",
    response_model=UploadTreeResult,
    status_code=status.HTTP_201_CREATED,
)
def upload_tree(
    folder_id: int,
    files: list[UploadFile],
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> UploadTreeResult:
    require_folder_access(db, user, folder_id, PermissionLevel.write)
    ip = client_ip(request)
    created = 0
    for upload in files:
        segments = sanitize_relative_path(upload.filename or "")
        if not segments:
            continue
        *dirs, name = segments
        target_folder_id = resolve_folder_path(db, folder_id, dirs, user.id, ip)
        save_file_content(
            db, storage, target_folder_id, name, upload.file, upload.content_type, user, ip
        )
        created += 1
    db.commit()
    return UploadTreeResult(files=created)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_upload_tree.py -v`
Expected: PASS (4 tests). Note: this step's imports reference `ExtractResult` which doesn't exist until Task 4 — add a temporary placeholder now so the module imports cleanly:

```python
# in backend/app/schemas/files.py, alongside UploadTreeResult
class ExtractResult(BaseModel):
    folder_id: int
    files: int
```

Run again: `cd backend && uv run pytest tests/ -v` (full suite) to confirm nothing else broke.
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/schemas/files.py app/api/files.py tests/test_upload_tree.py
git commit -m "feat: эндпоинт загрузки директории с воссозданием вложенных папок"
```

---

### Task 3: `archive.py` — чтение zip/rar без распаковки + защита от zip-бомб и zip-slip

**Files:**
- Create: `backend/app/services/archive.py`
- Modify: `backend/pyproject.toml` (via `uv add`)
- Modify: `backend/Dockerfile`
- Test: `backend/tests/test_archive.py`

**Interfaces:**
- Produces: `ArchiveEntry(path: str, is_dir: bool, size: int)`; `open_archive(filename: str, stream: BinaryIO) -> ArchiveReader` (has `.entries() -> list[ArchiveEntry]`, `.read(path: str) -> bytes`, `.close() -> None`); `validate_entries(entries: list[ArchiveEntry]) -> None`; `is_unsafe_archive_path(path: str) -> bool`; exceptions `UnsupportedArchiveError`, `ArchiveToolUnavailableError`, `ArchiveTooLargeError`, `UnsafeArchivePathError`; constants `MAX_TOTAL_UNCOMPRESSED_SIZE`, `MAX_ENTRY_COUNT`. Task 5 imports all of these.

- [ ] **Step 1: Add the `rarfile` dependency**

Run: `cd backend && uv add rarfile`
Expected: `pyproject.toml` gains `"rarfile>=4.2"` in `dependencies`, `uv.lock` updates.

- [ ] **Step 2: Add `unar` to the Docker image**

In `backend/Dockerfile`, right after `FROM python:3.12-slim`:

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends unar \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv
```

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_archive.py
import io
import zipfile

import pytest

from app.services.archive import (
    ArchiveEntry,
    ArchiveTooLargeError,
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_archive.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.archive'`

- [ ] **Step 5: Implement `archive.py`**

```python
# backend/app/services/archive.py
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_archive.py -v`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/services/archive.py pyproject.toml uv.lock Dockerfile tests/test_archive.py
git commit -m "feat: чтение zip/rar-архивов с защитой от zip-бомб и zip-slip"
```

---

### Task 4: `POST /api/files/{file_id}/extract`

**Files:**
- Modify: `backend/app/models/audit.py`
- Modify: `backend/app/schemas/files.py` (remove the Task-2 placeholder, keep the real `ExtractResult`)
- Modify: `backend/app/api/files.py`
- Create: `backend/tests/fixtures/` (directory, see Step 6 note)
- Test: `backend/tests/test_extract.py`

**Interfaces:**
- Consumes: `open_archive`, `validate_entries`, `ArchiveTooLargeError`, `UnsafeArchivePathError`, `UnsupportedArchiveError`, `ArchiveToolUnavailableError` (Task 3, `app.services.archive`); `get_or_create_child_folder`, `resolve_folder_path`, `sanitize_relative_path`, `save_file_content` (Task 1, already imported in `files.py` since Task 2).
- Produces: route `POST /api/files/{file_id}/extract` → `ExtractResult { folder_id: int, files: int }`.

- [ ] **Step 1: Add `AuditAction.file_extract`**

In `backend/app/models/audit.py`, add to the `AuditAction` enum (after `file_purge`):

```python
    file_purge = "file_purge"
    file_extract = "file_extract"
```

- [ ] **Step 2: Check whether a migration is needed**

Run (both commands must target the **same** scratch database, so `revision --autogenerate` diffs against a schema that's actually at `head` — not an empty one):
```bash
cd backend
export FILETRACE_DATABASE_URL="sqlite:///$(mktemp -d)/mig.db"
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "add file_extract audit action"
```
Expected: the generated revision's `upgrade()`/`downgrade()` bodies are empty (just `pass` or only `# ### ... ###` comments) — the `action` column is a plain `VARCHAR` sized from the longest enum member (`user_password_reset`, 19 chars), and `file_extract` (13 chars) doesn't exceed that, so there is nothing to alter. If the generated file is empty, delete it:

```bash
rm alembic/versions/<generated_file>.py
```

If it is **not** empty (i.e. autogenerate detected a real diff), keep the file, review it against the model change, and run `uv run alembic upgrade head` against a scratch sqlite db to confirm it applies cleanly before moving on.

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_extract.py
import io
import pathlib
import shutil
import zipfile

import pytest

from app.models import AuditAction, AuditLog, File, Folder

from tests.test_auth import auth_header
from tests.test_files import upload
from tests.test_folders import grant, make_folder


def make_zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def test_extract_zip_creates_tree_and_audits(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"report.txt": b"hello", "img/photo.png": b"binary"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["files"] == 2

    bundle_folder = db.query(Folder).filter_by(parent_id=root["id"], name="bundle").one()
    img_folder = db.query(Folder).filter_by(parent_id=bundle_folder.id, name="img").one()
    assert db.query(File).filter_by(folder_id=bundle_folder.id, name="report.txt").count() == 1
    assert db.query(File).filter_by(folder_id=img_folder.id, name="photo.png").count() == 1

    extract_record = db.query(AuditLog).filter_by(action=AuditAction.file_extract).one()
    assert extract_record.file_id == body["id"]
    assert extract_record.details["files"] == 2


def test_extract_reuses_existing_destination_folder(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    make_folder(client, admin_h, "bundle", parent_id=root["id"])
    archive_bytes = make_zip_bytes({"a.txt": b"1"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200
    assert db.query(Folder).filter_by(parent_id=root["id"], name="bundle").count() == 1


def test_extract_conflict_creates_new_version(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    bundle = make_folder(client, admin_h, "bundle", parent_id=root["id"])
    upload(client, admin_h, bundle["id"], "a.txt", b"old")
    archive_bytes = make_zip_bytes({"a.txt": b"new-content"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    client.post(f"/api/files/{body['id']}/extract", headers=admin_h)

    file = db.query(File).filter_by(folder_id=bundle["id"], name="a.txt").one()
    assert file.current_version.version_no == 2
    assert db.query(AuditLog).filter_by(action=AuditAction.file_new_version).count() == 1


def test_extract_rejects_zip_slip(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"../evil.txt": b"x"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400
    assert db.query(Folder).filter_by(parent_id=root["id"]).count() == 0


def test_extract_rejects_too_many_entries(client, db, admin, monkeypatch):
    import app.services.archive as archive_module

    monkeypatch.setattr(archive_module, "MAX_ENTRY_COUNT", 1)
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"a.txt": b"1", "b.txt": b"2"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 413
    assert db.query(Folder).filter_by(parent_id=root["id"]).count() == 0


def test_extract_requires_write(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    root = make_folder(client, admin_h, "Root")
    grant(client, admin_h, root["id"], user.id, "read")
    archive_bytes = make_zip_bytes({"a.txt": b"1"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=alice_h)
    assert response.status_code == 403


def test_extract_rejects_unsupported_extension(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "plain.txt", b"not an archive")

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400


def test_extract_rejects_corrupt_archive(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "broken.zip", b"not actually a zip file")

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400


@pytest.mark.skipif(
    shutil.which("unrar") is None and shutil.which("unar") is None,
    reason="no unrar/unar binary available in this environment",
)
def test_extract_rar_archive(client, db, admin):
    fixture = pathlib.Path(__file__).parent / "fixtures" / "sample.rar"
    if not fixture.exists():
        pytest.skip("tests/fixtures/sample.rar not present (see Step 6 note)")
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "sample.rar", fixture.read_bytes())

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_extract.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 5: Replace the `ExtractResult` placeholder and add the endpoint**

In `backend/app/schemas/files.py`, the `ExtractResult` class already added in Task 2 stays as-is (`folder_id: int`, `files: int`) — no change needed here, just confirm it's still present.

In `backend/app/api/files.py`:

1. Add `import io` near the top (with the other stdlib imports).
2. Extend the `app.services.tree_upload` import to include `get_or_create_child_folder` (already listed per Task 2's Step 4 — confirm it's there).
3. Add a new import block:

```python
from app.services.archive import (
    ArchiveToolUnavailableError,
    ArchiveTooLargeError,
    CorruptArchiveError,
    UnsafeArchivePathError,
    UnsupportedArchiveError,
    open_archive,
    validate_entries,
)
```

Note: `CorruptArchiveError` was added to `app/services/archive.py` during Task 3's review fix round (a corrupt/truncated `.zip`/`.rar` now raises this instead of a raw `zipfile`/`rarfile` exception) — it didn't exist when this plan was first written, but it's already in the codebase by the time you implement this task. Confirm it's exported from `app/services/archive.py` before using it; if the name differs, use whatever the actual module exports.

4. Add the endpoint (placed after `upload_new_version`):

```python
ARCHIVE_EXTENSIONS = (".zip", ".rar")


def _archive_base_name(name: str) -> str:
    lower = name.lower()
    for ext in ARCHIVE_EXTENSIONS:
        if lower.endswith(ext):
            return name[: -len(ext)]
    return name


@router.post("/files/{file_id}/extract", response_model=ExtractResult)
def extract_archive(
    file_id: int,
    db: DbDep,
    user: ActiveUser,
    storage: StorageDep,
    request: Request,
) -> ExtractResult:
    file = _get_file(db, user, file_id, PermissionLevel.write)
    if not file.name.lower().endswith(ARCHIVE_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Формат не поддерживается"
        )
    version = file.current_version
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    ip = client_ip(request)
    try:
        archive = open_archive(file.name, storage.open(version.storage_key))
    except UnsupportedArchiveError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Формат не поддерживается"
        )
    except ArchiveToolUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except CorruptArchiveError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось распаковать архив"
        )

    try:
        entries = archive.entries()
        try:
            validate_entries(entries)
        except ArchiveTooLargeError as exc:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
            )
        except UnsafeArchivePathError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        total_size = sum(e.size for e in entries if not e.is_dir)
        dest_name = _archive_base_name(file.name)
        dest_folder = get_or_create_child_folder(db, file.folder_id, dest_name, user.id, ip)

        files_created = 0
        for entry in entries:
            segments = sanitize_relative_path(entry.path)
            if not segments:
                continue
            if entry.is_dir:
                resolve_folder_path(db, dest_folder.id, segments, user.id, ip)
                continue
            *dirs, name = segments
            target_folder_id = resolve_folder_path(db, dest_folder.id, dirs, user.id, ip)
            data = archive.read(entry.path)
            save_file_content(
                db, storage, target_folder_id, name, io.BytesIO(data), None, user, ip
            )
            files_created += 1
    finally:
        archive.close()

    audit.record(
        db,
        AuditAction.file_extract,
        user_id=user.id,
        file_id=file.id,
        folder_id=dest_folder.id,
        ip=ip,
        details={"name": file.name, "files": files_created, "total_size": total_size},
    )
    db.commit()
    return ExtractResult(folder_id=dest_folder.id, files=files_created)
```

- [ ] **Step 6: (optional, environment-dependent) Add a real RAR fixture**

`RarArchiveReader` can only be exercised end-to-end with a genuine `.rar` file, and there is no free tool to *create* RAR archives (only to extract them) — `unar`/`unrar` are extractors only. If you have access to a real `rar` CLI (e.g. RARLAB's non-free tool) on your machine, generate the fixture once:

```bash
mkdir -p backend/tests/fixtures/rar_src
echo "hello" > backend/tests/fixtures/rar_src/a.txt
rar a backend/tests/fixtures/sample.rar backend/tests/fixtures/rar_src/a.txt
rm -rf backend/tests/fixtures/rar_src
```

If you don't have such a tool, skip this step — `test_extract_rar_archive` will skip itself (missing fixture), and the zip path already exercises the full `extract` endpoint logic (folder creation, versioning, zip-slip, limits). This is a known, accepted gap for this environment (see spec's "Сознательно не делаем").

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_extract.py -v`
Expected: PASS (8 tests passing, `test_extract_rar_archive` SKIPPED unless you completed Step 6 on a machine with `unar`/`unrar` installed)

Then run the full backend suite:

Run: `cd backend && uv run pytest -q`
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/models/audit.py app/api/files.py tests/test_extract.py
# plus the migration file from Step 2, if one was kept
git commit -m "feat: эндпоинт распаковки zip/rar-архива в дерево папок"
```

---

### Task 5: Frontend — `isArchiveFile` helper и `file_extract` в аудите

**Files:**
- Modify: `frontend/src/entities/file/model/types.ts`
- Modify: `frontend/src/entities/file/index.ts`
- Modify: `frontend/src/entities/audit/model/types.ts`
- Modify: `frontend/src/entities/audit/model/action-labels.ts`

**Interfaces:**
- Produces: `isArchiveFile(name: string): boolean`, exported from `@/entities/file`. `AuditAction` type includes `'file_extract'`. `ACTION_LABELS.file_extract`. Task 7 imports `isArchiveFile`; `FileDrawer`'s existing `ACTION_LABELS` lookup picks up the new label automatically.

- [ ] **Step 1: Add `isArchiveFile`**

In `frontend/src/entities/file/model/types.ts`, append:

```ts
const ARCHIVE_EXTENSIONS = ['.zip', '.rar']

export function isArchiveFile(name: string): boolean {
  const lower = name.toLowerCase()
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
```

- [ ] **Step 2: Export it from the entity barrel**

In `frontend/src/entities/file/index.ts`, add a new export line (keep the existing `export type {...}` line unchanged):

```ts
export { isArchiveFile } from './model/types'
```

- [ ] **Step 3: Add `file_extract` to the audit action type**

In `frontend/src/entities/audit/model/types.ts`, extend the union:

```ts
export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'file_upload' | 'file_download' | 'file_new_version'
  | 'file_rename' | 'file_move' | 'file_delete' | 'file_restore' | 'file_purge' | 'file_extract'
  | 'folder_create' | 'folder_rename' | 'folder_delete'
  | 'user_create' | 'user_update' | 'user_password_reset'
  | 'permission_grant' | 'permission_revoke'
```

- [ ] **Step 4: Add the Russian label**

In `frontend/src/entities/audit/model/action-labels.ts`, add after `file_purge`:

```ts
  file_purge: 'Окончательное удаление',
  file_extract: 'Распаковка архива',
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors (this also confirms `ACTION_LABELS: Record<AuditAction, string>` still has every key covered — a missing key here would be a compile error).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/entities/file/model/types.ts src/entities/file/index.ts src/entities/audit/model/types.ts src/entities/audit/model/action-labels.ts
git commit -m "feat: распознавание архивных файлов и подпись действия «Распаковка архива»"
```

---

### Task 6: Frontend — кнопка «Загрузить папку»

**Files:**
- Create: `frontend/src/features/file/upload-tree/model/use-upload-tree.ts`
- Create: `frontend/src/features/file/upload-tree/ui/UploadTreeButton.tsx`
- Create: `frontend/src/features/file/upload-tree/index.ts`
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx`

**Interfaces:**
- Consumes: `api` from `@/shared/api` (existing).
- Produces: `useUploadTreeMutation(folderId: number | null)` (mutation takes `{ files: FileList, onProgress?: (percent: number) => void }`); `<UploadTreeButton folderId={number} onError={(message: string) => void} />`.

- [ ] **Step 1: Mutation hook**

```ts
// frontend/src/features/file/upload-tree/model/use-upload-tree.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useUploadTreeMutation(folderId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      files,
      onProgress,
    }: {
      files: FileList
      onProgress?: (percent: number) => void
    }) => {
      const form = new FormData()
      for (const file of Array.from(files)) {
        form.append('files', file, file.webkitRelativePath || file.name)
      }
      await api.post(`/api/folders/${folderId}/upload-tree`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

- [ ] **Step 2: Button component**

`webkitdirectory` isn't in React's `InputHTMLAttributes` typings, so it's set imperatively via the ref callback rather than as a JSX prop.

```tsx
// frontend/src/features/file/upload-tree/ui/UploadTreeButton.tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useUploadTreeMutation } from '../model/use-upload-tree'

export function UploadTreeButton({
  folderId,
  onError,
}: {
  folderId: number
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploadTree = useUploadTreeMutation(folderId)
  const [progress, setProgress] = useState<number | null>(null)

  if (progress !== null) {
    return (
      <span
        className="version-progress"
        style={{ '--pct': `${progress}%` } as CSSProperties}
      >
        <span className="version-progress-fill" />
        <span className="version-progress-label">{progress}%</span>
      </span>
    )
  }

  return (
    <>
      <button className="btn secondary" onClick={() => inputRef.current?.click()}>
        Загрузить папку
      </button>
      <input
        ref={(node) => {
          inputRef.current = node
          node?.setAttribute('webkitdirectory', '')
        }}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            setProgress(0)
            uploadTree.mutate(
              { files, onProgress: setProgress },
              {
                onError: () => onError?.('Не удалось загрузить папку'),
                onSettled: () => setProgress(null),
              },
            )
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
```

- [ ] **Step 3: Barrel export**

```ts
// frontend/src/features/file/upload-tree/index.ts
export { UploadTreeButton } from './ui/UploadTreeButton'
export { useUploadTreeMutation } from './model/use-upload-tree'
```

- [ ] **Step 4: Wire into `BrowserPage`**

In `frontend/src/pages/browser/ui/BrowserPage.tsx`, add the import:

```tsx
import { UploadTreeButton } from '@/features/file/upload-tree'
```

And place the button next to the existing `UploadFileButton` (inside the `canWrite && (...)` block in `.content-head`):

```tsx
                  <UploadFileButton folderId={selected.id} onError={setErrorMessage} />
                  <UploadTreeButton folderId={selected.id} onError={setErrorMessage} />
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors

- [ ] **Step 6: Manual check**

Run: `make dev` (from repo root), open the app, select a writable folder, click «Загрузить папку», pick a local directory with a subfolder in the OS file picker. Confirm: the subfolder appears in the tree, the files land in the right place, and the button shows a progress bar while uploading.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/features/file/upload-tree src/pages/browser/ui/BrowserPage.tsx
git commit -m "feat: загрузка целой директории с воссозданием структуры подпапок"
```

---

### Task 7: Frontend — действие «Распаковать»

**Files:**
- Create: `frontend/src/features/file/extract-archive/model/use-extract-archive.ts`
- Create: `frontend/src/features/file/extract-archive/ui/ExtractArchiveAction.tsx`
- Create: `frontend/src/features/file/extract-archive/index.ts`
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx`

**Interfaces:**
- Consumes: `isArchiveFile` (Task 5, `@/entities/file`); `FileItem` type (existing).
- Produces: `useExtractArchiveMutation(fileId: number)` with `mutationKey: ['extract', fileId]`; `<ExtractArchiveAction file={FileItem} disabled={boolean} onError={(message: string) => void} />`.

- [ ] **Step 1: Mutation hook**

```ts
// frontend/src/features/file/extract-archive/model/use-extract-archive.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useExtractArchiveMutation(fileId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['extract', fileId],
    mutationFn: () => api.post(`/api/files/${fileId}/extract`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

- [ ] **Step 2: Action button**

```tsx
// frontend/src/features/file/extract-archive/ui/ExtractArchiveAction.tsx
import type { FileItem } from '@/entities/file'
import { useExtractArchiveMutation } from '../model/use-extract-archive'

export function ExtractArchiveAction({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
  const extractArchive = useExtractArchiveMutation(file.id)

  return (
    <button
      className="btn secondary small"
      disabled={disabled || extractArchive.isPending}
      onClick={() =>
        extractArchive.mutate(undefined, {
          onError: () => onError?.('Не удалось распаковать архив'),
        })
      }
    >
      Распаковать
    </button>
  )
}
```

- [ ] **Step 3: Barrel export**

```ts
// frontend/src/features/file/extract-archive/index.ts
export { ExtractArchiveAction } from './ui/ExtractArchiveAction'
export { useExtractArchiveMutation } from './model/use-extract-archive'
```

- [ ] **Step 4: Wire into `BrowserPage`**

In `frontend/src/pages/browser/ui/BrowserPage.tsx`:

Add imports:

```tsx
import { isArchiveFile } from '@/entities/file'
import { ExtractArchiveAction } from '@/features/file/extract-archive'
```

Add an `extractingIds` set next to the existing `uploadingVersionIds`:

```tsx
  const extractingIds = new Set(
    useMutationState({
      filters: { mutationKey: ['extract'], status: 'pending' },
      select: (mutation) => mutation.options.mutationKey?.[1] as number,
    }),
  )
```

Inside the row-rendering `.map`, compute `extracting` alongside `versionUploading` and fold it into the existing `disabled` props, and render the new action:

```tsx
                    {(files.data ?? []).map((file) => {
                      const versionUploading = uploadingVersionIds.has(file.id)
                      const extracting = extractingIds.has(file.id)
                      const rowBusy = versionUploading || extracting
                      return (
                      <tr key={file.id}>
                        {/* ...unchanged cells... */}
                        <td className="actions">
                          <DownloadFileButton
                            url={`/api/files/${file.id}/download`}
                            disabled={rowBusy}
                          />{' '}
                          {canWrite && (
                            <>
                              <UploadVersionButton
                                file={file}
                                disabled={rowBusy}
                                onError={setErrorMessage}
                              />{' '}
                              {isArchiveFile(file.name) && (
                                <>
                                  <ExtractArchiveAction
                                    file={file}
                                    disabled={rowBusy}
                                    onError={setErrorMessage}
                                  />{' '}
                                </>
                              )}
                              <RenameFileAction file={file} disabled={rowBusy} />{' '}
                              <MoveFileAction
                                file={file}
                                disabled={rowBusy}
                                onError={setErrorMessage}
                              />{' '}
                              <DeleteFileAction
                                file={file}
                                disabled={rowBusy}
                                onDeleted={() => setOpenFile(null)}
                              />
                            </>
                          )}
                        </td>
                      </tr>
                      )
                    })}
```

(This replaces every existing `disabled={versionUploading}` in that block with `disabled={rowBusy}` and adds the archive-only action — the surrounding JSX for the other cells in the row is unchanged.)

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors

- [ ] **Step 6: Manual check**

Run: `make dev`, upload a `.zip` file (e.g. containing a text file and a subfolder) to a writable folder, open the file row, click «Распаковать». Confirm: a new subfolder named after the archive (without `.zip`) appears with the extracted contents, and the row's other actions are disabled while the request is in flight. Then try uploading a non-archive file and confirm «Распаковать» does not appear for it.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/features/file/extract-archive src/pages/browser/ui/BrowserPage.tsx
git commit -m "feat: действие «Распаковать» для zip/rar-архивов"
```

---

### Task 8: Финальная проверка

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all tests PASS

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: `tsc -b && vite build` succeeds with no errors

- [ ] **Step 3: End-to-end manual pass**

With `make dev` running: upload a directory with at least two levels of nesting; upload a `.zip` containing nested folders and a file whose name collides with an existing file in the destination; extract it and confirm the existing file gained a new version instead of failing; check the file's «История действий» in the drawer shows the new `Распаковка архива` entry with correct actor/IP.

- [ ] **Step 4: Commit (if anything was fixed during verification)**

Only if Steps 1–3 surfaced fixes:

```bash
git add -A
git commit -m "fix: правки по итогам сквозной проверки загрузки директорий и распаковки архивов"
```
