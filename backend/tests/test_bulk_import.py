from pathlib import Path

from app.models import AuditAction, AuditLog, File, Folder
from app.services.bulk_import import import_directory_tree
from app.services.storage import LocalDiskStorage


def _write(path: Path, content: bytes = b"data") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_import_creates_nested_tree_with_audit(db, admin, tmp_path):
    source = tmp_path / "source"
    _write(source / "top.txt", b"top")
    _write(source / "sub" / "nested.txt", b"nested")
    _write(source / "sub" / "Thumbs.db", b"junk")

    root = Folder(name="Imported", created_by=admin.id)
    db.add(root)
    db.commit()

    storage = LocalDiskStorage(tmp_path / "blobs")
    stats = import_directory_tree(db, storage, source, root.id, admin)

    assert stats.imported == 2
    assert stats.skipped_excluded == 1

    top_file = db.query(File).filter_by(folder_id=root.id, name="top.txt").one()
    assert top_file.current_version.size == 3

    sub_folder = db.query(Folder).filter_by(parent_id=root.id, name="sub").one()
    nested_file = db.query(File).filter_by(folder_id=sub_folder.id, name="nested.txt").one()
    assert nested_file.current_version.size == 6

    upload_events = db.query(AuditLog).filter_by(action=AuditAction.file_upload).all()
    assert {e.file_id for e in upload_events} == {top_file.id, nested_file.id}
    folder_events = db.query(AuditLog).filter_by(action=AuditAction.folder_create).all()
    assert any(e.folder_id == sub_folder.id for e in folder_events)


def test_rerun_skips_already_imported_files(db, admin, tmp_path):
    source = tmp_path / "source"
    _write(source / "a.txt", b"one")

    root = Folder(name="Imported", created_by=admin.id)
    db.add(root)
    db.commit()

    storage = LocalDiskStorage(tmp_path / "blobs")
    first = import_directory_tree(db, storage, source, root.id, admin)
    assert first.imported == 1

    _write(source / "b.txt", b"two")
    second = import_directory_tree(db, storage, source, root.id, admin)

    assert second.skipped_existing == 1
    assert second.imported == 1
    assert db.query(File).filter_by(folder_id=root.id).count() == 2


def test_dry_run_writes_nothing(db, admin, tmp_path):
    source = tmp_path / "source"
    _write(source / "a.txt", b"one")

    root = Folder(name="Imported", created_by=admin.id)
    db.add(root)
    db.commit()

    storage = LocalDiskStorage(tmp_path / "blobs")
    stats = import_directory_tree(db, storage, source, root.id, admin, dry_run=True)

    assert stats.imported == 1
    assert db.query(File).count() == 0
