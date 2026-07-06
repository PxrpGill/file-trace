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
    # make_folder itself already recorded one folder_create for "Root"; measure
    # the delta caused by upload_tree rather than the raw total.
    folder_creates_before = (
        db.query(AuditLog).filter_by(action=AuditAction.folder_create).count()
    )

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
    folder_creates_after = (
        db.query(AuditLog).filter_by(action=AuditAction.folder_create).count()
    )
    assert folder_creates_after - folder_creates_before == 2
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
