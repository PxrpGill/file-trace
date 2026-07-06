import io

from app.models import AuditAction, AuditLog, Folder
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

    record_a = db.query(AuditLog).filter_by(action=AuditAction.folder_create, folder_id=a.id).one()
    assert record_a.user_id == admin.id

    record_b = db.query(AuditLog).filter_by(action=AuditAction.folder_create, folder_id=b.id).one()
    assert record_b.user_id == admin.id


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

    record_upload = db.query(AuditLog).filter_by(action=AuditAction.file_upload).one()
    assert record_upload.file_id == file.id
    assert record_upload.details == {"name": "a.txt", "size": 2}

    file2 = save_file_content(
        db, storage, root.id, "a.txt", io.BytesIO(b"v2-bytes"), "text/plain", admin, None
    )
    db.commit()
    assert file2.id == file.id
    assert file2.current_version.version_no == 2

    record_version = db.query(AuditLog).filter_by(action=AuditAction.file_new_version).one()
    assert record_version.file_id == file2.id
    assert record_version.details == {"name": "a.txt", "version_no": 2, "size": 8}
