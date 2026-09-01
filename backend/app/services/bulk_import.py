"""One-off bulk import: copy an existing directory tree from local disk
straight into file-trace's DB + storage, bypassing the HTTP API.

For migrating a large pre-existing archive, where going through the usual
upload endpoints would mean many requests against nginx's
`proxy_read_timeout` (frontend/nginx.conf) and the per-archive size/entry
caps in app.services.archive. Progress commits in batches rather than one
giant transaction, and a file already present at its target folder/name is
skipped — so an interrupted run can simply be re-launched.
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from app.models import File, User
from app.services.storage import FileStorage, StoredBlob
from app.services.tree_upload import attach_file_version, get_or_create_child_folder

DEFAULT_EXCLUDE_NAMES = frozenset(
    {".DS_Store", "Thumbs.db", "desktop.ini", "$RECYCLE.BIN", "System Volume Information"}
)
DEFAULT_COMMIT_EVERY = 200
DEFAULT_IO_WORKERS = 4


@dataclass
class ImportStats:
    scanned: int = 0
    imported: int = 0
    skipped_existing: int = 0
    skipped_excluded: int = 0
    bytes_imported: int = 0


def _save_path(storage: FileStorage, path: Path) -> StoredBlob:
    with path.open("rb") as f:
        return storage.save(f)


def import_directory_tree(
    db: Session,
    storage: FileStorage,
    source: Path,
    root_folder_id: int,
    user: User,
    *,
    commit_every: int = DEFAULT_COMMIT_EVERY,
    io_workers: int = DEFAULT_IO_WORKERS,
    exclude_names: frozenset[str] = DEFAULT_EXCLUDE_NAMES,
    dry_run: bool = False,
    on_progress: Callable[[ImportStats], None] | None = None,
) -> ImportStats:
    from concurrent.futures import ThreadPoolExecutor

    source = Path(source).resolve()
    stats = ImportStats()
    folder_cache: dict[tuple[str, ...], int] = {(): root_folder_id}
    pending: list[tuple[int, str, Path, int]] = []

    def flush_pending() -> None:
        if not pending:
            return
        if not dry_run:
            with ThreadPoolExecutor(max_workers=io_workers) as pool:
                blobs = list(pool.map(lambda item: _save_path(storage, item[2]), pending))
            for (folder_id, name, _path, _size), blob in zip(pending, blobs):
                attach_file_version(db, folder_id, name, blob, None, user, None)
            db.commit()
        pending.clear()
        if on_progress:
            on_progress(stats)

    for dirpath, dirnames, filenames in os.walk(source):
        dirnames[:] = sorted(d for d in dirnames if d not in exclude_names)
        rel_parts = Path(dirpath).relative_to(source).parts

        acc: tuple[str, ...] = ()
        folder_id = root_folder_id
        for seg in rel_parts:
            acc += (seg,)
            cached_id = folder_cache.get(acc)
            if cached_id is None:
                cached_id = get_or_create_child_folder(db, folder_id, seg, user.id, None).id
                folder_cache[acc] = cached_id
            folder_id = cached_id

        for fname in sorted(filenames):
            if fname in exclude_names or fname.startswith("~$"):
                stats.skipped_excluded += 1
                continue
            stats.scanned += 1
            existing = (
                db.query(File)
                .filter_by(folder_id=folder_id, name=fname, is_deleted=False)
                .first()
            )
            if existing is not None:
                stats.skipped_existing += 1
                continue

            path = Path(dirpath) / fname
            size = path.stat().st_size
            pending.append((folder_id, fname, path, size))
            stats.imported += 1
            stats.bytes_imported += size
            if len(pending) >= commit_every:
                flush_pending()

    flush_pending()
    return stats
